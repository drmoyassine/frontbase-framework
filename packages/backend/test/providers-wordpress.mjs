/**
 * WordPress provider parity tests — resolveWordPress (pure) + enrichWordPress
 * (best-effort).
 *
 * Covers: (a) resolver maps stored fields → the canonical shape sync.ts's
 * wordpressConfig() reads (api_url + app_password + username), normalizing
 * scheme + trailing slashes; (b) enricher validates creds against
 * /wp-json/wp/v2/users/me and merges site_name; (c) enricher returns the input
 * unchanged when fetch fails, the URL is unsafe, or credentials are incomplete.
 */
import { strict as assert } from 'node:assert';
import { resolveWordPress, enrichWordPress } from '../dist/compat/providers/wordpress.js';

let testsPassed = 0;
async function test(name, fn) {
    await fn();
    testsPassed += 1;
    console.log(`  ok - ${name}`);
}

// ----- stubbed fetch ---------------------------------------------------------
// Records outbound calls so each assertion can verify request shape.
let calls = [];
function stubFetch(routes) {
    calls = [];
    return async (input, init = {}) => {
        const url = String(input);
        const method = String(init.method ?? 'GET');
        calls.push({ url, method, headers: init.headers ?? {} });
        const handler = routes[url];
        if (!handler) return new Response('not found', { status: 404 });
        const { status = 200, body = {} } = handler(init);
        return Response.json(body, { status });
    };
}
const fetchThrowing = async () => { throw new Error('network_down'); };

const USERS_ME = (host) => `${host}/wp-json/wp/v2/users/me`;

// =============================================================================
// (a) resolveWordPress — PURE field mapping
// =============================================================================
console.log('resolveWordPress (pure):');
await test('maps api_url + app_password + username through verbatim', () => {
    const out = resolveWordPress({
        api_url: 'https://wp.example',
        app_password: 'xxxx xxxx xxxx',
        username: 'editor',
    });
    assert.equal(out.api_url, 'https://wp.example');
    assert.equal(out.app_password, 'xxxx xxxx xxxx');
    assert.equal(out.username, 'editor');
    // base_url mirrored as the legacy REST alias (product discovery echoes both).
    assert.equal(out.base_url, 'https://wp.example');
});

await test('honors legacy REST base_url + password aliases', () => {
    const out = resolveWordPress({
        base_url: 'https://legacy.example',
        password: 'legacy-pw',
        username: 'admin',
    });
    assert.equal(out.api_url, 'https://legacy.example');
    assert.equal(out.app_password, 'legacy-pw');
    assert.equal(out.username, 'admin');
});

await test('honors generic url + api_key aliases (datasource-row shape)', () => {
    const out = resolveWordPress({
        url: 'https://row.example',
        api_key: 'row-key',
        username: 'u',
    });
    assert.equal(out.api_url, 'https://row.example');
    assert.equal(out.app_password, 'row-key');
});

await test('api_url takes precedence over base_url and url', () => {
    const out = resolveWordPress({
        api_url: 'https://primary.example',
        base_url: 'https://secondary.example',
        url: 'https://tertiary.example',
    });
    assert.equal(out.api_url, 'https://primary.example');
});

await test('app_password takes precedence over api_key and password', () => {
    const out = resolveWordPress({
        app_password: 'first',
        api_key: 'second',
        password: 'third',
    });
    assert.equal(out.app_password, 'first');
});

await test('prepends https:// to a bare host', () => {
    const out = resolveWordPress({ api_url: 'wp.example', username: 'u', app_password: 'p' });
    assert.equal(out.api_url, 'https://wp.example');
    assert.equal(out.base_url, 'https://wp.example');
});

await test('strips trailing slashes from the URL', () => {
    const out = resolveWordPress({ api_url: 'https://wp.example///', username: 'u', app_password: 'p' });
    assert.equal(out.api_url, 'https://wp.example');
});

await test('preserves an existing http(s):// scheme and path', () => {
    const out = resolveWordPress({ api_url: 'https://wp.example/blog', username: 'u', app_password: 'p' });
    assert.equal(out.api_url, 'https://wp.example/blog');
});

await test('carries api_mode through when present (rest/graphql/plugin)', () => {
    const out = resolveWordPress({
        api_url: 'https://wp.example', username: 'u', app_password: 'p',
        api_mode: 'graphql',
    });
    assert.equal(out.api_mode, 'graphql');
});

await test('omits api_mode + base_url when absent / empty url', () => {
    const out = resolveWordPress({ username: 'u', app_password: 'p' });
    assert.equal(out.api_url, '');
    assert.equal(out.base_url, undefined);
    assert.equal('api_mode' in out, false);
});

// =============================================================================
// (b) enrichWordPress — success path (validates + merges site_name)
// =============================================================================
console.log('enrichWordPress (success path):');
await test('pings /wp-json/wp/v2/users/me with Basic Auth and merges site_name', async () => {
    const fetchImpl = stubFetch({
        [USERS_ME('https://wp.example')]: () => ({
            body: { name: 'Acme Blog', slug: 'editor' },
        }),
    });
    const out = await enrichWordPress({
        api_url: 'https://wp.example',
        username: 'editor',
        app_password: 'xxxx xxxx xxxx',
        keep: 'mine',
    }, fetchImpl);

    assert.equal(out.site_name, 'Acme Blog');
    assert.equal(out.wp_user_slug, 'editor');
    assert.equal(out.api_url, 'https://wp.example');
    assert.equal(out.base_url, 'https://wp.example');
    assert.equal(out.username, 'editor');
    assert.equal(out.app_password, 'xxxx xxxx xxxx');
    assert.equal(out.keep, 'mine'); // input preserved

    // Exactly one GET to the WP whoami endpoint.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, USERS_ME('https://wp.example'));
    assert.equal(calls[0].method, 'GET');
    // Basic Auth header carries the username:app_password pair (base64).
    const expected = `Basic ${btoa('editor:xxxx xxxx xxxx')}`;
    assert.equal(calls[0].headers.Authorization, expected);
});

