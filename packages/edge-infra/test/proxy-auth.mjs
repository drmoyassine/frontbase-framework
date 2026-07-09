/**
 * proxy-auth test (M2.1.3) — resolvePrincipal wired into createEngine; the
 * Edge Data Proxy enforces scope deny-by-default. RULE 2: a valid session on a
 * tenant-scoped query → 200 with the session's tenant; forged/absent → 401;
 * a client-supplied `tenant` param is ignored (can't override the session).
 */
import { createEngine, directProvider, configureEngine } from '@frontbase/edge-core';
import { createResolvePrincipal } from '../dist/proxy/auth.js';
import { sqliteDataProvider } from '../dist/providers/sqlite.js';
import { asDataProvider } from '../dist/providers/base.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// A tenant-scoped query that echoes the resolved tenant (proves ctx.tenant wiring).
const manifest = {
    version: 't',
    pages: {},
    queries: {
        'whoami': { queryId: 'whoami', scope: 'tenant', async execute(_p, ctx) { return [{ tenant: ctx.tenant }]; } },
        'pub': { queryId: 'pub', scope: 'public', async execute() { return [{ ok: true }]; } },
    },
};
const provider = asDataProvider(sqliteDataProvider({ manifest }));

async function makeEngine(authCfg) {
    const resolvePrincipal = createResolvePrincipal(authCfg);
    const app = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
    configureEngine({ edition: 'community', nodeEnv: 'test', resolvePrincipal });
    return app;
}
async function post(engine, queryId, body = {}, headers = {}) {
    return engine.fetch(new Request('http://t.local/api/data/' + queryId, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
}

// Build a real HS256 JWT for tenant-A
async function makeJwt(payload, secret) {
    const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const header = b64url({ alg: 'HS256', typ: 'JWT' });
    const body = b64url(payload);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`)));
    const sigB64 = Buffer.from(sig).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${header}.${body}.${sigB64}`;
}

const SECRET = 'test-jwt-secret';
const jwtA = await makeJwt({ sub: 'user-A', tenant_slug: 'tenant-A', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
const jwtExpired = await makeJwt({ sub: 'user-A', tenant_slug: 'tenant-A', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);

const engine = await makeEngine({ jwtSecret: SECRET });

// valid session on tenant-scoped query → 200, server's resolved tenant
let r = await post(engine, 'whoami', {}, { authorization: `Bearer ${jwtA}` });
check('valid JWT on tenant-scoped query → 200', r.status === 200);
check('server resolves the session tenant (tenant-A)', (await r.json())[0].tenant === 'tenant-A');

// client tries to spoof a different tenant via body → IGNORED
r = await post(engine, 'whoami', { tenant: 'tenant-B' }, { authorization: `Bearer ${jwtA}` });
check('client-supplied tenant param is IGNORED (RULE 2)', (await r.json())[0].tenant === 'tenant-A');

// no credential on tenant-scoped query → 401 (deny-by-default)
r = await post(engine, 'whoami', {});
check('no credential on tenant-scoped query → 401', r.status === 401);

// expired JWT → treated as anonymous → 401
r = await post(engine, 'whoami', {}, { authorization: `Bearer ${jwtExpired}` });
check('expired JWT → 401', r.status === 401);

// public query with no credential → 200
r = await post(engine, 'pub', {});
check('public query, no credential → 200', r.status === 200);

// API-key auth: hash of a known token, scoped to tenant-B
const knownToken = 'sk_live_demo_token';
const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(knownToken));
const hashHex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
const engine2 = await makeEngine({ apiKeyHashes: [{ hash: hashHex, tenantSlug: 'tenant-B' }] });
r = await post(engine2, 'whoami', {}, { authorization: `Bearer ${knownToken}` });
check('valid API key resolves tenant-B', r.status === 200 && (await r.json())[0].tenant === 'tenant-B');
r = await post(engine2, 'whoami', {}, { authorization: 'Bearer wrong-token' });
check('wrong API key → 401', r.status === 401);

console.log(failures === 0 ? '\nproxy-auth: PASS ✅' : `\nproxy-auth: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
