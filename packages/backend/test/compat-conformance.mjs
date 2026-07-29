/**
 * CF-22 Gate 1 — response conformance, measured against the vendored contract.
 *
 * The drift gate proves route registration and static contract alignment. It
 * cannot prove that a real handler response conforms. Gate 0 proved that
 * empirically: 4 of 30 param-less GETs were violating the contract while the
 * old inventory gate was green.
 *
 * This probe drives the REAL compat app and validates REAL responses against the
 * generated Zod, so a handler that drifts from the contract shows up here.
 *
 * Every operation lands in exactly one bucket:
 *   CONFORMS     documented 2xx returned and it validates
 *   VIOLATES     documented 2xx returned and it does NOT validate  ← the number
 *   UNREACHABLE  handler answered 4xx/5xx — needs fixtures this probe lacks
 *   NO_SCHEMA    contract response has no usable generated validator/schema
 *   EXTERNAL_DISABLED  runtime explicitly says the community edition disables it
 *   STUB          framework spec marks the operation unimplemented (engine-owned)
 *
 * UNREACHABLE is honest ignorance, not a pass: it is reported separately and
 * never counted as success. Driving it to zero is Gate 1/Gate 3 work.
 */
import { createCompatApp } from '../dist/compat/app.js';
import { datasourceRunner } from '../dist/db/datasource-runner.js';
import { hashPassword, memoryStorageProvider, sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import * as Z from '../dist/compat/zod.gen.js';
import { readFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const temporaryDatabases = new Set();
function temporaryDatabaseUrl() {
    const path = join(tmpdir(), `frontbase-cf22-${crypto.randomUUID()}.db`);
    temporaryDatabases.add(path);
    return `file:${path.replaceAll('\\', '/')}`;
}
process.on('exit', () => {
    for (const path of temporaryDatabases) {
        try { unlinkSync(path); } catch { /* already absent or still locked */ }
    }
});
const spec = JSON.parse(readFileSync(join(here, '..', 'contracts', 'openapi.community.json'), 'utf8'));
const frameworkSpec = JSON.parse(readFileSync(join(here, '..', 'contracts', 'framework.openapi.json'), 'utf8'));
const deref = (node) => node?.$ref ? deref(spec.components.schemas[node.$ref.split('/').pop()]) : node;

/** Minimal body that satisfies a schema's required fields — enough to reach the handler. */
function synth(schema, depth = 0) {
    const s = deref(schema);
    if (!s || depth > 4) return {};
    if (s.default !== undefined) return s.default;
    if (s.enum) return s.enum[0];
    if (s.const !== undefined) return s.const;
    if (s.anyOf || s.oneOf) {
        const branch = (s.anyOf ?? s.oneOf).find((b) => deref(b)?.type !== 'null');
        return branch ? synth(branch, depth + 1) : null;
    }
    switch (s.type) {
        case 'string': {
            if (s.pattern) {
                const alternatives = s.pattern.match(/^\^\(([^)]+)\)\$$/)?.[1]?.split('|');
                if (alternatives?.[0]) return alternatives[0];
            }
            const value = s.format === 'date-time' ? '2026-01-01T00:00:00Z'
            : s.format === 'email' ? 'probe@example.com'
                : s.format === 'uuid' ? '11111111-1111-4111-8111-111111111111'
                    : s.format === 'uri' || s.format === 'url' ? 'https://probe.example'
                        : 'probe';
            return value.length >= (s.minLength ?? 0)
                ? value
                : value.padEnd(s.minLength, 'x');
        }
        case 'integer': case 'number': return s.minimum ?? 1;
        case 'boolean': return false;
        case 'array': return Array.from(
            { length: s.minItems ?? 0 },
            () => synth(s.items ?? {}, depth + 1),
        );
        case 'object': {
            const out = {};
            for (const key of s.required ?? []) out[key] = synth(s.properties?.[key] ?? {}, depth + 1);
            return out;
        }
        default: return {};
    }
}

const baseRunner = sqliteRunner(':memory:');
let traceEnabled = false;
let sqlTrace = [];
let providerTrace = [];
/**
 * When true, every traced read returns [] without touching the database.
 *
 * This exists to catch a DISCARDED READ: a handler that issues a query, throws the
 * result away, and returns a canned response. Such a handler used to score
 * `functional` — the classifier only asked whether SQL ran, not whether it mattered
 * — which made the ledger satisfiable by adding a pointless query. Seven
 * cloudflare/deno operations did exactly that while performing no provider action.
 *
 * Starving the reads and re-issuing the request tests the property the ledger
 * actually claims: does the response depend on stored state? Only applied to
 * operations with no write, provider, or session effect, so nothing is executed
 * twice that could mutate anything.
 */
let starveReads = false;
const runner = {
    async query(sql, params = []) {
        if (starveReads) return [];
        const rows = await baseRunner.query(sql, params);
        if (traceEnabled && !sql.includes('user_session_versions')) {
            sqlTrace.push({ kind: 'query', sql, rows: rows.length });
        }
        return rows;
    },
    async exec(sql, params = []) {
        const affected = await baseRunner.exec(sql, params);
        if (traceEnabled && !sql.includes('user_session_versions')) {
            sqlTrace.push({ kind: 'exec', sql, affected });
        }
        return affected;
    },
};
await migrateUp(runner);
const LOGIN = { email: 'conformance-owner@example.com', password: 'Conformance-only-password-1!' };
const passwordResetTokens = new Map();
const storageProvider = memoryStorageProvider();
await new UserStore(runner, '_default').createUser({
    email: LOGIN.email,
    passwordHash: await hashPassword(LOGIN.password),
    role: 'master_admin',
    now: '2026-01-01T00:00:00.000Z',
    id: 'conformance-owner',
});
// sessionSecret + userStoreFor MUST be supplied: the 20 /api/auth/* ops register
// conditionally on them, so a probe without them silently skips the entire auth
// surface — including login and the security endpoints — while still reporting a
// clean run. Configure the app the way it is actually deployed.
const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'owner', email: 'owner@example.com', role: 'master_admin' }, tenant: '_default' }),
    now: () => '2026-01-01T00:00:00.000Z',
    sessionSecret: 'conformance-probe-secret-not-for-prod',
    userStoreFor: (tenant) => new UserStore(runner, tenant),
    includeProductRoot: true,
    passwordResetDelivery: async (email, token) => {
        passwordResetTokens.set(email.toLowerCase(), token);
    },
    externalFetch: async (input, init = {}) => {
        const url = String(input);
        providerTrace.push({
            url,
            method: String(init.method ?? 'GET').toUpperCase(),
        });
        const payload = url.includes('/wp-json/frontbase/v1/discover')
            ? { post_types: [{ name: 'post' }], site: { name: 'Probe WordPress' } }
            : url.includes('/wp-json/frontbase/v1/extract/')
                ? { records: [{ id: 1, title: 'Probe post' }], total: 1, total_pages: 1 }
                : url.endsWith('/ping')
                    ? { result: 'PONG' }
                : url.includes('frontbase_list_rls_policies') || url.includes('frontbase_get_rls_status')
            ? []
            : url.includes('/rpc/frontbase_')
                ? { success: true, message: 'Provider operation completed', policies: [] }
                : { definitions: {}, tools: [], resources: [], prompts: [] };
        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    },
    storageProvider,
});

