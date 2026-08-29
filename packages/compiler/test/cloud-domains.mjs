/**
 * A-25 WA9 — `attachWorkerDomains` against an injected Cloudflare double
 * (plan V1: the live Custom Domains API's wildcard acceptance can't be proven
 * from a repo, so the seam pins the REQUEST SHAPE and the failure contract;
 * the dashboard fallback is documented for live refusals).
 *
 * Security invariants pinned here: the API token travels ONLY in the
 * Authorization header (never argv/log/result), and per-hostname failures
 * degrade to structured `failed` rows instead of aborting the remaining
 * attaches (partial progress is real state on Cloudflare — upsert is
 * idempotent, so a retry only ever touches what failed).
 */
import { attachWorkerDomains, cloudHostnames, ZoneNotFoundError } from '../dist/cli/cloud-domains.js';

let failures = 0;
// Async-aware: predicates may return booleans or Promises of booleans.
const check = async (l, c) => { if (await c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

/** Deterministic CF double: records every request, answers from a script. */
function makeCf({ zoneId = 'zone-123', zoneOk = true, failHostname = null } = {}) {
    const requests = [];
    const cf = async (input, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : undefined;
        const url = new URL(input);
        requests.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body });
        if (url.pathname === '/client/v4/zones') {
            return { ok: zoneOk, status: zoneOk ? 200 : 403, json: async () => ({ result: zoneOk ? [{ id: zoneId }] : [] }) };
        }
        if (url.pathname === '/client/v4/accounts/acct-9/workers/domains' && init.method === 'PUT') {
            if (failHostname && body?.hostname === failHostname) {
                return { ok: false, status: 400, json: async () => ({ errors: [{ message: `custom domain for "${failHostname}" is not allowed` }] }) };
            }
            return { ok: true, status: 200, json: async () => ({ result: { id: 'dom-1' } }) };
        }
        return { ok: false, status: 404, json: async () => ({ errors: [{ message: 'route not matched' }] }) };
    };
    cf.requests = requests;
    return cf;
}

const TOKEN = 'cf-test-token-0123456789abcdef';
const HOSTNAMES = cloudHostnames('frontbase.dev');

console.log('— request shapes —');
await check('zone is resolved by name with the Bearer token, and its id is reused for the attaches', async () => {
    const cf = makeCf();
    const res = await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', HOSTNAMES, 'frontbase-cloud', cf);
    const zoneReq = cf.requests[0];
    return res.zoneId === 'zone-123'
        && zoneReq.url.pathname === '/client/v4/zones'
        && zoneReq.url.searchParams.get('name') === 'frontbase.dev'
        && zoneReq.headers.Authorization === `Bearer ${TOKEN}`
        && cf.requests.slice(1).every((r) => r.body?.zone_id === 'zone-123');
});
await check('both cloud hostnames PUT to /accounts/{id}/workers/domains with service + production env', async () => {
    const cf = makeCf();
    const res = await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', HOSTNAMES, 'frontbase-cloud', cf);
    const puts = cf.requests.slice(1);
    return res.attached.length === 2 && res.failed.length === 0
        && puts.length === 2 && puts.every((r) => r.method === 'PUT')
        && puts.every((r) => r.url.pathname === '/client/v4/accounts/acct-9/workers/domains')
        && puts.every((r) => r.body?.service === 'frontbase-cloud' && r.body?.environment === 'production')
        && puts[0].body?.hostname === 'app.frontbase.dev'
        && puts[1].body?.hostname === '*.frontbase.dev';
});
await check('token never leaks into the result (header-only transport)', async () => {
    const cf = makeCf({ failHostname: '*.frontbase.dev' });
    const res = await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', HOSTNAMES, 'frontbase-cloud', cf);
    return !JSON.stringify(res).includes(TOKEN);
});

console.log('— idempotency —');
await check('re-attaching the same hostnames is a clean second success (upsert semantics)', async () => {
    const cf = makeCf();
    const first = await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', HOSTNAMES, 'frontbase-cloud', cf);
    const second = await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', HOSTNAMES, 'frontbase-cloud', cf);
    return first.attached.length === 2 && second.attached.length === 2
        && second.failed.length === 0 && cf.requests.length === 6;
});

console.log('— failure contract —');
await check('zone the token cannot see → ZoneNotFoundError naming the zone', async () => {
    const cf = makeCf({ zoneOk: false });
    try {
        await attachWorkerDomains('acct-9', TOKEN, 'ghost.dev', HOSTNAMES, 'frontbase-cloud', cf);
        return false;
    } catch (e) {
        return e instanceof ZoneNotFoundError && e.message.includes('ghost.dev') && e.message.includes('zone_not_found');
    }
});
await check('one refused hostname lands in `failed` with status + API detail; the other still attaches', async () => {
    const cf = makeCf({ failHostname: '*.frontbase.dev' });
    const res = await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', HOSTNAMES, 'frontbase-cloud', cf);
    return res.attached.join(',') === 'app.frontbase.dev'
        && res.failed.length === 1
        && res.failed[0].hostname === '*.frontbase.dev'
        && res.failed[0].status === 400
        && res.failed[0].detail.includes('not allowed');
});
await check('non-JSON error body on an attach degrades to "HTTP <status>" (no throw, other host unaffected)', async () => {
    const cf = makeCf();
    // Wrap: the wildcard attach answers 502 with an unparseable body.
    const wrapped = async (input, init = {}) => {
        const res = await cf(input, init);
        if (init.method === 'PUT' && res.ok === false && JSON.parse(init.body).hostname === '*.frontbase.dev') {
            return { ok: false, status: 502, json: async () => { throw new Error('bad json'); } };
        }
        return res;
    };
    const res = await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', HOSTNAMES, 'frontbase-cloud', wrapped);
    return res.attached.join(',') === 'app.frontbase.dev'
        && res.failed.length === 1
        && res.failed[0].detail === 'HTTP 502';
});
await check('missing accountId / empty hostnames / missing service are rejected up front (zero API calls)', async () => {
    const cf = makeCf();
    let noAccount = false, noHosts = false, noService = false;
    try { await attachWorkerDomains('', TOKEN, 'frontbase.dev', HOSTNAMES, 'svc', cf); } catch { noAccount = true; }
    try { await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', [], 'svc', cf); } catch { noHosts = true; }
    try { await attachWorkerDomains('acct-9', TOKEN, 'frontbase.dev', HOSTNAMES, '', cf); } catch { noService = true; }
    return noAccount && noHosts && noService && cf.requests.length === 0;
});

console.log('— hostname derivation —');
await check('cloudHostnames yields the app host then the wildcard (order = deploy output order)',
    JSON.stringify(cloudHostnames('frontbase.dev')) === JSON.stringify(['app.frontbase.dev', '*.frontbase.dev']));
await check('cloudHostnames honors a custom app label',
    JSON.stringify(cloudHostnames('frontbase.dev', 'console')) === JSON.stringify(['console.frontbase.dev', '*.frontbase.dev']));

console.log(failures === 0 ? 'cloud-domains: PASS ✅' : `cloud-domains: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
