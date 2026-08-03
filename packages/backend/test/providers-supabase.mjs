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
        [`https://api.supabase.com/v1/projects/${ref}/api-keys`]: Response.json([
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
        [`https://api.supabase.com/v1/projects/${ref}/api-keys`]: Response.json([
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

async function makeApp() {
    return createCompatApp({
        makeRunner: async () => controlRunner,
        resolvePrincipal: async () => ({ user: { id: 'owner-a', role: 'owner' }, tenant: 'tenant-a' }),
        sessionSecret: 'supabase-auto-apply-test-secret',
        externalFetch: async () => Response.json({}), // unused by the runner.exec path
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

// 10. Creating a Supabase datasource best-effort applies the setup migration.
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
        // 19 functions in supabase_setup.sql; assert a robust floor plus that the
        // two framework-critical RPCs were among the statements sent.
        assert.ok(calls.length >= 15, `expected >=15 execute_sql RPCs, got ${calls.length}`);
        const blob = calls.join('\n');
        assert.ok(blob.includes('CREATE OR REPLACE FUNCTION execute_query'), 'execute_query migrated');
        assert.ok(blob.includes('CREATE OR REPLACE FUNCTION execute_sql'), 'execute_sql migrated');
    } finally {
        restore();
    }
}

// 11. A migration failure (fetch throws / network down) MUST NOT fail the create.
{
    const app = await makeApp();
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('network_down'); };
    try {
        const created = await req(app, 'POST', '/api/sync/datasources/', {
            name: 'Failing Supabase',
            type: 'supabase',
            url: 'https://fail.supabase.co',
            service_role_key: 'eyJ-svc',
        });
        assert.equal(created.status, 201);
        assert.ok(created.body && created.body.id, 'datasource row still returned');
    } finally {
        globalThis.fetch = original;
    }
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
