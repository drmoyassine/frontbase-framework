/**
 * Supabase provider parity tests — resolveSupabase (pure) + enrichSupabase (best-effort).
 *
 * Covers: (a) resolver maps stored account fields → supabaseRunner `{ url, serviceKey }`
 * (incl. project_ref → url derivation + anon_key fallback), (b) enricher fetches
 * api-keys + postgrest and merges service_role_key/anon_key/jwt_secret/api_url,
 * (c) enricher returns input unchanged when fetch fails or required fields are absent.
 */
import { strict as assert } from 'node:assert';
import { resolveSupabase, enrichSupabase } from '../dist/compat/providers/supabase.js';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

// ---------------------------------------------------------------------------
// resolveSupabase — PURE
// ---------------------------------------------------------------------------

// 1. Explicit api_url + service_role_key → runner shape; url trimmed of trailing slash.
{
    const out = resolveSupabase({ api_url: 'https://abc.supabase.co/', service_role_key: 'eyJ-svc' });
    assert.equal(out.url, 'https://abc.supabase.co');
    assert.equal(out.serviceKey, 'eyJ-svc');
    assert.equal(out.project_ref, undefined);
}

// 2. project_ref derives the URL when api_url is absent.
{
    const out = resolveSupabase({ project_ref: 'pwushelllost', service_role_key: 'k' });
    assert.equal(out.url, 'https://pwushelllost.supabase.co');
    assert.equal(out.serviceKey, 'k');
    assert.equal(out.project_ref, 'pwushelllost');
}

// 3. anon_key is the fallback when no service_role_key.
{
    const out = resolveSupabase({ api_url: 'https://x.supabase.co', anon_key: 'anon' });
    assert.equal(out.serviceKey, 'anon');
}

// 4. An explicit JWT *token* + schema are carried through; jwt_secret is NOT (it's
//    a raw signing secret, not a Bearer token — must not be sent as a JWT).
{
    const out = resolveSupabase({ url: 'https://x.supabase.co', serviceKey: 'k', jwt: 'hdr.pay.sig', jwt_secret: 'rawsecret', schema: 'private' });
    assert.equal(out.jwt, 'hdr.pay.sig');
    assert.equal(out.schema, 'private');
    assert.equal(out.jwt_secret, undefined); // raw secret must NOT leak into the runner shape
}

// 5. Empty input → empty url + serviceKey (runner decides how to fail).
{
    const out = resolveSupabase({});
    assert.equal(out.url, '');
    assert.equal(out.serviceKey, '');
}

// ---------------------------------------------------------------------------
// enrichSupabase — best-effort, mocked fetch (standard (input, init) signature)
// ---------------------------------------------------------------------------

/** Route a stubbed fetch by URL string → Response. */
function mockFetch(routes) {
    return async (input) => {
        const url = String(input);
        const r = routes[url];
        if (!r) throw new Error(`unexpected fetch ${url}`);
        return typeof r === 'function' ? r() : r;
    };
}

// 6. Enrichment fetches api-keys + postgrest and merges all fields + derived api_url.
{
    const ref = 'proj-xyz';
    const fetch = mockFetch({
        [`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`]: Response.json([
            { name: 'anon', api_key: 'anon-KEY' },
            { name: 'service_role', api_key: 'svc-KEY' },
        ]),
        [`https://api.supabase.com/v1/projects/${ref}/postgrest`]: Response.json({ jwt_secret: 'jwt-SECRET' }),
    });
    const out = await enrichSupabase({ access_token: 'PAT', project_ref: ref }, fetch);
    assert.equal(out.api_url, `https://${ref}.supabase.co`);
    assert.equal(out.project_ref, ref);
    assert.equal(out.anon_key, 'anon-KEY');
    assert.equal(out.service_role_key, 'svc-KEY');
    assert.equal(out.jwt_secret, 'jwt-SECRET');
    // Original token preserved.
    assert.equal(out.access_token, 'PAT');
}

// 7. Missing access_token OR project_ref → passthrough (nothing to enrich).
{
    const out = await enrichSupabase({ access_token: 'PAT' }, mockFetch({}));
    assert.deepEqual(out, { access_token: 'PAT' });
}

