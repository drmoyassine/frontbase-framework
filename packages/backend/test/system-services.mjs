/**
 * System-service resolver (dual wiring): adopted is_default registry row >
 * FRONTBASE_* env > memory — per tenant. Store-level adoption mutations pair
 * with resolver.invalidate(), exactly the composition app.ts performs via the
 * edge-resource mutation hooks. Also covers parseEnvServices (JSON + legacy
 * vars + malformed input) and env-derived system cards.
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { Phase2Store } from '../dist/db/phase2-store.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { createCompatApp } from '../dist/compat/app.js';
import {
    createSystemServiceResolver,
    parseEnvServices,
    envServiceDescriptor,
    ENV_CARD_LABELS,
} from '../dist/compat/system-services.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
/** guardedExternalFetch normalizes through new URL() (bare origins gain "/") —
 *  assert against the same normalization. */
const href = (u) => new URL(u).href;

async function harness(env = {}) {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const cipher = await createSecretCipher('system-services-test-secret');
    const stores = new Map();
    const phase2For = (t) => {
        let s = stores.get(t);
        if (!s) { s = new Phase2Store(runner, t, cipher); stores.set(t, s); }
        return s;
    };
    const fetchCalls = [];
    const externalFetch = async (input, init) => {
        fetchCalls.push({ url: String(input), init });
        return new Response('OK', { status: 200 });
    };
    // resolveTtlMs 0: every cacheFor call re-resolves, so adoption switches are
    // observable immediately (invalidate() is still exercised explicitly).
    const resolver = createSystemServiceResolver({
        phase2For,
        env,
        externalFetch,
        log: () => {},
        resolveTtlMs: 0,
    });
    let clock = 0;
    const now = () => new Date(Date.UTC(2026, 0, 1) + (clock += 60_000)).toISOString();
    const upsert = async (tenant, id, name, url) => {
        await phase2For(tenant).upsertEdgeResource({
            id,
            kind: 'cache',
            name,
            provider: 'upstash',
            config: await cipher.encrypt(JSON.stringify({
                provider: 'upstash', url, token: `tok-${id}`, is_default: true,
            })),
        }, now());
    };
    return { resolver, phase2For, fetchCalls, upsert, now };
}

