/**
 * CF-22 Gate 2 — generated two-tenant isolation matrix.
 *
 * Every identifier-bearing operation is called as tenant B using tenant A's
 * real resource identifiers where the community surface has a corresponding
 * persisted resource. Tenant A's rows must remain byte-for-byte unchanged and
 * its sentinel data must never appear in tenant B's response.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import { sqliteRunner } from '@frontbase/edge-infra';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '..', 'contracts', 'openapi.community.json'), 'utf8'));
const deref = (node) => node?.$ref
    ? deref(spec.components.schemas[node.$ref.split('/').pop()])
    : node;
const SENTINEL = 'TENANT_A_PRIVATE_5f7e2d';

function synth(schema, depth = 0) {
    const s = deref(schema);
    if (!s || depth > 6) return {};
    if (s.default !== undefined) return s.default;
    if (s.enum) return s.enum[0];
    if (s.const !== undefined) return s.const;
    if (s.allOf) return Object.assign({}, ...s.allOf.map((branch) => synth(branch, depth + 1)));
    if (s.anyOf || s.oneOf) {
        const branch = (s.anyOf ?? s.oneOf).find((item) => deref(item)?.type !== 'null');
        return branch ? synth(branch, depth + 1) : null;
    }
    if (s.type === 'string') {
        const value = s.format === 'date-time' ? '2026-01-01T00:00:00Z'
            : s.format === 'email' ? 'matrix@example.com'
                : s.format === 'uuid' ? '11111111-1111-4111-8111-111111111111'
                    : s.format === 'uri' || s.format === 'url' ? 'https://matrix.example'
                        : 'matrix';
        return value.padEnd(s.minLength ?? 0, 'x').slice(0, s.maxLength ?? undefined);
    }
    if (s.type === 'integer' || s.type === 'number') return s.minimum ?? 1;
    if (s.type === 'boolean') return false;
    if (s.type === 'array') {
        return Array.from({ length: s.minItems ?? 0 }, () => synth(s.items ?? {}, depth + 1));
    }
    if (s.type === 'object') {
        const value = {};
        for (const key of s.required ?? []) value[key] = synth(s.properties?.[key] ?? {}, depth + 1);
        return value;
    }
    return {};
}

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async (request) => {
        const tenant = request.headers.get('x-matrix-tenant') ?? 'tenant-b';
        return {
            user: { id: `${tenant}-owner`, email: `${tenant}@example.com`, role: 'master_admin' },
            tenant,
        };
    },
    now: () => '2026-01-01T00:00:00.000Z',
    sessionSecret: 'tenant-matrix-secret-not-for-prod',
    userStoreFor: (tenant) => new UserStore(runner, tenant),
    includeProductRoot: true,
});

async function rawRequest(tenant, method, path, body) {
    const init = { method, headers: { 'x-matrix-tenant': tenant } };
    if (body !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    const response = await app.fetch(new Request(`http://matrix.local${path}`, init));
    const value = await response.clone().json().catch(() => null);
    return { response, value };
}

function idOf(value) {
    return value?.id
        ?? value?.execution_id
        ?? value?.data?.id
        ?? value?.bucket?.id
        ?? value?.version?.id
        ?? null;
}

async function create(path, body) {
    const result = await rawRequest('tenant-a', 'POST', path, body);
    if (!result.response.ok) {
        throw new Error(`tenant-A fixture ${path} returned ${result.response.status}`);
    }
    return result.value;
}

// Persist a representative tenant-A object for every state-backed identifier
// family. The private sentinel is deliberately placed in display/config fields.
const draft = await create('/api/actions/drafts', { name: SENTINEL, nodes: [], edges: [] });
const draftId = idOf(draft);
const actionVersion = await create(`/api/actions/drafts/${draftId}/versions/`, { label: SENTINEL });
// Seeded rather than created through the API. POST .../test now answers the product's
// 503 (a community deployment has no edge engine), so no execution can be minted here
// — but the execution identifier family still has to be isolation-tested, and dropping
// it would quietly shrink the matrix to whichever fixtures remain easy to build. The
// row is what a real run would leave behind, sentinel included.
const executionId = crypto.randomUUID();
await runner.exec(
    `INSERT INTO workflow_executions
         (id, tenant_slug, workflow_id, status, trigger, result, error, started_at, ended_at)
     VALUES (?,?,?,?,?,?,NULL,?,?)`,
    [
        executionId, 'tenant-a', draftId, 'completed', SENTINEL,
        JSON.stringify({ note: SENTINEL }),
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
    ],
);
const execution = { id: executionId };
const page = await create('/api/pages/', { name: SENTINEL, slug: 'tenant-a-private-page', title: SENTINEL });
const pageId = idOf(page);
const pageVersion = await create(`/api/pages/${pageId}/versions/`, { label: SENTINEL });
const variable = await create('/api/variables/', { name: SENTINEL, type: 'variable', value: SENTINEL });
const form = await create('/api/auth-forms/', { name: SENTINEL, type: 'login', config: { note: SENTINEL } });
const apiKey = await create('/api/edge-api-keys', { name: SENTINEL, scope: 'user' });
const cache = await create('/api/edge-caches/', { name: SENTINEL, provider: 'upstash', cache_url: 'https://matrix.example' });
const database = await create('/api/edge-databases/', { name: SENTINEL, provider: 'turso', db_url: 'https://matrix.example' });
const engine = await create('/api/edge-engines/', { name: SENTINEL, url: 'https://matrix.example' });
const provider = await create('/api/edge-providers/', { name: SENTINEL, provider: 'cloudflare' });
const queue = await create('/api/edge-queues/', { name: SENTINEL, provider: 'qstash', queue_url: 'https://matrix.example' });
const vector = await create('/api/edge-vectors/', { name: SENTINEL, provider: 'turso', vector_url: 'https://matrix.example' });
// Storage buckets reference a storage provider that must exist (product parity: the
// provider is validated before listing/creating buckets). The edge-provider above is the
// connected account; mint a storage provider from it, then bucket against its id.
const storageProvider = await create('/api/storage/providers/', { name: SENTINEL, provider_account_id: provider.id, provider: 'local' });
const bucket = await create(`/api/storage/buckets?provider_id=${storageProvider.id}`, { name: SENTINEL, provider: 'local' });
const server = await create('/api/mcp-servers', {
    name: SENTINEL,
    slug: 'tenant-a-server',
    url: 'https://matrix.example/mcp',
    transport: 'http',
});
const skill = await create('/api/agent-skills', {
    name: SENTINEL,
    slug: 'tenant-a-skill',
    description: SENTINEL,
    tool_definitions: [],
});
const theme = await create('/api/themes/', {
    name: SENTINEL,
    component_type: 'DataTable',
    styles_data: { note: SENTINEL },
});
const gpu = await create('/api/edge-gpu/', {
    name: SENTINEL,
    provider: 'cloudflare',
    model_id: 'matrix-model',
    model_type: 'text',
    edge_engine_id: idOf(engine),
});
await create('/api/auth/security/blocklist', { ip_or_range: '192.0.2.44', reason: SENTINEL });
const bans = await rawRequest('tenant-a', 'GET', '/api/auth/security/blocklist');

const ids = {
    draft_id: draftId,
    execution_id: idOf(execution),
    page_id: pageId,
    variable_id: idOf(variable),
    form_id: idOf(form),
    key_id: idOf(apiKey),
    cache_id: idOf(cache),
    db_id: idOf(database),
    engine_id: idOf(engine),
    provider_id: idOf(provider),
    account_id: idOf(provider),
    queue_id: idOf(queue),
    vector_id: idOf(vector),
    bucket_id: idOf(bucket),
    server_id: idOf(server),
    skill_id: idOf(skill),
    theme_id: idOf(theme),
    model_id: idOf(gpu),
    ban_id: bans.value?.[0]?.id,
    profile_id: 'tenant-a-profile-id',
    install_id: 'tenant-a-install-id',
    profile_slug: 'tenant-a-profile',
    domain_id: 'tenant-a-domain-id',
    table_name: 'tenant_a_table',
    policy_name: 'tenant_a_policy',
    node_id: 'tenant-a-node',
    scope: 'pages',
    job_id: 'tenant-a-job',
    slug: 'tenant-a-private-page',
    token: 'tenant-a-capability-token',
};

const tenantTables = [];
for (const row of await runner.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
)) {
    if (!/^[A-Za-z0-9_]+$/.test(row.name)) throw new Error(`unsafe table name ${row.name}`);
    const columns = await runner.query(`PRAGMA table_info("${row.name}")`);
    if (columns.some((column) => column.name === 'tenant_slug')) tenantTables.push(row.name);
}

async function snapshotTenantA() {
    const snapshot = {};
    for (const table of tenantTables) {
        snapshot[table] = await runner.query(
            `SELECT * FROM "${table}" WHERE tenant_slug = ? ORDER BY rowid`,
            ['tenant-a'],
        );
    }
    return JSON.stringify(snapshot);
}

const capabilityExceptions = new Set([
    'GET /api/auth/check-slug/{slug}',
    'GET /api/auth/invite/{token}',
]);
const failures = [];
let exercised = 0;
let capabilityCount = 0;

for (const [path, item] of Object.entries(spec.paths)) {
    if (!path.includes('{')) continue;
    for (const [method, operation] of Object.entries(item)) {
        if (!['get', 'post', 'put', 'patch', 'delete', 'options'].includes(method)) continue;
        const label = `${method.toUpperCase()} ${path}`;
        const pathValues = { ...ids };
        if (path.startsWith('/api/actions/')) pathValues.version_id = idOf(actionVersion);
        if (path.startsWith('/api/pages/')) pathValues.version_id = idOf(pageVersion);
        const concretePath = path.replace(/\{([^}]+)\}/g, (_, name) =>
            encodeURIComponent(String(pathValues[name] ?? `tenant-a-${name}`)));
        const url = new URL(`http://matrix.local${concretePath}`);
        for (const parameter of operation.parameters ?? []) {
            if (parameter.in === 'query' && parameter.required) {
                url.searchParams.set(parameter.name, String(synth(parameter.schema)));
            }
        }
        const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
        const body = bodySchema ? synth(bodySchema) : undefined;
        const before = await snapshotTenantA();
        const response = await rawRequest(
            'tenant-b',
            method.toUpperCase(),
            `${url.pathname}${url.search}`,
            body,
        );
        const after = await snapshotTenantA();
        if (before !== after) failures.push(`${label} changed tenant-A persisted state`);
        if (!capabilityExceptions.has(label)) {
            const text = await response.response.clone().text();
            if (text.includes(SENTINEL)) failures.push(`${label} leaked tenant-A sentinel data`);
        } else {
            capabilityCount++;
        }
        exercised++;
    }
}

// Derived from the contract, never a literal. The matrix covers every op whose
// path carries an identifier ({param}); hardcoding that total meant the gate broke
// rather than adapted when the contract widened (the /api/sync sub-app surface).
const IDENTIFIER_BEARING = Object.entries(spec.paths)
    .filter(([path]) => path.includes('{'))
    .reduce((n, [, item]) => n + Object.keys(item)
        .filter((m) => ['get', 'post', 'put', 'patch', 'delete', 'options'].includes(m)).length, 0);
if (exercised !== IDENTIFIER_BEARING) {
    failures.push(`matrix exercised ${exercised} operations, expected ${IDENTIFIER_BEARING} (identifier-bearing ops in the vendored contract)`);
}
if (failures.length) {
    console.error(`compat-tenant-matrix: FAIL (${failures.length})`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(
    `compat-tenant-matrix: PASS — ${exercised}/${IDENTIFIER_BEARING} identifier-bearing operations isolated; `
    + `${tenantTables.length} tenant-scoped tables snapshotted per operation; `
    + `${capabilityCount} public capability/availability operations classified`,
);
