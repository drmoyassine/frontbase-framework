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
import { hashPassword, sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import * as Z from '../dist/compat/zod.gen.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
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
const runner = {
    async query(sql, params = []) {
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
        ['/api/edge-providers', '/api/edge-providers/', { name: nextFixture('provider'), provider: 'cloudflare' }],
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
        sqlTrace = [];
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
    const behaviorStatus = frameworkSpec.paths?.[path]?.[method]?.['x-implemented'] === false
        ? 'stub'
        : explicitExternal
            ? 'external-disabled'
            : meaningfulSql.length > 0 || hasSessionEffect || reflectsPrincipal
                ? 'functional'
                : 'shape-only';
    behavior.push({
        operation: label,
        status: behaviorStatus,
        evidence: meaningfulSql.length > 0
            ? `${meaningfulSql.some((entry) => entry.kind === 'exec') ? 'persisted state effect' : 'tenant-scoped state read'} (${meaningfulSql.length} SQL observation${meaningfulSql.length === 1 ? '' : 's'})`
            : hasSessionEffect
                ? 'session cookie effect'
                : reflectsPrincipal
                    ? 'response reflects authenticated principal'
                    : explicitExternal
                        ? 'runtime explicitly reports an unavailable provider/integration'
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
    const expectedBehavior = JSON.parse(
        readFileSync(join(here, '..', 'contracts', 'behavior.summary.json'), 'utf8'),
    );
    if (
        behavior.length !== total
        || behaviorFingerprint !== expectedBehavior.fingerprint
        || JSON.stringify(behaviorCounts) !== JSON.stringify(expectedBehavior.counts)
    ) {
        console.error(
            `behavior gate drift: ${behavior.length}/${total}, ${behaviorFingerprint}; `
            + `expected ${expectedBehavior.fingerprint}`,
        );
        process.exit(1);
    }
}
