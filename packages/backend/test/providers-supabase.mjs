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

console.log('providers-supabase: 9/9 passed');