await test('normalizes a bare host + trailing slash before fetching', async () => {
    const fetchImpl = stubFetch({
        [USERS_ME('https://wp.example')]: () => ({ body: { name: 'X' } }),
    });
    const out = await enrichWordPress({
        api_url: 'wp.example/',
        username: 'u',
        app_password: 'p',
    }, fetchImpl);
    assert.equal(out.api_url, 'https://wp.example');
    assert.equal(calls[0].url, USERS_ME('https://wp.example'));
});

await test('accepts base_url / password legacy aliases at enrich time', async () => {
    const fetchImpl = stubFetch({
        [USERS_ME('https://legacy.example')]: () => ({ body: { name: 'L' } }),
    });
    const out = await enrichWordPress({
        base_url: 'https://legacy.example',
        username: 'u',
        password: 'legacy-pw',
    }, fetchImpl);
    assert.equal(out.site_name, 'L');
    const expected = `Basic ${btoa('u:legacy-pw')}`;
    assert.equal(calls[0].headers.Authorization, expected);
});

await test('uses app_password verbatim when it already embeds a colon', async () => {
    const fetchImpl = stubFetch({
        [USERS_ME('https://wp.example')]: () => ({ body: { name: 'X' } }),
    });
    await enrichWordPress({
        api_url: 'https://wp.example',
        username: 'ignored',
        app_password: 'user:secret',
    }, fetchImpl);
    // When the password contains a colon the adapter uses it as-is.
    assert.equal(calls[0].headers.Authorization, `Basic ${btoa('user:secret')}`);
});

await test('omits site_name when the response has no name field', async () => {
    const fetchImpl = stubFetch({
        [USERS_ME('https://wp.example')]: () => ({ body: { id: 1 } }),
    });
    const out = await enrichWordPress({
        api_url: 'https://wp.example', username: 'u', app_password: 'p',
    }, fetchImpl);
    assert.equal('site_name' in out, false);
    // Input config still returned (with normalized url).
    assert.equal(out.api_url, 'https://wp.example');
});

// =============================================================================
// (c) enrichWordPress — best-effort failure handling
// =============================================================================
console.log('enrichWordPress (failure / best-effort):');
await test('returns input unchanged when fetch throws', async () => {
    const input = {
        api_url: 'https://wp.example', username: 'u', app_password: 'p', extra: 1,
    };
    const out = await enrichWordPress(input, fetchThrowing);
    assert.deepEqual(out, input);
    assert.equal('site_name' in out, false);
});

await test('returns input unchanged when creds are invalid (non-2xx)', async () => {
    const fetchImpl = stubFetch({
        [USERS_ME('https://wp.example')]: () => ({ status: 401, body: { code: 'rest_not_logged_in' } }),
    });
    const input = { api_url: 'https://wp.example', username: 'u', app_password: 'bad' };
    const out = await enrichWordPress(input, fetchImpl);
    assert.deepEqual(out, input);
    assert.equal('site_name' in out, false);
});

await test('returns input unchanged when the URL is unsafe (SSRF guard rejects)', async () => {
    // guardedExternalFetch validates BEFORE dispatching; a loopback host throws
    // unsafe_provider_url, which the enricher must swallow.
    let called = 0;
    const fetchImpl = async () => { called++; return Response.json({ name: 'x' }); };
    const input = { api_url: 'https://localhost', username: 'u', app_password: 'p' };
    const out = await enrichWordPress(input, fetchImpl);
    assert.equal(called, 0, 'unsafe URL must not reach the fetch impl');
    assert.deepEqual(out, input);
});

await test('returns input unchanged when api_url is missing', async () => {
    let called = 0;
    const fetchImpl = async () => { called++; return Response.json({ name: 'x' }); };
    const input = { username: 'u', app_password: 'p' };
    const out = await enrichWordPress(input, fetchImpl);
    assert.equal(called, 0);
    assert.deepEqual(out, input);
});

await test('returns input unchanged when username is missing', async () => {
    let called = 0;
    const fetchImpl = async () => { called++; return Response.json({ name: 'x' }); };
    const input = { api_url: 'https://wp.example', app_password: 'p' };
    const out = await enrichWordPress(input, fetchImpl);
    assert.equal(called, 0);
    assert.deepEqual(out, input);
});

await test('returns input unchanged when app_password is missing', async () => {
    let called = 0;
    const fetchImpl = async () => { called++; return Response.json({ name: 'x' }); };
    const input = { api_url: 'https://wp.example', username: 'u' };
    const out = await enrichWordPress(input, fetchImpl);
    assert.equal(called, 0);
    assert.deepEqual(out, input);
});

// =============================================================================
// (d) round-trip — enricher output flows through the resolver
// =============================================================================
console.log('round-trip:');
await test('enriched config resolves cleanly (same canonical keys)', async () => {
    const fetchImpl = stubFetch({
        [USERS_ME('https://wp.example')]: () => ({ body: { name: 'Acme' } }),
    });
    const enriched = await enrichWordPress({
        base_url: 'wp.example/', username: 'editor', password: 'p',
    }, fetchImpl);
    const resolved = resolveWordPress(enriched);
    assert.equal(resolved.api_url, 'https://wp.example');
    assert.equal(resolved.username, 'editor');
    assert.equal(resolved.app_password, 'p');
});

console.log(`\nAll ${testsPassed} WordPress provider tests passed.`);
