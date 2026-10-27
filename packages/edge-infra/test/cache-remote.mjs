/**
 * Remote-cache adapter tests: upstashCache over a fetch double (pipeline
 * command body, Bearer, RULE 3 fresh-copy parse, error propagation), tenant
 * isolation of prefixedCache on a SHARED inner, and resilientCache
 * degrade → cooldown → recover.
 */
import { strict as assert } from 'node:assert';
import { memoryCache, prefixedCache, resilientCache } from '../dist/cache/providers.js';
import { upstashCache } from '../dist/cache/upstash.js';

let failures = 0;
const check = (label, cond) => { if (cond) console.log(`  ✅ ${label}`); else { failures++; console.log(`  ❌ ${label}`); } };

/** Fetch double: records every call; answers by shifting scripted bodies. */
function makeFetch() {
    const state = { calls: [], script: [] };
    const impl = async (input, init) => {
        state.calls.push({ url: String(input), init });
        const next = state.script.shift() ?? { status: 200, body: 'null' };
        return new Response(next.body, {
            status: next.status ?? 200,
            headers: { 'content-type': 'application/json' },
        });
    };
    state.impl = impl;
    return state;
}

// ── upstashCache ─────────────────────────────────────────────────────────────
{
    const f = makeFetch();
    const c = upstashCache({ url: 'https://c1.upstash.io', token: 'tok-1', fetchImpl: f.impl });

    // setex → one POST with the pipeline command + Bearer
    f.script.push({ body: '"OK"' });
    await c.setex('k', 5, '"v1"');
    const call = f.calls.at(-1);
    check('upstash: setex posts one command', call.url === 'https://c1.upstash.io' && call.init.method === 'POST');
    check('upstash: setex body is the pipeline command',
        JSON.stringify(JSON.parse(call.init.body)) === JSON.stringify(['set', 'k', '"v1"', 'EX', 5]));
    check('upstash: Bearer + JSON content type',
        call.init.headers.Authorization === 'Bearer tok-1' && call.init.headers['content-type'] === 'application/json');

    // get: wire form is the stored string JSON-encoded ('"{\\"a\\":1}"')
    f.script.push({ body: JSON.stringify(JSON.stringify({ a: 1 })) });
    f.script.push({ body: JSON.stringify(JSON.stringify({ a: 1 })) });
    const g1 = await c.get('k');
    const g2 = await c.get('k');
    check('upstash: get parses the JSON value', g1 && g1.a === 1);
    g1.a = 999;
    check('RULE 3: upstash get returns a fresh copy', g1 !== g2 && g2.a === 1);

    // miss
    f.script.push({ body: 'null' });
    check('upstash: get miss → null', (await c.get('absent')) === null);

    // del: zero keys → 0 WITHOUT a request
    const callsBefore = f.calls.length;
    check('upstash: del() with no keys → 0, no request', (await c.del()) === 0 && f.calls.length === callsBefore);

    // del: multi-key command shape
    f.script.push({ body: '2' });
    check('upstash: del returns the count', (await c.del('k1', 'k2')) === 2
        && JSON.stringify(JSON.parse(f.calls.at(-1).init.body)) === JSON.stringify(['del', 'k1', 'k2']));

    // HTTP failure
    f.script.push({ status: 500, body: 'err' });
    await assert.rejects(() => c.get('k'), /upstash_http_500/, 'upstash: !ok → upstash_http_500');

    // Upstash error envelope
    f.script.push({ body: '{"error":"boom"}' });
    await assert.rejects(() => c.get('k'), /upstash_error:boom/, 'upstash: error object → upstash_error');

    // pipeline-style array unwrap (some proxies answer [result])
    f.script.push({ body: '[["k1","k2"]]' });
    check('upstash: pipeline array unwrapped', JSON.stringify(await c.keys('*')) === JSON.stringify(['k1', 'k2']));
}

// ── prefixedCache — tenant isolation on ONE shared inner ────────────────────
{
    const shared = memoryCache();
    const a = prefixedCache(shared, 'tenant-a');
    const b = prefixedCache(shared, 'tenant-b');

    await a.setex('shared-key', 60, JSON.stringify('a-value'));
    check('prefixed: tenant-b cannot see tenant-a key', (await b.get('shared-key')) === null);
    check('prefixed: underlying key is t:tenant-a:…',
        (await shared.get('t:tenant-a:shared-key')) === 'a-value');
    await b.setex('shared-key', 60, JSON.stringify('b-value'));
    check('prefixed: same logical key isolated per tenant',
        (await a.get('shared-key')) === 'a-value' && (await b.get('shared-key')) === 'b-value');

    const aKeys = await a.keys('*');
    check('prefixed: keys() scoped to own space + stripped',
        aKeys.includes('shared-key') && !aKeys.some((k) => k.startsWith('t:')));

    // del through one tenant never touches the other's key
    await a.del('shared-key');
    check('prefixed: del scoped per tenant', (await a.get('shared-key')) === null && (await b.get('shared-key')) === 'b-value');
}

// ── resilientCache — degrade → cooldown → recover ────────────────────────────
{
    let fail = true;
    let resolves = 0;
    const errors = [];
    const fallback = memoryCache();
    const flaky = () => ({
        async get(key) { if (fail) throw new Error('dead'); return `inner:${key}`; },
        async set() { if (fail) throw new Error('dead'); },
        async setex() { if (fail) throw new Error('dead'); },
        async del() { if (fail) throw new Error('dead'); return 0; },
        async keys() { if (fail) throw new Error('dead'); return []; },
        async incr() { if (fail) throw new Error('dead'); return 1; },
        async expire() { if (fail) throw new Error('dead'); return 0; },
    });
    const rc = resilientCache({
        resolve: () => { resolves++; return flaky(); },
        fallback,
        cooldownMs: 25,
        onError: (e) => errors.push(String(e)),
    });

    check('resilient: first failure serves fallback (null miss)', (await rc.get('k')) === null);
    check('resilient: outage announced exactly once', errors.length === 1 && resolves === 1);

    // Still in cooldown: served from fallback WITHOUT re-resolving or re-announcing.
    await rc.setex('k', 60, JSON.stringify('fb'));
    check('resilient: cooldown serves fallback writes', (await rc.get('k')) === 'fb');
    check('resilient: no re-resolve during cooldown', resolves === 1 && errors.length === 1);

    // Post-cooldown recovery: re-resolve, real adapter, no new announcement.
    await new Promise((r) => setTimeout(r, 40));
    fail = false;
    check('resilient: recovery re-resolves the real adapter', (await rc.get('k')) === 'inner:k' && resolves === 2);

    // A NEW outage announces again (announced reset on success).
    fail = true;
    await rc.get('k');
    check('resilient: a fresh outage announces again', errors.length === 2 && (await rc.get('k')) === 'fb');
}

console.log(failures === 0 ? '\ncache-remote: PASS ✅' : `\ncache-remote: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
