/** Cloud domain deployment: real endpoint contracts, no destructive route takeover. */
import assert from 'node:assert/strict';
import { attachWorkerDomains, cloudHostnames, ZoneNotFoundError } from '../dist/cli/cloud-domains.js';
const TOKEN = 'secret-sentinel-not-for-output';
const HOSTS = cloudHostnames('frontbase.dev');
function fixture(options = {}) {
    const calls = [];
    const routes = [...(options.routes ?? [])];
    const reply = (result, status = 200) => ({ ok: status < 400, status, json: async () => ({ success: status < 400, result }) });
    const fetcher = async (url, init = {}) => {
        const u = new URL(url), method = init.method ?? 'GET';
        const body = init.body ? JSON.parse(init.body) : undefined;
        calls.push({ url: u, method, body, headers: init.headers });
        if (u.pathname === '/client/v4/zones') return reply(options.zoneFail ? [] : [{ id: 'zone' }], options.zoneFail ? 403 : 200);
        if (u.pathname.endsWith('/workers/domains')) {
            assert.equal(method, 'PUT');
            assert.equal(body.hostname, 'app.frontbase.dev', 'wildcards must NEVER reach Custom Domains');
            assert.equal(body.service, 'cloud');
            assert.equal(body.environment, 'production');
            assert.equal(body.zone_id, 'zone');
            return reply({ id: 'domain' });
        }
        if (u.pathname.endsWith('/dns_records')) {
            assert.equal(method, 'GET', 'DNS is read-only');
            assert.equal(u.searchParams.get('name'), '*.frontbase.dev');
            if (options.dnsDenied) return reply([], 403);
            return reply(options.missingDns ? [] : [{ name: '*.frontbase.dev', type: 'CNAME', proxied: !options.unproxied }]);
        }
        if (u.pathname.endsWith('/workers/routes')) {
            if (method === 'GET') {
                if (options.routeDenied) return reply([], 403);
                const page = Number(u.searchParams.get('page'));
                const res = reply(options.pages ? (options.pages[page - 1] ?? []) : routes);
                return { ...res, json: async () => ({ success: true, result: options.pages ? options.pages[page - 1] : routes, result_info: { total_pages: options.pages?.length ?? 1 } }) };
            }
            assert.equal(method, 'POST', 'existing routes must NEVER be overwritten');
            assert.deepEqual(body, { pattern: '*.frontbase.dev/*', script: 'cloud' });
            if (options.createFail) return { ok: false, status: 502, json: async () => { throw new Error('non-JSON'); } };
            routes.push(body);
            return reply({ id: 'route' });
        }
        throw new Error('Unexpected endpoint');
    };
    return { calls, routes, fetcher };
}
const attach = (f) => attachWorkerDomains('account', TOKEN, 'frontbase.dev', HOSTS, 'cloud', f.fetcher);
const posts = (f) => f.calls.filter((c) => c.method === 'POST');
let count = 0;
async function test(name, run) { await run(); count++; console.log(`PASS ${name}`); }
await test('app Custom Domain plus wildcard route over proxied DNS', async () => {
    const f = fixture(); const result = await attach(f);
    assert.deepEqual(result, { zoneId: 'zone', attached: HOSTS, failed: [] });
    assert.equal(posts(f).length, 1);
    assert.equal(f.calls[0].url.searchParams.get('name'), 'frontbase.dev');
    for (const c of f.calls) {
        assert.equal(c.headers.Authorization, `Bearer ${TOKEN}`);
        assert.ok(!JSON.stringify({ url: c.url, body: c.body }).includes(TOKEN));
    }
    assert.ok(!JSON.stringify(result).includes(TOKEN));
});
await test('re-run reuses the existing owned route without a duplicate POST', async () => {
    const f = fixture(); await attach(f); const result = await attach(f);
    assert.deepEqual(result.attached, HOSTS); assert.equal(posts(f).length, 1);
});
for (const option of ['missingDns', 'unproxied', 'dnsDenied', 'routeDenied']) {
    await test(`${option} fails closed while preserving app-host success`, async () => {
        const f = fixture({ [option]: true }); const result = await attach(f);
        assert.deepEqual(result.attached, ['app.frontbase.dev']);
        assert.equal(result.failed[0].hostname, '*.frontbase.dev'); assert.equal(posts(f).length, 0);
    });
}
for (const script of ['other-worker', undefined]) {
    await test(`preserves ${script ?? 'no-worker exclusion'} route`, async () => {
        const f = fixture({ routes: [{ pattern: '*.frontbase.dev/*', script }] });
        const result = await attach(f); assert.equal(result.failed[0].status, 409); assert.equal(posts(f).length, 0);
    });
}
await test('inspects later route pages before creating a route', async () => {
    const f = fixture({ pages: [[], [{ pattern: '*.frontbase.dev/*', script: 'other-worker' }]] });
    const result = await attach(f); assert.equal(result.failed[0].status, 409); assert.equal(posts(f).length, 0);
});
await test('non-JSON route creation failure reports safe partial state', async () => {
    const f = fixture({ createFail: true }); const result = await attach(f);
    assert.equal(result.failed[0].status, 502); assert.deepEqual(result.attached, ['app.frontbase.dev']);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
});
await test('zone failure is explicit', async () => {
    await assert.rejects(attach(fixture({ zoneFail: true })), ZoneNotFoundError);
});
await test('missing required inputs make no API calls', async () => {
    const f = fixture();
    for (const args of [['', TOKEN, HOSTS, 'cloud'], ['account', '', HOSTS, 'cloud'], ['account', TOKEN, [], 'cloud'], ['account', TOKEN, HOSTS, '']]) {
        await assert.rejects(attachWorkerDomains(args[0], args[1], 'frontbase.dev', args[2], args[3], f.fetcher));
    }
    assert.equal(f.calls.length, 0);
});
await test('hostname generation preserves custom app label', async () => {
    assert.deepEqual(HOSTS, ['app.frontbase.dev', '*.frontbase.dev']);
    assert.deepEqual(cloudHostnames('frontbase.dev', 'console'), ['console.frontbase.dev', '*.frontbase.dev']);
});
console.log(`cloud-domains: ${count} tests PASS`);
