/**
 * CF-22 Gate 2 — secret lifecycle + tenant isolation security proof.
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async (request) => {
        const tenant = request.headers.get('x-test-tenant') ?? 'tenant-a';
        return {
            user: { id: `owner-${tenant}`, role: request.headers.get('x-test-role') ?? 'owner' },
            tenant,
        };
    },
    sessionSecret: 'compat-security-secret-012345678901234567890',
    userStoreFor: (tenant) => new UserStore(runner, tenant),
    now: () => '2026-07-28T00:00:00.000Z',
});
const req = (tenant, method, path, body) => app.fetch(new Request('http://security.local' + path, {
    method,
    headers: {
        'x-test-tenant': tenant,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
}));

const memberAttempt = await app.fetch(new Request('http://security.local/api/edge-providers/', {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        'x-test-tenant': 'tenant-a',
        'x-test-role': 'member',
    },
    body: JSON.stringify({ name: 'Forbidden provider', provider: 'cloudflare' }),
}));
assert.equal(memberAttempt.status, 403, 'ordinary members cannot mutate provider credentials');

const createdResponse = await req('tenant-a', 'POST', '/api/edge-api-keys', {
    name: 'Production',
    scope: 'management',
});
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
assert.match(created.key, /^fb_sk_/);

const stored = await runner.query(
    `SELECT k.key_hash, s.ciphertext, s.revealed_at
     FROM edge_api_keys k JOIN edge_api_key_secrets s
       ON s.key_id = k.id AND s.tenant_slug = k.tenant_slug
     WHERE k.tenant_slug = ? AND k.id = ?`,
    ['tenant-a', created.id],
);
assert.match(String(stored[0].key_hash), /^[a-f0-9]{64}$/);
assert.ok(String(stored[0].ciphertext).startsWith('enc:'));
assert.ok(!JSON.stringify(stored).includes(created.key), 'raw key must never persist');

const tenantBList = await (await req('tenant-b', 'GET', '/api/edge-api-keys')).json();
assert.equal(tenantBList.keys.length, 0);
assert.equal((await req('tenant-b', 'GET', `/api/edge-api-keys/${created.id}/reveal`)).status, 404);
assert.equal((await req('tenant-b', 'PUT', `/api/edge-api-keys/${created.id}`, { is_active: false })).status, 404);
// 404, not 204. The sibling GET and PUT above already answer 404; the DELETE's 204
// was the odd one out, and it told tenant B "deleted" for a key it can neither see
// nor touch — from the caller's side, indistinguishable from having actually
// deleted tenant A's key. The next assertion proves it never did.
assert.equal((await req('tenant-b', 'DELETE', `/api/edge-api-keys/${created.id}`)).status, 404);

const stillOwned = await (await req('tenant-a', 'GET', '/api/edge-api-keys')).json();
assert.equal(stillOwned.keys.length, 1, 'tenant B must not delete tenant A key');

const reveal = await req('tenant-a', 'GET', `/api/edge-api-keys/${created.id}/reveal`);
assert.equal(reveal.status, 200);
assert.equal((await reveal.json()).key, created.key);
assert.equal((await req('tenant-a', 'GET', `/api/edge-api-keys/${created.id}/reveal`)).status, 410);

const cleared = await runner.query(
    'SELECT ciphertext, revealed_at FROM edge_api_key_secrets WHERE tenant_slug = ? AND key_id = ?',
    ['tenant-a', created.id],
);
assert.equal(cleared[0].ciphertext, null, 'recoverable material must be erased after reveal');
assert.ok(cleared[0].revealed_at);
const audit = await runner.query(
    'SELECT action FROM security_audit_events WHERE tenant_slug = ? AND resource_id = ? ORDER BY created_at',
    ['tenant-a', created.id],
);
assert.ok(audit.some((row) => row.action === 'edge_api_key_created'));
assert.ok(audit.some((row) => row.action === 'edge_api_key_revealed'));

assert.equal((await req('tenant-a', 'POST', '/api/edge-api-keys', {
    name: 'Invalid',
    scope: 'root',
})).status, 400);

// Universal provider-secret encryption. Every provider surface persists its
// credential-bearing configuration as ciphertext and never echoes the marker.
const secretCases = [
    ['/api/edge-engines/', {
        name: 'Secret engine',
        url: 'https://engine.example',
        engine_config: { api_token: 'secret-engine-marker' },
    }],
    ['/api/edge-providers/', {
        name: 'Secret provider',
        provider: 'cloudflare',
        provider_credentials: { token: 'secret-provider-marker' },
    }],
    ['/api/edge-databases/', {
        name: 'Secret database',
        provider: 'turso',
        db_url: 'https://database.example',
        db_token: 'secret-database-marker',
    }],
    ['/api/edge-caches/', {
        name: 'Secret cache',
        provider: 'upstash',
        cache_url: 'https://cache.example',
        cache_token: 'secret-cache-marker',
    }],
    ['/api/edge-queues/', {
        name: 'Secret queue',
        provider: 'qstash',
        queue_url: 'https://queue.example',
        queue_token: 'secret-queue-marker',
        signing_key: 'secret-signing-marker',
    }],
    ['/api/edge-vectors/', {
        name: 'Secret vector',
        provider: 'vectorize',
        vector_url: 'https://vector.example',
        vector_token: 'secret-vector-marker',
    }],
];
for (const [path, body] of secretCases) {
    const response = await req('tenant-a', 'POST', path, body);
    assert.ok(response.ok, `${path} create must succeed`);
    const text = await response.text();
    assert.ok(!text.includes('secret-'), `${path} response must redact credentials`);
}

const edgeConfigs = await runner.query(
    'SELECT config FROM edge_resources WHERE tenant_slug = ? AND config IS NOT NULL',
    ['tenant-a'],
);
assert.equal(edgeConfigs.length, secretCases.length);
for (const row of edgeConfigs) {
    assert.ok(String(row.config).startsWith('enc:'), 'edge configuration must be encrypted');
    assert.ok(!String(row.config).includes('secret-'), 'edge ciphertext must not contain plaintext markers');
}

const mcp = await req('tenant-a', 'POST', '/api/mcp-servers', {
    name: 'Secret MCP',
    slug: 'secret-mcp',
    url: 'https://mcp.example',
    transport: 'http',
    config: { token: 'secret-mcp-marker' },
});
assert.ok(mcp.ok);
assert.ok(!(await mcp.text()).includes('secret-mcp-marker'));
const mcpRows = await runner.query('SELECT config FROM mcp_servers WHERE tenant_slug = ?', ['tenant-a']);
assert.ok(String(mcpRows[0].config).startsWith('enc:'));
assert.ok(!String(mcpRows[0].config).includes('secret-mcp-marker'));

const providerRow = await runner.query(
    "SELECT id FROM edge_resources WHERE tenant_slug = ? AND kind = 'provider' LIMIT 1",
    ['tenant-a'],
);
assert.ok((await req('tenant-a', 'POST', '/api/edge-providers/workspace-agent-token', {
    provider_id: providerRow[0].id,
})).ok);
const workspaceToken = await runner.query(
    'SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',
    ['tenant-a', 'workspace_agent_token'],
);
assert.ok(String(workspaceToken[0].value).includes('enc:'));
assert.ok(!String(workspaceToken[0].value).includes('token_'));

console.log('compat-security: PASS ✅');
