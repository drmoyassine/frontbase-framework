/**
 * Cloudflare provider unit tests — resolveCloudflare (pure) + enrichCloudflare
 * (async, best-effort).
 *
 * Covers:
 *   (a) resolver maps stored fields → runner shape `{ accountId, databaseId,
 *       apiToken }`, honoring both snake_case (connect-payload / stored account)
 *       and camelCase (runner-native) aliases.
 *   (b) enricher detects account_id + account_name from the CF accounts API and
 *       merges them into the config, sending a Bearer token.
 *   (c) enricher returns the input UNCHANGED when the fetch fails, when the API
 *       responds non-200, when no accounts are returned, and when no api_token
 *       is present.
 */
import { strict as assert } from 'node:assert';
import { resolveCloudflare, enrichCloudflare } from '../dist/compat/providers/cloudflare.js';

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
        // The CF endpoint carries a query string; match on the bare path.
        const path = url.split('?')[0];
        const handler = routes[path];
        if (!handler) return new Response('not found', { status: 404 });
        const { status = 200, body = {} } = handler(init);
        return Response.json(body, { status });
    };
}
const fetchThrowing = async () => { throw new Error('network_down'); };

const ACCOUNTS_URL = 'https://api.cloudflare.com/client/v4/accounts';

// =============================================================================
// (a) resolveCloudflare — PURE field mapping
// =============================================================================
console.log('resolveCloudflare (pure):');
await test('maps snake_case account_id / database_id / api_token', () => {
    const out = resolveCloudflare({
        account_id: 'acc-1', database_id: 'db-1', api_token: 'tok-1',
    });
    assert.deepEqual(out, { accountId: 'acc-1', databaseId: 'db-1', apiToken: 'tok-1' });
});

await test('maps camelCase accountId / databaseId / apiToken', () => {
    const out = resolveCloudflare({
        accountId: 'acc-2', databaseId: 'db-2', apiToken: 'tok-2',
    });
    assert.deepEqual(out, { accountId: 'acc-2', databaseId: 'db-2', apiToken: 'tok-2' });
});

await test('prefers camelCase alias when both present', () => {
    // Contract: accountId ?? account_id etc. — camelCase wins.
    const out = resolveCloudflare({
        accountId: 'camel', account_id: 'snake',
        databaseId: 'camelDb', database_id: 'snakeDb',
        apiToken: 'camelTok', api_token: 'snakeTok',
    });
    assert.deepEqual(out, {
        accountId: 'camel', databaseId: 'camelDb', apiToken: 'camelTok',
    });
});

await test('returns empty strings when no fields present', () => {
    assert.deepEqual(resolveCloudflare({}), { accountId: '', databaseId: '', apiToken: '' });
});

await test('a connected-account config (account_id + api_token) yields empty databaseId', () => {
    // A D1 datasource bound to a Cloudflare connected account resolves to
    // { account_id, api_token } + a user-chosen database_id. If database_id is
    // absent (e.g. not yet selected), the runner receives '' — caller's problem.
    const out = resolveCloudflare({ account_id: 'acc-3', api_token: 'tok-3' });
    assert.deepEqual(out, { accountId: 'acc-3', databaseId: '', apiToken: 'tok-3' });
});

// =============================================================================
// (b) enrichCloudflare — merges detected account_id + account_name
// =============================================================================
console.log('enrichCloudflare (success path):');
await test('detects first account id + name and merges into config', async () => {
    const fetchImpl = stubFetch({
        [ACCOUNTS_URL]: () => ({
            body: {
                success: true,
                result: [
                    { id: 'acc-xyz', name: 'Acme Inc' },
                    { id: 'acc-other', name: 'Other' },
                ],
            },
        }),
    });
    const out = await enrichCloudflare({ api_token: 'tok' }, fetchImpl);

    // Exactly one call to the accounts endpoint, with Bearer auth.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${ACCOUNTS_URL}?per_page=1`);
    assert.equal(calls[0].headers.Authorization, 'Bearer tok');

    // First account merged; second ignored.
    assert.equal(out.account_id, 'acc-xyz');
    assert.equal(out.account_name, 'Acme Inc');
    // Original field carried through.
    assert.equal(out.api_token, 'tok');
});

await test('merges account_id when name is absent', async () => {
    const fetchImpl = stubFetch({
        [ACCOUNTS_URL]: () => ({ body: { result: [{ id: 'acc-noname' }] } }),
    });
    const out = await enrichCloudflare({ api_token: 'tok', existing: 'keep' }, fetchImpl);

    assert.equal(out.account_id, 'acc-noname');
    assert.ok(!('account_name' in out), 'account_name should not be added when absent');
    assert.equal(out.existing, 'keep', 'pre-existing fields preserved');
});

await test('preserves an already-present account_id if API returns none', async () => {
    const fetchImpl = stubFetch({
        [ACCOUNTS_URL]: () => ({ body: { result: [] } }),
    });
    const out = await enrichCloudflare({ api_token: 'tok', account_id: 'manual' }, fetchImpl);

    // No account returned → nothing to merge; original account_id untouched.
    assert.equal(out.account_id, 'manual');
});

// =============================================================================
// (c) enrichCloudflare — best-effort failure handling
// =============================================================================
console.log('enrichCloudflare (failure / best-effort):');
await test('returns input unchanged when fetch throws', async () => {
    const out = await enrichCloudflare({ api_token: 'tok', foo: 1 }, fetchThrowing);
    assert.deepEqual(out, { api_token: 'tok', foo: 1 });
    assert.ok(!('account_id' in out), 'no account_id merged on failure');
});

await test('returns input unchanged when API responds non-200', async () => {
    const fetchImpl = stubFetch({
        [ACCOUNTS_URL]: () => ({ status: 401, body: { errors: [{ message: 'bad token' }] } }),
    });
    const out = await enrichCloudflare({ api_token: 'bad', keep: 'me' }, fetchImpl);
    assert.equal(calls.length, 1);
    assert.deepEqual(out, { api_token: 'bad', keep: 'me' });
});

await test('returns input unchanged when response JSON is malformed', async () => {
    const fetchImpl = async (input, init = {}) => {
        calls.push({ url: String(input), headers: init.headers ?? {} });
        return new Response('not json', { status: 200 });
    };
    const out = await enrichCloudflare({ api_token: 'tok' }, fetchImpl);
    assert.deepEqual(out, { api_token: 'tok' });
});

await test('returns input unchanged when no api_token is present', async () => {
    const fetchImpl = stubFetch({});
    const out = await enrichCloudflare({ account_id: 'manual', db: 'x' }, fetchImpl);
    assert.equal(calls.length, 0, 'no fetch should happen without an api_token');
    assert.deepEqual(out, { account_id: 'manual', db: 'x' });
});

await test('result array missing id is treated as no account', async () => {
    const fetchImpl = stubFetch({
        [ACCOUNTS_URL]: () => ({ body: { result: [{ name: 'NoId' }] } }),
    });
    const out = await enrichCloudflare({ api_token: 'tok' }, fetchImpl);
    assert.ok(!('account_id' in out), 'account_id must not be set when id absent');
});

console.log(`\nAll ${testsPassed} Cloudflare provider tests passed.`);