test('env floor: no rows → env adapter serves prefixed keys', async () => {
    const { resolver, fetchCalls } = await harness({ cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' } });
    const cache = await resolver.cacheFor('tenant-a');
    await cache.setex('enrich:datasources', 5, '[]');
    const call = fetchCalls.at(-1);
    assert.equal(call.url, href('https://env.upstash.io'));
    assert.deepEqual(JSON.parse(call.init.body), ['set', 't:tenant-a:enrich:datasources', '[]', 'EX', 5]);
    assert.equal(call.init.headers.Authorization, 'Bearer env-tok');
});

test('adoption beats env: is_default row wins after invalidate (the mutation-hook composition)', async () => {
    const { resolver, fetchCalls, upsert } = await harness({ cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' } });
    await upsert('tenant-a', 'row-1', 'prod-cache', 'https://row-1.upstash.io');
    resolver.invalidate('tenant-a'); // what onEdgeResourceMutation does
    const cache = await resolver.cacheFor('tenant-a');
    await cache.setex('k', 5, '"v"');
    const call = fetchCalls.at(-1);
    assert.equal(call.url, href('https://row-1.upstash.io'));
    assert.equal(call.init.headers.Authorization, 'Bearer tok-row-1');
    // The row's name surfaces for display (Phase 6 card).
    assert.equal((await resolver.resolvedNames('tenant-a')).cache, 'prod-cache');
});

test('switching the default row re-targets the adapter (PUT-switch composition)', async () => {
    const { resolver, fetchCalls, phase2For, upsert } = await harness({ cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' } });
    await upsert('tenant-a', 'row-1', 'old-cache', 'https://row-1.upstash.io');
    await upsert('tenant-a', 'row-2', 'new-cache', 'https://row-2.upstash.io');
    const store = phase2For('tenant-a');
    await store.setDefaultEdgeResource('cache', 'row-2', new Date().toISOString());
    resolver.invalidate('tenant-a');
    const cache = await resolver.cacheFor('tenant-a');
    await cache.setex('k', 5, '"v"');
    assert.equal(fetchCalls.at(-1).url, href('https://row-2.upstash.io'));
    assert.equal((await resolver.resolvedNames('tenant-a')).cache, 'new-cache');
});

test('cross-tenant: tenant-a adoption never leaks into tenant-b (shared env adapter, disjoint keys)', async () => {
    const { resolver, fetchCalls, upsert } = await harness({ cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' } });
    await upsert('tenant-a', 'row-1', 'a-cache', 'https://row-1.upstash.io');
    resolver.invalidate(); // both tenants
    await (await resolver.cacheFor('tenant-a')).setex('k', 5, '"a"');
    await (await resolver.cacheFor('tenant-b')).setex('k', 5, '"b"');
    const urls = fetchCalls.map((c) => c.url);
    // tenant-a → its adopted row; tenant-b → env (its registry is empty)
    assert.equal(urls.at(-2), href('https://row-1.upstash.io'));
    assert.equal(urls.at(-1), href('https://env.upstash.io'));
    // The isolation criterion: one shared env adapter, disjoint prefixed keys.
    const key = (i) => JSON.parse(fetchCalls[i].init.body)[1];
    assert.equal(key(fetchCalls.length - 2), 't:tenant-a:k');
    assert.equal(key(fetchCalls.length - 1), 't:tenant-b:k');
    // Display names stay per-tenant too.
    const names = await resolver.resolvedNames('tenant-b');
    assert.notEqual(names.cache, 'a-cache');
});

test('registry unreadable → env still serves (never throw)', async () => {
    const fetchCalls = [];
    const resolver = createSystemServiceResolver({
        phase2For: () => { throw new Error('store down'); },
        env: { cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' } },
        externalFetch: async (input, init) => {
            fetchCalls.push({ url: String(input), init });
            return new Response('OK', { status: 200 });
        },
        log: () => {},
        resolveTtlMs: 0,
    });
    const cache = await resolver.cacheFor('tenant-a');
    await cache.setex('k', 5, '"v"');
    assert.equal(fetchCalls.at(-1).url, href('https://env.upstash.io'));
});

test('memory floor: no env, no rows → in-process round-trip, zero fetches', async () => {
    const { resolver, fetchCalls } = await harness({});
    const cache = await resolver.cacheFor('tenant-a');
    await cache.setex('k', 60, JSON.stringify({ v: 1 }));
    assert.deepEqual(await cache.get('k'), { v: 1 });
    assert.equal(fetchCalls.length, 0);
});

test('parseEnvServices: FRONTBASE_* JSON (both casings), legacy vars, malformed input', async () => {
    const warns = [];
    const warn = (m) => warns.push(m);

    const envServices = parseEnvServices({
        FRONTBASE_CACHE: '{"provider":"upstash","url":"https://c.example","token":"t"}',
        FRONTBASE_QUEUE: '{"provider":"qstash","signing_key":"sk","next_signing_key":"nsk"}',
        FRONTBASE_VECTOR: '{"provider":"turso","url":"libsql://v.example","api_token":"vt"}',
        PUBLIC_URL: 'https://cms.example',
        FRONTBASE_QUEUE_CALLBACK_SECRET: 'cb-secret',
    }, warn);
    assert.equal(envServices.cache.url, 'https://c.example');
    assert.equal(envServices.queue.provider, 'qstash');
    assert.equal(envServices.queue.signingKey, 'sk');
    assert.equal(envServices.queue.nextSigningKey, 'nsk');
    assert.equal(envServices.vector.token, 'vt'); // api_token alias
    assert.equal(envServices.publicUrl, 'https://cms.example');
    assert.equal(envServices.queueCallbackSecret, 'cb-secret');
    assert.equal(warns.length, 0);

    // Legacy single-var fallbacks.
    const legacy = parseEnvServices({
        FRONTBASE_CACHE_URL: 'https://legacy.upstash.io',
        FRONTBASE_CACHE_TOKEN: 'legacy-tok',
        QSTASH_TOKEN: 'q-token',
        BULLMQ_REDIS_URL: 'redis://legacy:6379',
    }, warn);
    assert.equal(legacy.cache.provider, 'upstash');
    assert.equal(legacy.cache.token, 'legacy-tok');
    assert.equal(legacy.queue.provider, 'qstash'); // QStash wins over BullMQ

    // Invalid JSON warns and degrades to none — never crashes the worker.
    const broken = parseEnvServices({ FRONTBASE_CACHE: '{not json' }, warn);
    assert.equal(broken.cache, undefined);
    assert.ok(warns.some((m) => m.includes('FRONTBASE_CACHE')));
});

test('envServiceDescriptor: cards only for complete env wiring', async () => {
    assert.equal(envServiceDescriptor(undefined, ENV_CARD_LABELS.cache), null);
    assert.equal(envServiceDescriptor({ provider: 'upstash' }, ENV_CARD_LABELS.cache), null); // no url
    assert.equal(envServiceDescriptor({ provider: 'none', url: 'https://x' }, ENV_CARD_LABELS.cache), null);
    const card = envServiceDescriptor({ provider: 'upstash', url: 'https://c.example' }, ENV_CARD_LABELS.cache);
    assert.equal(card.name, 'Upstash Redis (env)');
    assert.equal(card.provider, 'upstash');
    assert.equal(envServiceDescriptor({ provider: 'weird', url: 'https://x' }, ENV_CARD_LABELS.cache).name, 'weird (env)');
});

// ---- vector (Phase 4): adapters, resolution, real test-connection probe -----

test('vectorFor: env floor resolves a real libsql adapter (ping round-trips a file: db)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontbase-sysvec-'));
    try {
        const { resolver } = await harness({ vector: { provider: 'libsql', url: `file:${join(dir, 'v.db')}` } });
        const adapter = await resolver.vectorFor('tenant-a');
        assert.ok(adapter, 'env-declared vector resolves');
        await adapter.ping();
        assert.equal((await resolver.resolvedNames('tenant-a')).vector, 'LibSQL Vector (env)');
    } finally {
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* open handle — tmpdir sweep */ }
    }
});

test('vectorFor: registry adoption + env floor + empty → null (resolution chain)', async () => {
    const cipher = await createSecretCipher('system-services-test-secret');
    const { resolver, phase2For, fetchCalls, now } = await harness({
        vector: { provider: 'vectorize', cfAccountId: 'env-acct', cfApiToken: 'env-tok', url: 'https://env.example/idx' },
    });
    const encrypt = async (obj) => cipher.encrypt(JSON.stringify(obj));
    await phase2For('tenant-a').upsertEdgeResource({
        id: 'vec-1', kind: 'vector', name: 'prod-vector', provider: 'vectorize',
        config: await encrypt({
            provider: 'vectorize',
            url: 'https://row.example/row-idx',
            provider_config: { cf_account_id: 'row-acct', cf_api_token: 'row-tok', index_name: 'row_idx' },
            is_default: true,
        }),
    }, now());
    resolver.invalidate('tenant-a');
    // Probe the adopted adapter through a recorded search (harness fetch answers 200 'OK').
    const adopted = await resolver.vectorFor('tenant-a');
    assert.ok(adopted);
    await adopted.search('docs', [0.1], 1).catch(() => {});
    assert.ok(fetchCalls.at(-1).url.includes('/accounts/row-acct/vectorize/indexes/row_idx'), fetchCalls.at(-1).url);

    // tenant-b has no rows → the env adapter (different account).
    const envAdapter = await resolver.vectorFor('tenant-b');
    assert.ok(envAdapter);
    await envAdapter.search('docs', [0.1], 1).catch(() => {});
    assert.ok(fetchCalls.at(-1).url.includes('/accounts/env-acct/'));

    // No env, no rows → null (RAG unavailable).
    const bare = await harness({});
    assert.equal(await bare.resolver.vectorFor('tenant-a'), null);
});

test('vector test-connection: supported provider runs the real probe through the route', async () => {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const calls = [];
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1', role: 'master_admin' }, tenant: 'tenant-a' }),
        sessionSecret: 'vector-probe-secret',
        now: () => new Date(0).toISOString(),
        externalFetch: async (input, init) => {
            calls.push({ url: String(input), init });
            const u = String(input);
            if (u.endsWith('/upsert')) return new Response('{"result":{}}', { status: 200 });
            if (u.endsWith('/query')) return new Response('{"result":{"matches":[{"id":"p","score":1,"metadata":{"text":"probe"}}]}}', { status: 200 });
            if (u.endsWith('/delete_by_ids')) return new Response('{"result":{}}', { status: 200 });
            return new Response('{}', { status: 200 });
        },
    });
    const res = await app.fetch(new Request('http://t.local/api/edge-vectors/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            provider: 'vectorize',
            vector_url: 'https://probe.example/vector',
            provider_config: { cf_account_id: 'acct_9', cf_api_token: 'tok_9', index_name: 'idx_9' },
        }),
    }));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, 'vector connection test successful');
    assert.ok(typeof body.latency_ms === 'number');
    assert.deepEqual(calls.map((c) => c.url.split('/').at(-1)), ['upsert', 'query', 'delete_by_ids']);
    assert.ok(calls.every((c) => c.url.includes('/accounts/acct_9/vectorize/indexes/idx_9')));
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_9');
});

