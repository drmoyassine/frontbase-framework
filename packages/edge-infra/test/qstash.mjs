/**
 * QStash façade: publish wire shape (hand-rolled POST vs a fetch double) and
 * Receiver verification against FORGED v2 JWTs — the exact format the SDK
 * checks (jose.jwtVerify, HS256 over `header.payload`, iss "Upstash", body
 * claim = base64url SHA-256 of the raw bytes). Forging proves the verify math,
 * not just that well-formed strings round-trip: wrong key, tampered body,
 * expiry, and key rotation all have to land on false/true for the right reason.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { qstashPublish, makeQstashReceiver } from '../dist/queue/qstash.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const DEST = 'https://cms.example/api/system/queue/receive';

/** Fetch double: records calls, shifts scripted responses. */
function makeFetch(script) {
    const calls = [];
    const fetchImpl = async (input, init) => {
        calls.push({ url: String(input), init });
        const next = typeof script === 'function' ? script(calls.length) : script.shift();
        if (next instanceof Error) throw next;
        return new Response(next.body, { status: next.status ?? 200 });
    };
    return { calls, fetchImpl };
}

// ---- forge: a v2 signature exactly as QStash issues it ----------------------

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const enc = new TextEncoder();

/** Sign `rawBody` with `key` as a QStash v2 JWT. `claims` overrides (exp in
 *  the past, foreign issuer, …) let tests target each verify check. */
async function forge(key, rawBody, claims = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        iss: 'Upstash',
        body: b64u(createHash('sha256').update(rawBody).digest()),
        iat: nowSec - 10,
        nbf: nowSec - 10,
        exp: nowSec + 300,
        ...claims,
    };
    const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
    const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = b64u(await globalThis.crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data)));
    return `${data}.${sig}`;
}

// ---- publish -----------------------------------------------------------------

test('publish: exact wire shape (encoded destination, Bearer, retries, forwarded headers)', async () => {
    const { calls, fetchImpl } = makeFetch([{ body: '{"messageId":"msg_1"}' }]);
    const out = await qstashPublish({
        token: 'q-token',
        url: DEST,
        body: '{"type":"execution"}',
        headers: { 'x-frontbase-callback-secret': 'cb' },
        retries: 3,
        fetchImpl,
    });
    assert.deepEqual(out, { messageId: 'msg_1' });
    const call = calls[0];
    assert.equal(call.url, `https://qstash.upstash.io/v2/publish/${encodeURIComponent(DEST)}`);
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.headers.Authorization, 'Bearer q-token');
    assert.equal(call.init.headers['content-type'], 'application/json');
    assert.equal(call.init.headers['Upstash-Retries'], '3');
    assert.equal(call.init.headers['Upstash-Forward-x-frontbase-callback-secret'], 'cb');
    assert.equal(call.init.body, '{"type":"execution"}');
});

test('publish: no optional headers/retries → lean header set', async () => {
    const { calls, fetchImpl } = makeFetch([{ body: '{}' }]);
    await qstashPublish({ token: 't', url: DEST, body: 'x', fetchImpl });
    const headers = calls[0].init.headers;
    assert.ok(!('Upstash-Retries' in headers));
    assert.equal(Object.keys(headers).filter((h) => h.startsWith('Upstash-Forward-')).length, 0);
});

test('publish: non-2xx → qstash_http_{status} (the resolver downgrades to direct execution)', async () => {
    const { fetchImpl } = makeFetch([{ status: 500, body: 'boom' }]);
    await assert.rejects(
        () => qstashPublish({ token: 't', url: DEST, body: 'x', fetchImpl }),
        /qstash_http_500/,
    );
});

// ---- verify ------------------------------------------------------------------

test('verify: a correctly forged v2 signature verifies against the current key', async () => {
    const receiver = makeQstashReceiver({ currentSigningKey: 'sig_cur', nextSigningKey: 'sig_next' });
    const raw = '{"type":"execution","tenant":"tenant-a"}';
    assert.equal(await receiver.verify(await forge('sig_cur', raw), raw), true);
});

test('verify: rotation — a next-key signature verifies (current fails, next falls through)', async () => {
    const receiver = makeQstashReceiver({ currentSigningKey: 'sig_cur', nextSigningKey: 'sig_next' });
    const raw = '{"job":1}';
    assert.equal(await receiver.verify(await forge('sig_next', raw), raw), true);
});

test('verify: wrong key → false (never throws)', async () => {
    const receiver = makeQstashReceiver({ currentSigningKey: 'sig_cur', nextSigningKey: 'sig_next' });
    const raw = '{"job":1}';
    assert.equal(await receiver.verify(await forge('an-attacker-key', raw), raw), false);
});

test('verify: tampered body → false (signature over other bytes)', async () => {
    const receiver = makeQstashReceiver({ currentSigningKey: 'sig_cur' });
    const sig = await forge('sig_cur', '{"job":1}');
    assert.equal(await receiver.verify(sig, '{"job":2}'), false);
});

test('verify: expired → false', async () => {
    const receiver = makeQstashReceiver({ currentSigningKey: 'sig_cur' });
    const nowSec = Math.floor(Date.now() / 1000);
    const sig = await forge('sig_cur', '{"job":1}', { exp: nowSec - 3600 });
    assert.equal(await receiver.verify(sig, '{"job":1}'), false);
});

test('verify: foreign issuer → false', async () => {
    const receiver = makeQstashReceiver({ currentSigningKey: 'sig_cur' });
    const sig = await forge('sig_cur', '{"job":1}', { iss: 'Someone Else' });
    assert.equal(await receiver.verify(sig, '{"job":1}'), false);
});

test('verify: garbage input → false, not a throw', async () => {
    const receiver = makeQstashReceiver({ currentSigningKey: 'sig_cur' });
    assert.equal(await receiver.verify('not-a-jwt', '{"job":1}'), false);
    assert.equal(await receiver.verify('', '{"job":1}'), false);
});

let failures = 0;
for (const [name, fn] of tests) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failures++;
        console.log(`  ❌ ${name}\n     ${e.message}`);
    }
}
console.log(failures === 0 ? '\nqstash: PASS ✅' : `\nqstash: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