// Each operation gets its own real resource chain. A shared "last id" pool made
// the probe order-dependent: a DELETE could remove the object later GET/PUT
// operations expected, and nested ids (page versions, action versions) could not
// be represented at all. Fresh fixtures make every result independent.
const SYNTHETIC = '11111111-1111-4111-8111-111111111111';
let fixtureSerial = 0;
const nextFixture = (prefix) => `${prefix}-${++fixtureSerial}`;

async function requestJson(method, path, body) {
    const init = { method };
    if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(body);
    }
    const res = await app.fetch(new Request('http://probe.local' + path, init));
    const responseBody = await res.clone().json().catch(() => null);
    return { res, body: responseBody };
}

async function createFixture(path, body) {
    const created = await requestJson('POST', path, body);
    if (!created.res.ok) {
        throw new Error(`fixture ${path} returned ${created.res.status}`);
    }
    return created.body;
}

const fixtureId = (body) =>
    body?.id
    ?? body?.execution_id
    ?? body?.data?.id
    ?? body?.bucket?.id
    ?? body?.version?.id
    ?? null;

async function prepareFixture(path, method, op) {
    const params = {};
    let body;

    if (path === '/api/settings/redis/test/') {
        await requestJson('PUT', '/api/settings/redis/', {
            redis_url: 'https://probe.example',
            redis_token: 'probe-upstash-token',
            redis_type: 'upstash',
            redis_enabled: true,
            cache_ttl_data: 300,
            cache_ttl_count: 300,
        });
    }

    if (path.includes('{draft_id}')) {
        const draft = await createFixture('/api/actions/drafts', { name: nextFixture('draft'), nodes: [], edges: [] });
        params.draft_id = fixtureId(draft);
        if (path.includes('{version_id}')) {
            const version = await createFixture(
                `/api/actions/drafts/${params.draft_id}/versions/`,
                { label: nextFixture('version') },
            );
            params.version_id = fixtureId(version);
        }
    }

    if (path.includes('{execution_id}')) {
        const draft = await createFixture('/api/actions/drafts', {
            name: nextFixture('execution-draft'),
            nodes: [],
            edges: [],
        });
        const execution = await createFixture(
            `/api/actions/drafts/${fixtureId(draft)}/test`,
            {},
        );
        params.execution_id = fixtureId(execution);
    }

    if (path === '/api/actions/drafts/bulk-delete') {
        const draft = await createFixture('/api/actions/drafts', {
            name: nextFixture('bulk-draft'),
            nodes: [],
            edges: [],
        });
        body = { ids: [fixtureId(draft)] };
    }

    if (path.startsWith('/api/pages/') && (path.includes('{page_id}') || path.includes('{slug}') || path === '/api/pages/homepage/')) {
        const slug = nextFixture('page');
        const page = await createFixture('/api/pages/', { name: slug, slug, title: slug });
        params.page_id = fixtureId(page);
        params.slug = slug;

        if (path === '/api/pages/homepage/') {
            await requestJson('PUT', `/api/pages/${params.page_id}/`, { isHomepage: true });
        }
        if (path.includes('{version_id}')) {
            const version = await createFixture(
                `/api/pages/${params.page_id}/versions/`,
                { label: nextFixture('version') },
            );
            params.version_id = fixtureId(version);
        }
        if (path.endsWith('/rollback/')) {
            const version = await createFixture(
                `/api/pages/${params.page_id}/versions/`,
                { label: nextFixture('version') },
            );
            body = { version_id: fixtureId(version) };
        }
    }

    if (path.includes('{variable_id}')) {
        const variable = await createFixture('/api/variables/', {
            name: nextFixture('variable'),
            type: 'variable',
            value: 'fixture',
        });
        params.variable_id = fixtureId(variable);
    }

    if (path.startsWith('/api/auth-forms/') && (path.includes('{form_id}') || path === '/api/auth-forms/primary/')) {
        const form = await createFixture('/api/auth-forms/', {
            name: nextFixture('form'),
            type: 'login',
            config: {},
        });
        params.form_id = fixtureId(form);
        if (path === '/api/auth-forms/primary/') {
            await requestJson('PUT', `/api/auth-forms/${params.form_id}/set-primary/`);
        }
    }

    const edgeFixtures = [
        ['/api/edge-api-keys', '/api/edge-api-keys', { name: nextFixture('key'), scope: 'user' }],
        ['/api/edge-caches', '/api/edge-caches/', { name: nextFixture('cache'), provider: 'upstash', cache_url: 'https://probe.example' }],
        ['/api/edge-databases', '/api/edge-databases/', { name: nextFixture('database'), provider: 'turso', db_url: 'https://probe.example' }],
        ['/api/edge-engines', '/api/edge-engines/', { name: nextFixture('engine'), url: 'https://probe.example' }],
        ['/api/edge-providers', '/api/edge-providers/', {
            name: nextFixture('provider'),
            provider: 'cloudflare',
            provider_credentials: {
                token: 'probe-token',
                url: 'https://probe.example',
            },
        }],
        ['/api/edge-queues', '/api/edge-queues/', { name: nextFixture('queue'), provider: 'qstash', queue_url: 'https://probe.example' }],
        ['/api/edge-vectors', '/api/edge-vectors/', { name: nextFixture('vector'), provider: 'turso', vector_url: 'https://probe.example' }],
    ];
    for (const [prefix, createPath, createBody] of edgeFixtures) {
        if (!path.startsWith(prefix) || !path.includes('{')) continue;
        const resource = await createFixture(createPath, createBody);
        const id = fixtureId(resource);
        for (const name of ['key_id', 'cache_id', 'db_id', 'engine_id', 'provider_id', 'account_id', 'queue_id', 'vector_id']) {
            if (path.includes(`{${name}}`)) params[name] = id;
        }
        break;
    }

    const edgeBatchFixtures = [
        ['/api/edge-caches/batch/delete', '/api/edge-caches/', { name: nextFixture('cache-batch'), provider: 'upstash', cache_url: 'https://probe.example' }],
        ['/api/edge-databases/batch/delete', '/api/edge-databases/', { name: nextFixture('database-batch'), provider: 'turso', db_url: 'https://probe.example' }],
        ['/api/edge-queues/batch/delete', '/api/edge-queues/', { name: nextFixture('queue-batch'), provider: 'qstash', queue_url: 'https://probe.example' }],
        ['/api/edge-vectors/batch/delete', '/api/edge-vectors/', { name: nextFixture('vector-batch'), provider: 'turso', vector_url: 'https://probe.example' }],
    ];
    for (const [targetPath, createPath, createBody] of edgeBatchFixtures) {
        if (path !== targetPath) continue;
        const resource = await createFixture(createPath, createBody);
        body = { ids: [fixtureId(resource)] };
    }
    if (path.startsWith('/api/edge-engines/batch/')) {
        const resource = await createFixture('/api/edge-engines/', {
            name: nextFixture('engine-batch'),
            url: 'https://probe.example',
        });
        body = {
            engine_ids: [fixtureId(resource)],
            ...(path.endsWith('/toggle') ? { is_active: false } : {}),
        };
    }

    if (path.startsWith('/api/storage/')) {
        if (path.includes('{provider_id}')) params.provider_id = 'local';
        if (path.includes('{job_id}')) params.job_id = 'test-job';
        if (path === '/api/storage/public-url' || path === '/api/storage/signed-url') {
            await runner.exec(
                `INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?)
                 ON CONFLICT(tenant_slug, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
                ['_default', 'storage_providers', JSON.stringify([{ id: 'probe', name: 'Probe' }]), '2026-01-01T00:00:00.000Z'],
            );
        }
        if (path === '/api/storage/compute-size') {
            const bucketId = nextFixture('size-bucket');
            await runner.exec(
                'INSERT INTO storage_buckets (id, tenant_slug, name, provider, created_at) VALUES (?,?,?,?,?)',
                [bucketId, '_default', 'Size fixture', 'local', '2026-01-01T00:00:00.000Z'],
            );
            await runner.exec(
                'INSERT INTO storage_files (id, tenant_slug, bucket_id, path, name, size, mime_type, created_at) VALUES (?,?,?,?,?,?,?,?)',
                [crypto.randomUUID(), '_default', bucketId, '/sized.txt', 'sized.txt', 42, 'text/plain', '2026-01-01T00:00:00.000Z'],
            );
        }
    }

    if (path === '/api/storage/move' || path === '/api/storage/move-cross' || path.includes('/api/storage/move-status/')) {
        const id = crypto.randomUUID();
        const sourceBucket = nextFixture('source-bucket');
        const sourcePath = '/source.txt';
        await storageProvider.put({
            bucket: sourceBucket,
            key: sourcePath,
            bytes: new TextEncoder().encode('storage move fixture'),
            contentType: 'text/plain',
        });
        await runner.exec(
            'INSERT INTO storage_files (id, tenant_slug, bucket_id, path, name, size, mime_type, created_at) VALUES (?,?,?,?,?,?,?,?)',
            [id, '_default', sourceBucket, sourcePath, 'source.txt', 20, 'text/plain', '2026-01-01T00:00:00.000Z'],
        );
        if (path === '/api/storage/move') {
            body = { file_id: id, bucket_id: sourceBucket, from_path: sourcePath, to_path: '/moved.txt' };
        } else {
            const moveBody = { file_id: id, source_bucket_id: sourceBucket, target_bucket_id: nextFixture('target-bucket') };
            if (path === '/api/storage/move-cross') {
                body = moveBody;
            } else {
                const moved = await createFixture('/api/storage/move-cross', moveBody);
                params.job_id = moved.data?.job_id;
                if (!params.job_id) throw new Error('storage move fixture did not return a job id');
            }
        }
    }

    if (path.startsWith('/api/database/rls/')) {
        if (path.includes('{table_name}')) params.table_name = 'published_pages';
        if (path.includes('{policy_name}')) params.policy_name = 'policy_default';
    }

    if (path.startsWith('/api/storage/buckets/{bucket_id}')) {
        const bucket = await createFixture('/api/storage/buckets?provider_id=probe', {
            name: nextFixture('bucket'),
            provider: 'local',
        });
        params.bucket_id = fixtureId(bucket);
    }

    if (path.startsWith('/api/mcp-servers/{server_id}')) {
        const server = await createFixture('/api/mcp-servers', {
            name: nextFixture('mcp'),
            slug: nextFixture('mcp'),
            url: 'https://probe.example/mcp',
            transport: 'http',
        });
        params.server_id = fixtureId(server);
    }

    if (path.startsWith('/api/agent-skills/{skill_id}')) {
        const skill = await createFixture('/api/agent-skills', {
            name: nextFixture('skill'),
            slug: nextFixture('skill'),
            tool_definitions: [],
        });
        params.skill_id = fixtureId(skill);
    }

    if (path.startsWith('/api/agent-profiles/{profile_id}/skills')) {
        const engine = await createFixture('/api/edge-engines/', {
            name: nextFixture('agent-engine'),
            url: 'https://probe.example',
        });
        const profile = await createFixture(`/api/edge-engines/${fixtureId(engine)}/agent-profiles`, {
            name: nextFixture('agent-profile'),
            slug: nextFixture('agent-profile'),
            role: 'assistant',
        });
        const skill = await createFixture('/api/agent-skills', {
            name: nextFixture('profile-skill'),
            slug: nextFixture('profile-skill'),
            tool_definitions: [],
        });
        params.profile_id = fixtureId(profile);
        body = { skill_id: fixtureId(skill) };
        if (path.includes('{install_id}')) {
            await createFixture(`/api/agent-profiles/${params.profile_id}/skills`, body);
            const installed = await requestJson('GET', `/api/agent-profiles/${params.profile_id}/skills`);
            params.install_id = installed.body?.skills?.[0]?.installId;
            if (!params.install_id) throw new Error('profile-skill fixture was not persisted');
            body = undefined;
        }
    }

    if (path.startsWith('/api/edge-gpu/{model_id}')) {
        const engine = await createFixture('/api/edge-engines/', {
            name: nextFixture('gpu-engine'),
            url: 'https://probe.example',
        });
        const model = await createFixture('/api/edge-gpu/', {
            name: nextFixture('gpu'),
            model_type: 'text',
            provider: 'cloudflare',
            model_id: nextFixture('model'),
            edge_engine_id: fixtureId(engine),
        });
        params.model_id = fixtureId(model);
    }

    if (path.startsWith('/api/themes/{theme_id}')) {
        const theme = await createFixture('/api/themes/', {
            name: nextFixture('theme'),
            component_type: 'DataTable',
            styles_data: {},
        });
        params.theme_id = fixtureId(theme);
    }

    if (path.startsWith('/api/sync/')) {
        if (path.includes('{datasource_id}')) {
            let fixture;
            if (path.endsWith('/wordpress/discover/')) {
                fixture = {
                    name: nextFixture('wordpress-ds'),
                    type: 'wordpress_plugin',
                    config: { api_url: 'https://wordpress.example', username: 'probe', app_password: 'probe-secret' },
                };
            } else if (path.endsWith('/check-migration') || path.endsWith('/apply-migration')) {
                fixture = {
                    name: nextFixture('supabase-ds'),
                    type: 'supabase',
                    config: {
                        url: 'https://probe.example',
                        serviceKey: 'probe-service-key',
                        migrationSql: 'SELECT 1',
                    },
                };
            } else {
                const dbFile = temporaryDatabaseUrl();
                const dsRunner = datasourceRunner('sqlite', { url: dbFile });
                await dsRunner.exec('CREATE TABLE IF NOT EXISTS published_pages (id TEXT PRIMARY KEY, slug TEXT, title TEXT)');
                await dsRunner.exec("INSERT OR IGNORE INTO published_pages (id, slug, title) VALUES ('rec-1', 'home', 'Home Page')");
                fixture = {
                    name: nextFixture('sync-ds'),
                    type: 'sqlite',
                    config: { url: dbFile },
                };
            }
            const ds = await createFixture('/api/sync/datasources/', fixture);
            params.datasource_id = ds.id;
        }
        if (path.includes('{table_name}')) params.table_name = 'published_pages';
        if (path.includes('{table}')) params.table = 'published_pages';
        if (path.includes('{column}')) params.column = 'slug';
        if (path.includes('{record_id}')) params.record_id = 'rec-1';
        if (path.includes('/relationships/')) {
            const relationship = {
                from_table: 'published_pages',
                from_column: 'slug',
                to_table: 'published_pages',
                to_column: 'id',
                relationship_type: 'many_to_one',
            };
            if (path.includes('{index}')) {
                const created = await createFixture(
                    `/api/sync/datasources/${params.datasource_id}/relationships/`,
                    relationship,
                );
                params.index = String(created.index);
            }
            if (method === 'post' || method === 'put') body = relationship;
        }
        if (path === '/api/sync/wordpress/import/' || path.includes('{import_id}')) {
            const wpDatasource = await createFixture('/api/sync/datasources/', {
                name: nextFixture('wordpress-import'),
                type: 'wordpress_plugin',
                config: { api_url: 'https://wordpress.example', username: 'probe', app_password: 'probe-secret' },
            });
            if (path === '/api/sync/wordpress/import/') {
                body = { datasource_id: wpDatasource.id, options: { postTypes: ['post'] } };
            } else {
                const started = await createFixture('/api/sync/wordpress/import/', {
                    datasource_id: wpDatasource.id,
                    options: { postTypes: ['post'] },
                });
                params.import_id = started.import_id;
            }
        }
        if (path === '/api/sync/datasources/{datasource_id}/tables/{table}/records/') {
            body = { id: nextFixture('rec'), slug: 'test-slug', title: 'Test Title' };
        }
        if (path === '/api/sync/datasources/{datasource_id}/views/' && method === 'post') {
            body = { name: nextFixture('view'), target_table: 'published_pages' };
        }
        if (path.includes('{view_id}')) {
            let dsId = params.datasource_id;
            if (!dsId) {
                const dbFile = temporaryDatabaseUrl();
                const dsRunner = datasourceRunner('sqlite', { url: dbFile });
                await dsRunner.exec('CREATE TABLE IF NOT EXISTS published_pages (id TEXT PRIMARY KEY, slug TEXT, title TEXT)');
                await dsRunner.exec("INSERT OR IGNORE INTO published_pages (id, slug, title) VALUES ('rec-1', 'home', 'Home Page')");

                const ds = await createFixture('/api/sync/datasources/', {
                    name: nextFixture('sync-ds'),
                    type: 'sqlite',
                    config: {
                        url: dbFile,
                        relationships: [{ from: 'published_pages.slug', to: 'drafts.slug' }],
                    },
                });
                dsId = ds.id;
            }
            const view = await createFixture(`/api/sync/datasources/${dsId}/views/`, {
                name: nextFixture('view'),
                target_table: 'published_pages',
            });
            params.view_id = view.id;
            if (path === '/api/sync/views/{view_id}/records' && method === 'post') {
                body = { id: nextFixture('view-rec'), slug: 'view-created', title: 'View Created' };
            }
            if (path === '/api/sync/views/{view_id}/records' && method === 'patch') {
                body = { id: 'rec-1', title: 'View Updated' };
            }
        }
        if (
            path === '/api/sync/datasources/sheets/connect/callback/'
            || path === '/api/sync/datasources/sheets/connect/status/'
        ) {
            const issued = await createFixture('/api/sync/datasources/sheets/connect/issue/', {});
            params.sheets_token = issued.token;
            if (path.endsWith('/callback/')) {
                body = {
                    token: issued.token,
                    spreadsheetId: 'probe-sheet-id',
                    spreadsheetName: 'Probe Sheet',
                    webAppUrl: 'https://script.google.com/macros/s/probe/exec',
                    webAppSecret: 'probe-sheet-secret',
                };
            }
        }
    }

    if (path.startsWith('/api/database/') && !path.startsWith('/api/database/rls/')) {
        await runner.exec('DELETE FROM datasources WHERE tenant_slug = ?', ['_default']);
        if (
            path === '/api/database/advanced-query/'
            || path === '/api/database/connections/'
        ) {
            await createFixture('/api/sync/datasources/', {
                name: nextFixture('database-supabase'),
                type: 'supabase',
                config: {
                    url: 'https://probe.example',
                    anonKey: 'probe-anon-key',
                    serviceKey: 'probe-service-key',
                },
            });
        } else {
            const dbFile = temporaryDatabaseUrl();
            const dsRunner = datasourceRunner('sqlite', { url: dbFile });
            await dsRunner.exec('CREATE TABLE IF NOT EXISTS published_pages (id TEXT PRIMARY KEY, slug TEXT, title TEXT)');
            await dsRunner.exec("INSERT OR IGNORE INTO published_pages (id, slug, title) VALUES ('rec-1', 'home', 'Home Page')");
            await createFixture('/api/sync/datasources/', {
                name: nextFixture('database-ds'),
                type: 'sqlite',
                config: { url: dbFile },
            });
        }
        if (path.includes('{table_name}')) params.table_name = 'published_pages';
        if (path === '/api/database/distinct-values/') {
            body = { tableName: 'published_pages', column: 'slug' };
        }
        if (path === '/api/database/advanced-query/') {
            body = { rpcName: 'frontbase_get_schema_info', params: {} };
        }
        if (path === '/api/database/test-supabase/') {
            body = { url: 'https://probe.example', anonKey: 'probe-anon-key' };
        }
    }

    if (path.startsWith('/api/database/rls/')) {
        await runner.exec('DELETE FROM datasources WHERE tenant_slug = ?', ['_default']);
        await createFixture('/api/sync/datasources/', {
            name: nextFixture('rls-supabase'),
            type: 'supabase',
            config: {
                url: 'https://probe.example',
                serviceKey: 'probe-service-key',
            },
        });
        if (path === '/api/database/rls/metadata/{table_name}/{policy_name}') {
            await createFixture('/api/database/rls/metadata/', {
                tableName: 'published_pages',
                policyName: 'policy_default',
                formData: {},
            });
        }
        if (path === '/api/database/rls/bulk-delete/') {
            body = { policies: [{ tableName: 'published_pages', policyName: 'policy_default' }] };
        }
    }

    if (path === '/api/edge-caches/test-connection') {
        body = { name: 'probe-cache', provider: 'upstash', cache_url: 'https://probe.example/cache' };
    }
    if (path === '/api/edge-queues/test-connection') {
        body = { provider: 'qstash', queue_url: 'https://probe.example/queue' };
    }
    if (path === '/api/edge-vectors/test-connection') {
        body = { provider: 'vectorize', vector_url: 'https://probe.example/vector' };
    }
    if (path === '/api/edge-databases/test-connection') {
        body = { name: 'probe-db', provider: 'supabase', db_url: 'https://probe.example/database' };
    }
    if (path === '/api/edge-databases/discover-schemas') {
        body = { provider: 'supabase', db_url: 'https://probe.example/database' };
    }
    if (path === '/api/edge-databases/create-schema') {
        body = { provider: 'supabase', db_url: 'https://probe.example/database', suffix: 'probe' };
    }
    if (path === '/api/edge-databases/reset-role-password') {
        body = {
            provider_account_id: 'probe-account',
            db_url: 'https://probe.example/database',
            schema_name: 'frontbase_edge_probe',
        };
    }
    if (path === '/api/edge-providers/test-connection') {
        body = { provider: 'cloudflare', credentials: { token: 'probe-token' } };
    }
    if (path === '/api/edge-providers/workspace-agent-token' && method === 'post') {
        const provider = await createFixture('/api/edge-providers/', {
            name: nextFixture('workspace-provider'),
            provider: 'openai',
            provider_credentials: { token: 'probe-token' },
        });
        body = { provider_id: fixtureId(provider) };
    }

    if (path === '/api/storage/delete') {
        const id = crypto.randomUUID();
        await runner.exec(
            'INSERT INTO storage_files (id, tenant_slug, bucket_id, path, name, size, mime_type, created_at) VALUES (?,?,?,?,?,?,?,?)',
            [id, '_default', 'probe-bucket', '/probe.txt', 'probe.txt', 1, 'text/plain', '2026-01-01T00:00:00.000Z'],
        );
        body = { file_id: id };
    }

    if (path === '/api/auth/login') body = LOGIN;
    if (path === '/api/auth/reset-password') {
        await requestJson('POST', '/api/auth/forgot-password', { email: LOGIN.email });
        const token = passwordResetTokens.get(LOGIN.email.toLowerCase());
        if (!token) throw new Error('password-reset fixture was not delivered');
        body = {
            email: LOGIN.email,
            password: 'Conformance-reset-password-2!',
            token,
        };
    }
    if (path === '/api/auth/accept-invite' || path.startsWith('/api/auth/invite/')) {
        const invite = await createFixture('/api/settings/invites', {
            email: `${nextFixture('invite')}@example.com`,
            role: 'admin',
        });
        params.token = invite.token;
        if (path === '/api/auth/accept-invite') {
            body = { token: invite.token, password: 'Conformance-invite-password-1!' };
        }
    }
    if (path === '/api/auth/security/blocklist/{ban_id}') {
        const created = await requestJson('POST', '/api/auth/security/blocklist', {
            ip_or_range: '192.0.2.1',
            reason: 'conformance fixture',
        });
        const list = await requestJson('GET', '/api/auth/security/blocklist');
        params.ban_id = list.body?.[0]?.id;
        if (!created.res.ok || !params.ban_id) throw new Error('blocklist fixture was not persisted');
    }
    if (path === '/api/variables/' && method === 'post') {
        body = { name: nextFixture('variable'), type: 'variable', value: 'fixture' };
    }

    for (const parameter of op.parameters ?? []) {
        if (parameter.in === 'path' && params[parameter.name] === undefined) {
            params[parameter.name] = String(synth(parameter.schema));
        }
    }

    const query = new URLSearchParams();
    for (const parameter of op.parameters ?? []) {
        if (parameter.in === 'query' && parameter.required) {
            query.set(parameter.name, String(synth(parameter.schema)));
        }
    }
    if (path === '/api/sync/datasources/sheets/connect/status/' && params.sheets_token) {
        query.set('token', params.sheets_token);
    }
    if (path === '/api/sync/datasources/{datasource_id}/tables/{table}/aggregate/') {
        query.set('category', 'slug');
        query.set('aggregation', 'count');
    }
    return { params, body, query };
}

function fillPath(path, params) {
    return path.replace(/\{([^}]+)\}/g, (_, name) => params[name] ?? SYNTHETIC);
}

const pascalCase = (value) =>
    value
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join('');
const zodForOperation = (op) => Z[`z${pascalCase(op.operationId)}Response`];
const buckets = {
    CONFORMS: [],
    VIOLATES: [],
    UNREACHABLE: [],
    NO_SCHEMA: [],
    EXTERNAL_DISABLED: [],
    STUB: [],
};

const entries = [];
const behavior = [];
for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
        if (!['get', 'post', 'put', 'patch', 'delete', 'options'].includes(method)) continue;
        entries.push({ path, method, op });
    }
}
for (const { path, method, op } of entries) {
    const resp = Object.entries(op.responses ?? {}).find(([c]) => c.startsWith('2'));
    const label = `${method.toUpperCase()} ${path}`;

    let res;
    // Captured so the classifier can replay the exact request with reads starved.
    // These were previously block-scoped inside the try, so the replay referenced
    // undefined bindings and its catch silently swallowed the ReferenceError.
    let replay = null;
    try {
        const fixture = await prepareFixture(path, method, op);
        const init = { method: method.toUpperCase() };
        if (op.requestBody) {
            const jsonSchema = op.requestBody.content?.['application/json']?.schema;
            const multipartSchema = op.requestBody.content?.['multipart/form-data']?.schema;
            if (multipartSchema) {
                const form = new FormData();
                for (const [name, value] of Object.entries(synth(multipartSchema))) {
                    if (name === 'file') {
                        form.set(name, new Blob(['probe'], { type: 'text/plain' }), 'probe.txt');
                    } else {
                        form.set(name, String(value));
                    }
                }
                init.body = form;
            } else {
                init.headers = { 'content-type': 'application/json' };
                init.body = JSON.stringify(fixture.body ?? synth(jsonSchema));
            }
        }
        const requestPath = fillPath(path, fixture.params);
        const query = fixture.query.toString();
        replay = { requestPath, query, init };
        sqlTrace = [];
        providerTrace = [];
        traceEnabled = true;
        res = await app.fetch(new Request(`http://probe.local${requestPath}${query ? `?${query}` : ''}`, init));
        traceEnabled = false;
    } catch (e) {
        traceEnabled = false;
        buckets.UNREACHABLE.push(`${label} — threw: ${e.message}`);
        continue;
    }

    const rawBody = await res.clone().text();
    let jsonBody = null;
    if (rawBody) {
        try {
            jsonBody = JSON.parse(rawBody);
        } catch {
            // Text and streaming responses are validated as strings below.
        }
    }

    const explicitExternal = res.headers.has('x-frontbase-external-disabled')
        || /not configured|no [^"]*(provider|datasource|connection|runtime)|not available in the community edition|integration not configured/i
            .test(rawBody);
    const meaningfulSql = sqlTrace.filter((entry) =>
        entry.kind === 'query' || (entry.kind === 'exec' && entry.affected > 0));
    const hasSessionEffect = res.headers.has('set-cookie');
    const reflectsPrincipal = label === 'GET /api/auth/me'
        && rawBody.includes('owner@example.com');
    const hasProviderEffect = providerTrace.length > 0;
    const hasWriteEffect = meaningfulSql.some((entry) => entry.kind === 'exec');

    // A read-only operation counts as functional only if its reads actually shape the
    // response. Re-issue it with reads starved to [] and compare: an identical body
    // means the query was discarded and the handler is really returning a constant.
    // Volatile tokens are normalised out so a per-request uuid or timestamp does not
    // masquerade as state-dependence.
    let readsDiscarded = false;
    // Only conclusive when the real run's reads actually RETURNED rows. If every query
    // came back empty, starving them changes nothing and an identical response proves
    // nothing — a genuine list endpoint over an empty table would be wrongly demoted.
    const readReturnedRows = meaningfulSql.some((entry) => entry.kind === 'query' && entry.rows > 0);
    const readOnlyCandidate = readReturnedRows
        && !hasWriteEffect && !hasProviderEffect && !hasSessionEffect && !reflectsPrincipal;
    if (readOnlyCandidate && replay) {
        const volatile = (text) => text
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
            .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<ts>');
        try {
            starveReads = true;
            const starved = await app.fetch(new Request(
                `http://probe.local${replay.requestPath}${replay.query ? `?${replay.query}` : ''}`,
                replay.init,
            ));
            const starvedBody = await starved.text();
            readsDiscarded = starved.status === res.status
                && volatile(starvedBody) === volatile(rawBody);
        } catch {
            readsDiscarded = false; // erroring without rows means the read mattered
        } finally {
            starveReads = false;
        }
    }

    const behaviorStatus = frameworkSpec.paths?.[path]?.[method]?.['x-implemented'] === false
        ? 'stub'
        : explicitExternal
            ? 'external-disabled'
            : hasWriteEffect || hasProviderEffect || hasSessionEffect || reflectsPrincipal
                ? 'functional'
                : meaningfulSql.length > 0 && !readsDiscarded
                    ? 'functional'
                    : 'shape-only';
    behavior.push({
        operation: label,
        status: behaviorStatus,
        // An unavailable integration remains unavailable even if the handler
        // persists a local audit/attempt row. Incidental SQL must never make
        // the evidence contradict the classification (CF-22 Work E1).
        evidence: explicitExternal
            ? 'runtime explicitly reports an unavailable provider/integration'
            : readsDiscarded
            ? `read result DISCARDED — response identical with reads starved (${meaningfulSql.length} SQL observation${meaningfulSql.length === 1 ? '' : 's'} had no effect)`
            : hasProviderEffect
                ? `provider effect (${providerTrace.length} outbound request${providerTrace.length === 1 ? '' : 's'})`
                : hasSessionEffect
                ? 'session cookie effect'
                : reflectsPrincipal
                    ? 'response reflects authenticated principal'
                    : meaningfulSql.length > 0
                        ? `${hasWriteEffect ? 'persisted state effect' : 'tenant-scoped state read reflected in the response'} (${meaningfulSql.length} SQL observation${meaningfulSql.length === 1 ? '' : 's'})`
                        : 'no state, session, or provider effect observed',
    });

    if (!String(res.status).startsWith('2')) {
        if (frameworkSpec.paths?.[path]?.[method]?.['x-implemented'] === false) {
            buckets.STUB.push(`${label} → ${res.status}`);
        } else if (
            res.status === 400
            && typeof jsonBody?.detail === 'string'
            && jsonBody.detail.includes('not available in the community edition')
        ) {
            buckets.EXTERNAL_DISABLED.push(`${label} → ${res.status}`);
        } else {
            buckets.UNREACHABLE.push(`${label} → ${res.status}`);
        }
        continue;
    }

    if (!resp) {
        buckets.NO_SCHEMA.push(`${label} (no documented 2xx response)`);
        continue;
    }
    const [documentedStatus, responseContract] = resp;
    const content = responseContract.content ?? {};
    const documentedMediaTypes = Object.keys(content);
    let value;
    let contractLabel;

    if (documentedMediaTypes.length === 0) {
        if (rawBody.length !== 0) {
            buckets.VIOLATES.push(
                `${label} → bodyless ${documentedStatus} response returned ${rawBody.length} bytes`,
            );
            continue;
        }
        buckets.CONFORMS.push(label);
        continue;
    } else {
        const actualMediaType = (res.headers.get('content-type') ?? '')
            .split(';', 1)[0]
            .trim()
            .toLowerCase();
        const documentedMediaType = documentedMediaTypes.find(
            (mediaType) => mediaType.toLowerCase() === actualMediaType,
        );
        if (!documentedMediaType) {
            buckets.VIOLATES.push(
                `${label} → content-type ${actualMediaType || '(missing)'}; `
                + `contract documents ${documentedMediaTypes.join(', ')}`,
            );
            continue;
        }
        if (!content[documentedMediaType]?.schema) {
            buckets.NO_SCHEMA.push(
                `${label} (${documentedMediaType} has no response schema)`,
            );
            continue;
        }

        if (documentedMediaType.toLowerCase() === 'application/json') {
            if (rawBody && jsonBody === null) {
                buckets.VIOLATES.push(`${label} → response is not valid JSON`);
                continue;
            }
            value = jsonBody;
        } else {
            value = rawBody;
        }
        contractLabel = documentedMediaType;
    }

    const zod = zodForOperation(op);
    if (!zod) {
        buckets.NO_SCHEMA.push(
            `${label} (no generated operation validator for ${op.operationId})`,
        );
        continue;
    }

    const parsed = zod.safeParse(value);
    if (parsed.success) buckets.CONFORMS.push(label);
    else {
        const issue = parsed.error.issues?.[0];
        buckets.VIOLATES.push(
            `${label} → ${contractLabel}: `
            + `${issue?.path?.join('.') || '(root)'} ${issue?.message}`,
        );
    }
}

const total = entries.length;
const measured = buckets.CONFORMS.length + buckets.VIOLATES.length;
const behaviorCounts = Object.fromEntries(
    ['functional', 'shape-only', 'external-disabled', 'stub']
        .map((status) => [status, behavior.filter((entry) => entry.status === status).length]),
);
const behaviorFingerprint = createHash('sha256')
    .update(
        behavior
            .map((entry) => `${entry.operation}\t${entry.status}`)
            .sort()
            .join('\n'),
    )
    .digest('hex');
console.log(`\ncompat conformance — ${total} operations\n`);
console.log(`  CONFORMS    ${String(buckets.CONFORMS.length).padStart(3)}`);
console.log(`  VIOLATES    ${String(buckets.VIOLATES.length).padStart(3)}   ← contract divergence the drift gate cannot see`);
console.log(`  UNREACHABLE ${String(buckets.UNREACHABLE.length).padStart(3)}   (needs fixtures — NOT a pass)`);
console.log(`  NO_SCHEMA   ${String(buckets.NO_SCHEMA.length).padStart(3)}   (missing usable response contract/validator)`);
console.log(`  EXTERNAL_DISABLED ${String(buckets.EXTERNAL_DISABLED.length).padStart(3)}   (runtime-explicit community limitation)`);
console.log(`  STUB        ${String(buckets.STUB.length).padStart(3)}   (framework spec marks unimplemented)`);
console.log(`\n  measured: ${measured}/${total} (${((measured / total) * 100).toFixed(0)}%)`);

if (process.argv.includes('--behavior')) {
    console.log('\nbehavior classification (runtime-derived):');
    for (const [status, count] of Object.entries(behaviorCounts)) {
        console.log(`  ${status.padEnd(18)} ${String(count).padStart(3)}`);
    }
    console.log(`  fingerprint        ${behaviorFingerprint}`);
    if (process.argv.includes('--verbose')) {
        for (const entry of behavior.filter((item) => item.status !== 'functional')) {
            console.log(`  · ${entry.status}: ${entry.operation} — ${entry.evidence}`);
        }
    }
}

if (buckets.VIOLATES.length) {
    console.log('\nVIOLATIONS:');
    for (const v of buckets.VIOLATES) console.log(`  ✗ ${v}`);
}
if (process.argv.includes('--verbose') && buckets.UNREACHABLE.length) {
    console.log('\nUNREACHABLE:');
    for (const u of buckets.UNREACHABLE) console.log(`  · ${u}`);
}

// Reporting mode by default; CI additionally requires that every enabled
// in-scope compat operation with a documented response is reachable and conformant.
if (
    process.argv.includes('--gate')
    && (
        buckets.VIOLATES.length > 0
        || buckets.UNREACHABLE.length > 0
        || buckets.NO_SCHEMA.length > 0
    )
) {
    process.exit(1);
}
if (process.argv.includes('--behavior-gate')) {
    const expectedLedger = JSON.parse(
        readFileSync(join(here, '..', 'contracts', 'behavior.ledger.json'), 'utf8'),
    );
    let drift = false;
    for (const { operation, status, evidence } of behavior) {
        const expected = expectedLedger[operation];
        if (
            !expected
            || typeof expected !== 'object'
            || expected.status !== status
            || expected.evidence !== evidence
        ) {
            console.error(
                `behavior drift: ${operation} is ${status} (${evidence}), expected `
                + `${JSON.stringify(expected)}`,
            );
            drift = true;
        }
    }
    if (behavior.length !== total || Object.keys(expectedLedger).length !== total) {
        console.error(
            `behavior drift: measured ${behavior.length} operations and ledger has `
            + `${Object.keys(expectedLedger).length}; expected ${total}`,
        );
        drift = true;
    }
    if (drift) {
        process.exit(1);
    }
}

if (process.argv.includes('--dump-ledger')) {
    const ledger = {};
    for (const { operation, status, evidence } of behavior) {
        ledger[operation] = { status, evidence };
    }
    // Set OPTIONS endpoints if missing
    for (const path of Object.keys(frameworkSpec.paths ?? {})) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options']) {
            if (frameworkSpec.paths[path]?.[method]) {
                const op = method.toUpperCase() + ' ' + path;
                if (!ledger[op]) {
                    ledger[op] = { status: 'undefined', evidence: 'operation was not measured' };
                }
            }
        }
    }
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(here, '..', 'contracts', 'behavior.ledger.json'), JSON.stringify(ledger, null, 2));
    console.log('Ledger dumped successfully.');
}

if (process.argv.includes('--require-functional')) {
    const nonFunctional = behavior.filter(({ status }) => status !== 'functional');
    if (nonFunctional.length > 0 || behaviorCounts.functional !== total) {
        console.error(
            `closure behavior gate failed: ${behaviorCounts.functional}/${total} functional; `
            + `${nonFunctional.length} operations remain non-functional`,
        );
        for (const entry of nonFunctional) {
            console.error(`  - ${entry.status}: ${entry.operation} — ${entry.evidence}`);
        }
        process.exit(1);
    }
}
