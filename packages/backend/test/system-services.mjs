/**
 * System-service resolver (dual wiring): adopted is_default registry row >
 * FRONTBASE_* env > memory — per tenant. Store-level adoption mutations pair
 * with resolver.invalidate(), exactly the composition app.ts performs via the
 * edge-resource mutation hooks. Also covers parseEnvServices (JSON + legacy
 * vars + malformed input) and env-derived system cards.
 */
import { strict as assert } from 'node:assert';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { Phase2Store } from '../dist/db/phase2-store.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
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