test('vector test-connection: probe failure surfaces the adapter error; legacy GET path intact for unknown providers', async () => {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const calls = [];
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1', role: 'master_admin' }, tenant: 'tenant-a' }),
        sessionSecret: 'vector-probe-secret',
        now: () => new Date(0).toISOString(),
        externalFetch: async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response('denied', { status: 403 });
        },
    });
    const post = (bodyJson) => app.fetch(new Request('http://t.local/api/edge-vectors/test-connection', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyJson),
    }));
    // Supported provider: the probe fails with the Vectorize error.
    const failed = await (await post({
        provider: 'vectorize', vector_url: 'https://probe.example/vector',
        provider_config: { cf_account_id: 'a', cf_api_token: 't', index_name: 'i' },
    })).json();
    assert.equal(failed.success, false);
    assert.match(failed.message, /vector connection test failed: Vectorize upsert failed: 403/);
    // Unknown provider keeps the legacy single GET probe (byte-identical path).
    calls.length = 0;
    const legacy = await (await post({ provider: 'pgvector', vector_url: 'https://db.example/x' })).json();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(legacy.message, 'vector returned 403');
    // URL-format gate stays first and unchanged.
    const gate = await (await post({ provider: 'libsql', vector_url: 'weird-scheme://x' })).json();
    assert.equal(gate.success, false);
    assert.equal(gate.message, 'Invalid URL format: must start with one of postgres://, postgresql://, https://, http://, libsql://');
    assert.equal(gate.error_code, 'INVALID_URL');
});