// 8. Fetch failure (thrown) → no fetched secrets merged; api_url still derived
//    locally from project_ref (deterministic, needs no fetch). No throw.
{
    const fetch = async () => { throw new Error('network down'); };
    const out = await enrichSupabase({ access_token: 'PAT', project_ref: 'r' }, fetch);
    assert.equal(out.access_token, 'PAT');
    assert.equal(out.project_ref, 'r');
    assert.equal(out.api_url, 'https://r.supabase.co'); // derived locally
    assert.equal(out.service_role_key, undefined);       // not fetched
    assert.equal(out.anon_key, undefined);               // not fetched
    assert.equal(out.jwt_secret, undefined);             // not fetched
}

// 9. postgrest 404 (common) is swallowed; api-keys still merge when they succeed.
{
    const ref = 'r2';
    const fetch = mockFetch({
        [`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`]: Response.json([
            { name: 'service_role', api_key: 'svc' },
        ]),
        [`https://api.supabase.com/v1/projects/${ref}/postgrest`]: new Response('{"message":"no"}', { status: 404 }),
    });
    const out = await enrichSupabase({ access_token: 'PAT', project_ref: ref }, fetch);
    assert.equal(out.service_role_key, 'svc');
    assert.equal(out.jwt_secret, undefined); // not merged when postgrest 404s
}

// ---------------------------------------------------------------------------
// Route-level: best-effort auto-apply of the setup SQL on Supabase create.
//
// The framework supabase runner (runner.exec) talks to PostgREST through the
// GLOBAL fetch (POST /rest/v1/rpc/execute_sql) — not the route's externalFetch.
// So we stub globalThis.fetch to observe the migration and to prove a failing
// migration never fails the datasource create (it is best-effort).
// ---------------------------------------------------------------------------

const controlRunner = sqliteRunner(':memory:');
await migrateUp(controlRunner);

async function makeApp(externalFetch = async () => Response.json({})) {
    return createCompatApp({
        makeRunner: async () => controlRunner,
        resolvePrincipal: async () => ({ user: { id: 'owner-a', role: 'owner' }, tenant: 'tenant-a' }),
        sessionSecret: 'supabase-auto-apply-test-secret',
        externalFetch, // unused by the runner.exec path unless provider bootstrap runs
        now: () => '2026-08-03T00:00:00Z',
    });
}

/** Stub global fetch; collect the `query_sql` of every execute_sql RPC. */
function trackExecuteSqlCalls() {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        if (url.includes('/rpc/execute_sql')) {
            let body = {};
            try { body = JSON.parse(String(init.body ?? '{}')); } catch { /* non-JSON */ }
            calls.push(String(body.query_sql ?? ''));
            // execute_sql RETURNS json {rowCount}; a 200 keeps runner.exec happy.
            return Response.json([{ result: { rowCount: 0 } }], { status: 200 });
        }
        return Response.json([], { status: 200 });
    };
    return { calls, restore: () => { globalThis.fetch = original; } };
}

