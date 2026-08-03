/**
 * Neon provider parity tests — resolveNeon (pure) + enrichNeon (best-effort).
 *
 * Covers: (a) resolver maps stored fields → postgresRunner `{ connectionString }`,
 * (b) enricher merges connection_uri from the Neon Console API, (c) enricher
 * returns input unchanged when fetch fails or response is malformed.
 */
import { strict as assert } from 'node:assert';
import { resolveNeon, enrichNeon } from '../dist/compat/providers/neon.js';

// ---------------------------------------------------------------------------
// resolveNeon — PURE
// ---------------------------------------------------------------------------

// 1. Stored connection_uri passes straight through as connectionString.
{
    const uri = 'postgresql://neondb_owner:npm_abc@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require';
    const out = resolveNeon({ connection_uri: uri });
    assert.equal(out.connectionString, uri);
    assert.equal(Object.keys(out).length, 1);
}

// 2. connectionString (camelCase alias) is honored when no connection_uri.
{
    const out = resolveNeon({ connectionString: 'postgresql://u:p@host/db' });
    assert.equal(out.connectionString, 'postgresql://u:p@host/db');
}

// 3. connection_uri takes precedence over connectionString.
{
    const out = resolveNeon({ connection_uri: 'postgresql://a@h1/db', connectionString: 'postgresql://b@h2/db' });
    assert.equal(out.connectionString, 'postgresql://a@h1/db');
}

// 4. Inline fields (host/port/database/user/password) build a Neon URI with
//    sslmode=require — matches neon_adapter._build_connection_string.
{
    const out = resolveNeon({
        host: 'ep-example-pooler.us-east-2.aws.neon.tech',
        port: 5432,
        database: 'neondb',
        username: 'neondb_owner',
        password: 's3cret',
    });
    assert.equal(
        out.connectionString,
        'postgresql://neondb_owner:s3cret@ep-example-pooler.us-east-2.aws.neon.tech:5432/neondb?sslmode=require',
    );
}

// 5. Inline fallback: default port 5432 when absent; no db → omit path; urlencoded creds.
{
    const out = resolveNeon({ host: 'h.example', username: 'u@x', password: 'p:?' });
    assert.equal(
        out.connectionString,
        'postgresql://u%40x:p%3A%3F@h.example:5432?sslmode=require',
    );
}

// 6. No host and no URI → empty connectionString (runner decides how to fail).
{
    const out = resolveNeon({ api_key: 'tok' });
    assert.equal(out.connectionString, '');
}

// ---------------------------------------------------------------------------
// enrichNeon — BEST-EFFORT
// ---------------------------------------------------------------------------

// 7. Successful fetch merges connection_uri + carries project_id through.
{
    const seen = [];
    const fetchStub = async (input, init = {}) => {
        seen.push({ url: String(input), headers: init.headers });
        return Response.json({ uri: 'postgresql://neondb_owner:x@ep-host/db?sslmode=require' });
    };
    const input = { api_key: 'tok-123', project_id: 'proj-7', extra: 'keep-me' };
    const out = await enrichNeon(input, fetchStub);

    assert.equal(out.connection_uri, 'postgresql://neondb_owner:x@ep-host/db?sslmode=require');
    assert.equal(out.project_id, 'proj-7');
    assert.equal(out.extra, 'keep-me'); // input preserved
    assert.equal(out.api_key, 'tok-123'); // input preserved

    // Hit the Neon Console API v2 endpoint with the project id path-embedded.
    assert.equal(seen.length, 1);
    assert.ok(seen[0].url.startsWith('https://console.neon.tech/api/v2/projects/proj-7/connection_uri'));
    assert.ok(seen[0].url.includes('role_name=neondb_owner'));
    assert.ok(seen[0].url.includes('database_name=neondb'));
    assert.equal(seen[0].headers.Authorization, 'Bearer tok-123');
}

// 8. project_ref / id aliases accepted as the project identifier; custom role/db honored.
{
    const seen = [];
    const fetchStub = async (input) => {
        seen.push(String(input));
        return Response.json({ uri: 'postgresql://custom@host/db' });
    };
    await enrichNeon({ api_key: 'k', project_ref: 'ref-9', role_name: 'r', database_name: 'd' }, fetchStub);
    assert.ok(seen[0].includes('/projects/ref-9/connection_uri'));
    assert.ok(seen[0].includes('role_name=r'));
    assert.ok(seen[0].includes('database_name=d'));
}

// 9. Missing api_key or project_id → no fetch, input returned as-is.
{
    let called = 0;
    const fetchStub = async () => { called++; return Response.json({ uri: 'x' }); };
    const a = await enrichNeon({ project_id: 'p' }, fetchStub);
    const b = await enrichNeon({ api_key: 'k' }, fetchStub);
    assert.equal(called, 0);
    assert.deepEqual(a, { project_id: 'p' });
    assert.deepEqual(b, { api_key: 'k' });
}

// 10. Fetch throws (network/SSRF) → return input unchanged.
{
    let called = 0;
    const fetchStub = async () => { called++; throw new Error('network down'); };
    const input = { api_key: 'k', project_id: 'p', existing: 1 };
    const out = await enrichNeon(input, fetchStub);
    assert.equal(called, 1);
    assert.deepEqual(out, input);
    assert.equal(out.connection_uri, undefined);
}

// 11. Non-2xx response → input unchanged (no merge).
{
    const fetchStub = async () => new Response('{"message":"unauthorized"}', { status: 401 });
    const input = { api_key: 'bad', project_id: 'p' };
    const out = await enrichNeon(input, fetchStub);
    assert.deepEqual(out, input);
    assert.equal(out.connection_uri, undefined);
}

// 12. 2xx but missing uri field → input unchanged.
{
    const fetchStub = async () => Response.json({ something_else: 'x' });
    const input = { api_key: 'k', project_id: 'p' };
    const out = await enrichNeon(input, fetchStub);
    assert.deepEqual(out, input);
    assert.equal(out.connection_uri, undefined);
}

// 13. Enricher output round-trips through the resolver (end-to-end shape).
{
    const fetchStub = async () => Response.json({ uri: 'postgresql://u:p@host/db?sslmode=require' });
    const enriched = await enrichNeon({ api_key: 'k', project_id: 'p' }, fetchStub);
    const resolved = resolveNeon(enriched);
    assert.equal(resolved.connectionString, 'postgresql://u:p@host/db?sslmode=require');
}

console.log('providers-neon: PASS');