// ---- cache/queue test-connection: real probes for REST-only endpoints ----
// Upstash answers ONLY POST command pipelines (a bare GET is a 400 even when
// the endpoint is healthy), and QStash's root rejects GET — so both kinds now
// probe through the wire format the runtime actually uses.

test('cache test-connection: upstash runs the real adapter probe (POST pipeline, not GET)', async () => {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const calls = [];
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1', role: 'master_admin' }, tenant: 'tenant-a' }),
        sessionSecret: 'cache-probe-secret',
        now: () => new Date(0).toISOString(),
        externalFetch: async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response('"OK"', { status: 200 });
        },
    });
    const post = (bodyJson) => app.fetch(new Request('http://t.local/api/edge-caches/test-connection', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyJson),
    }));
    const ok = await (await post({ name: 'probe-cache', provider: 'upstash', cache_url: 'https://probe.example/cache', cache_token: 'tok_c' })).json();
    assert.equal(ok.success, true);
    assert.equal(ok.message, 'cache connection test successful');
    assert.ok(typeof ok.latency_ms === 'number');
    // set → get → del, every one a POST pipeline with the Bearer token.
    assert.deepEqual(calls.map((c) => JSON.parse(c.init.body)[0]), ['set', 'get', 'del']);
    assert.ok(calls.every((c) => c.init.method === 'POST'));
    assert.ok(calls.every((c) => c.init.headers.Authorization === 'Bearer tok_c'));

    // Legacy path: a non-upstash provider keeps the single GET probe byte-identically.
    const legacyApp = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1', role: 'master_admin' }, tenant: 'tenant-a' }),
        sessionSecret: 'cache-probe-secret',
        now: () => new Date(0).toISOString(),
        externalFetch: async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response('denied', { status: 401 });
        },
    });
    calls.length = 0;
    const legacy = await (await legacyApp.fetch(new Request('http://t.local/api/edge-caches/test-connection', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'probe-cache', provider: 'redis', cache_url: 'https://probe.example/cache', cache_token: 'tok_c' }),
    }))).json();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(legacy.message, 'cache returned 401');
});