async function req(app, method, path, body) {
    const response = await app.fetch(new Request(`http://sb.test${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: response.status, body: await response.clone().json().catch(() => null) };
}

// 10. A manual URL/key Supabase datasource must not pretend to bootstrap.
// The helper SQL needs execute_query/execute_sql; installing those functions
// through a runner that already requires them is circular. Connected-account
// Management API bootstrap is pinned separately in supabase-bootstrap.mjs.
{
    const app = await makeApp();
    const { calls, restore } = trackExecuteSqlCalls();
    try {
        const created = await req(app, 'POST', '/api/sync/datasources/', {
            name: 'Auto Supabase',
            type: 'supabase',
            url: 'https://auto.supabase.co',
            service_role_key: 'eyJ-svc',
        });
        assert.equal(created.status, 201);
        assert.equal(calls.length, 0, 'manual key-only setup must not call execute_sql');
    } finally {
        restore();
    }
}

// 11. A provider/network failure MUST NOT fail an already-persisted create.
{
    const app = await makeApp(async () => { throw new Error('network_down'); });
    const created = await req(app, 'POST', '/api/sync/datasources/', {
        name: 'Failing Supabase',
        type: 'supabase',
        url: 'https://fail.supabase.co',
        service_role_key: 'eyJ-svc',
        access_token: 'management-token',
    });
    assert.equal(created.status, 201);
    assert.ok(created.body && created.body.id, 'datasource row still returned');
}

// 12. Non-supabase create must NOT trigger any execute_sql RPC (apply is gated).
{
    const app = await makeApp();
    const { calls, restore } = trackExecuteSqlCalls();
    try {
        const created = await req(app, 'POST', '/api/sync/datasources/', {
            name: 'Plain SQLite',
            type: 'sqlite',
            config: { url: ':memory:' },
        });
        assert.equal(created.status, 201);
        assert.equal(calls.length, 0, 'no execute_sql RPCs for a non-supabase create');
    } finally {
        restore();
    }
}

console.log('providers-supabase: 12/12 passed');

// Management-backed old accounts refresh to the equivalent current key types.
// Misleading names cannot turn a public key into an elevated server key.
{
    const out = await enrichSupabase({ access_token: 'PAT', project_ref: 'refresh', service_role_key: 'legacy-service', anon_key: 'legacy-anon', jwt_secret: 'existing-signing-secret' }, async (url, init) => {
        assert.equal(String(url), 'https://api.supabase.com/v1/projects/refresh/api-keys?reveal=true');
        assert.equal(init.headers.Authorization, 'Bearer PAT');
        return Response.json([
            { type: 'legacy', name: 'service_role', api_key: 'legacy-service' },
            { type: 'legacy', name: 'anon', api_key: 'legacy-anon' },
            { type: 'publishable', name: 'service-admin', api_key: 'sb_publishable_public' },
            { type: 'secret', name: 'anon-looking-name', id: 'z', api_key: 'sb_secret_other' },
            { type: 'secret', name: 'default', id: 'a', api_key: 'sb_secret_server' },
            { type: 'secret', name: 'default', id: '0', api_key: 'sb_secret_******' },
        ]);
    });
    assert.equal(out.service_role_key, 'sb_secret_server');
    assert.equal(out.anon_key, 'sb_publishable_public');
    const resolved = resolveSupabase(out);
    assert.equal(resolved.serviceKey, 'sb_secret_server');
    assert.equal(resolved.anonKey, 'sb_publishable_public');
    assert.equal(out.jwt_secret, 'existing-signing-secret');
}

// Manual legacy/current keys need no management account or extra requests.
for (const service_role_key of ['manual-legacy', 'sb_secret_manual']) {
    const config = { api_url: 'https://manual.supabase.co', service_role_key };
    assert.deepEqual(await enrichSupabase(config, async () => { throw new Error('must not fetch'); }), config);
    assert.equal(resolveSupabase(config).serviceKey, service_role_key);
}

// Failed discovery retains working legacy credentials; it never creates keys.
{
    const config = { access_token: 'PAT', project_ref: 'old', service_role_key: 'old-key', jwt_secret: 'signing' };
    const out = await enrichSupabase(config, async (_url, init) => {
        assert.equal(init.method ?? 'GET', 'GET');
        return Response.json({ message: 'unavailable' }, { status: 403 });
    });
    assert.equal(out.service_role_key, 'old-key');
}

// A current enriched account is idempotent, preserving explicitly saved keys.
{
    const config = { access_token: 'PAT', project_ref: 'current', service_role_key: 'sb_secret_saved' };
    assert.deepEqual(await enrichSupabase(config, async () => { throw new Error('must not fetch'); }), config);
}

// Owner-scoped merge must not obtain an account from another owner or mix the
// project/token when two owners hydrate concurrently.
import { mergeAccountConfig } from '../dist/compat/providers/merge-account.js';
{
    const accountFor = async (tenant, id) => id === 'own' ? { access_token: `PAT-${tenant}`, project_ref: `project-${tenant}`, service_role_key: 'legacy', jwt_secret: 'signing' } : null;
    const external = async (url, init) => {
        const tenant = String(url).includes('project-a/') ? 'a' : 'b';
        assert.equal(init.headers.Authorization, `Bearer PAT-${tenant}`);
        return Response.json([{ type: 'secret', name: 'default', api_key: `sb_secret_${tenant}` }]);
    };
    const [a, b] = await Promise.all(['a', 'b'].map(t => mergeAccountConfig(accountFor, external, t, 'supabase', { provider_account_id: 'own' })));
    assert.equal(a.service_role_key, 'sb_secret_a');
    assert.equal(b.service_role_key, 'sb_secret_b');
    const missing = await mergeAccountConfig(accountFor, async () => { throw new Error('must not fetch'); }, 'a', 'supabase', { provider_account_id: 'foreign' });
    assert.deepEqual(missing, { provider_account_id: 'foreign' });
}
console.log('providers-supabase key compatibility: current discovery, legacy/manual fallback, no escalation, failure preservation, idempotence and owner isolation passed');