test('cache test-connection: unhealthy upstash reports the adapter failure', async () => {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1', role: 'master_admin' }, tenant: 'tenant-a' }),
        sessionSecret: 'cache-probe-secret',
        now: () => new Date(0).toISOString(),
        externalFetch: async () => new Response('{"error":"unauthorized"}', { status: 401 }),
    });
    const body = await (await app.fetch(new Request('http://t.local/api/edge-caches/test-connection', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'probe-cache', provider: 'upstash', cache_url: 'https://probe.example/cache', cache_token: 'tok_c' }),
    }))).json();
    assert.equal(body.success, false);
    assert.equal(body.message, 'cache connection test failed: upstash_http_401');
});

test('queue test-connection: qstash probes GET /v2/topics with the Bearer token', async () => {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const calls = [];
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1', role: 'master_admin' }, tenant: 'tenant-a' }),
        sessionSecret: 'queue-probe-secret',
        now: () => new Date(0).toISOString(),
        externalFetch: async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response('[]', { status: 200 });
        },
    });
    const post = (bodyJson, a = app) => a.fetch(new Request('http://t.local/api/edge-queues/test-connection', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyJson),
    }));
    const ok = await (await post({ provider: 'qstash', queue_url: 'https://qstash.example', queue_token: 'tok_q' })).json();
    assert.equal(ok.success, true);
    assert.equal(ok.message, 'queue connection test successful');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://qstash.example/v2/topics');
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok_q');

    // Non-ok answers keep the legacy message shape.
    const badApp = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1', role: 'master_admin' }, tenant: 'tenant-a' }),
        sessionSecret: 'queue-probe-secret',
        now: () => new Date(0).toISOString(),
        externalFetch: async () => new Response('denied', { status: 403 }),
    });
    const bad = await (await post({ provider: 'qstash', queue_url: 'https://qstash.example', queue_token: 'tok_q' }, badApp)).json();
    assert.equal(bad.success, false);
    assert.equal(bad.message, 'queue returned 403');
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
console.log(failures === 0 ? '\nsystem-services: PASS ✅' : `\nsystem-services: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
