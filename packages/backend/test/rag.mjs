/**
 * RAG pipeline (Phase 5): chunking + text-like gating (product algorithm),
 * embedding config + OpenAI-compatible wire (key never surfaces), and the
 * end-to-end route flow — upload text files → POST /api/rag/index (inline AND
 * queued through the receive endpoint) → POST /api/rag/search. Isolation is
 * asserted, not assumed: tenant-b results never contain tenant-a chunks.
 *
 * All-local: a file: libsql vector store (in-process cosine) and a
 * deterministic embedding double keyed on the words apple/banana/cherry, so
 * similarity ranks the right chunk without any network.
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteRunner, memoryStorageProvider } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { Phase2Store } from '../dist/db/phase2-store.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { createCompatApp } from '../dist/compat/app.js';
import { chunkText, isTextLike, ragTableName } from '../dist/compat/rag/processor.js';
import { parseEmbeddingConfig, openaiEmbedding } from '../dist/compat/rag/embedding.js';
import { parseEnvServices } from '../dist/compat/system-services.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const NOW = () => new Date(0).toISOString();

/** Deterministic word-count embedding — similar texts land close in cosine space. */
const embedText = (text) => {
    const t = String(text).toLowerCase();
    return [
        (t.match(/apple/g) || []).length,
        (t.match(/banana/g) || []).length,
        (t.match(/cherry/g) || []).length,
        1,
    ];
};

async function harness(opts = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'frontbase-rag-'));
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const cipher = await createSecretCipher('rag-test-secret');
    let currentTenant = 'tenant-a';
    const embedCalls = [];
    const httpCalls = [];
    const externalFetch = async (input, init) => {
        const url = String(input);
        httpCalls.push({ url, init });
        if (url.startsWith('https://embed.example/')) {
            const body = JSON.parse(init?.body ?? '{}');
            embedCalls.push(body);
            return new Response(JSON.stringify({ data: [{ embedding: embedText(body.input ?? '') }] }), { status: 200 });
        }
        if (url.includes('qstash.upstash.io')) return new Response('{"messageId":"m1"}', { status: 200 });
        return new Response('{}', { status: 200 });
    };
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1', role: 'member' }, tenant: currentTenant }),
        sessionSecret: 'rag-test-secret',
        now: NOW,
        externalFetch,
        storageProvider: memoryStorageProvider(),
        envServices: {
            vector: { provider: 'libsql', url: `file:${join(dir, 'rag.db')}` },
            ...(opts.noEmbedding ? {} : {
                embedding: { provider: 'openai', apiKey: 'sk-test-embed', model: 'embed-test', baseUrl: 'https://embed.example/v1' },
            }),
            ...(opts.queue ? {
                queue: { provider: 'qstash', token: 'q-tok' },
                publicUrl: 'https://cms.example',
                queueCallbackSecret: 'cb-secret',
            } : {}),
        },
    });
    const req = (method, path, body, headers = {}) => app.fetch(new Request(`http://t.local${path}`, {
        method,
        headers: body instanceof FormData ? headers : { 'content-type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    }));
    const phase2For = (t) => new Phase2Store(runner, t, cipher);
    const seed = async (tenant, bucketId, files) => {
        currentTenant = tenant;
        await phase2For(tenant).upsertBucket({ id: bucketId, name: bucketId }, NOW());
        for (const f of files) {
            // The compat upload surface is multipart (it carries the real MIME
            // type; provider_id '' resolves to the env-wired provider).
            const form = new FormData();
            form.set('bucket', bucketId);
            form.set('provider_id', '');
            form.set('path', f.path);
            form.set('file', new File([f.content], f.name, { type: f.type ?? 'text/plain' }));
            const res = await req('POST', '/api/storage/upload', form);
            assert.equal(res.status, 200, `seed upload ${f.path}`);
        }
    };
    return {
        req, seed, httpCalls, embedCalls, runner, dir,
        setTenant: (t) => { currentTenant = t; },
        cleanup: async () => {
            try { rmSync(dir, { recursive: true, force: true }); } catch { /* open libsql handle — tmpdir sweep */ }
        },
    };
}

// ---- unit: chunking (product algorithm, verbatim semantics) -------------------

test('chunkText: short text is one chunk; sentence boundary and overlap are honored', () => {
    assert.deepEqual(chunkText('short text'), ['short text']);

    // The only sentence break past the midpoint (offset 600 > 500) is the
    // period at 600 → the first chunk ends at 601, the next starts at 401.
    const text = `${'x'.repeat(600)}. ${'y'.repeat(1500)}`;
    const chunks = chunkText(text);
    assert.ok(chunks.length >= 3, `multiple chunks, got ${chunks.length}`);
    assert.equal(chunks[0], `${'x'.repeat(600)}.`);
    assert.ok(chunks[1].startsWith('x'.repeat(199)), 'overlap carries the prior tail back in');
    assert.ok(chunks.every((c) => c.length > 0 && c.length <= 1001), `chunks within [1, chunkSize], got ${chunks.map((c) => c.length)}`);

    // No boundary past the midpoint → hard cut at chunkSize.
    const unbroken = 'z'.repeat(2500);
    const hard = chunkText(unbroken);
    assert.equal(hard[0], 'z'.repeat(1000));
});

test('isTextLike: text MIME yes; image/pdf no; extension fallback; folder markers no', () => {
    assert.equal(isTextLike('text/plain', 'a.txt'), true);
    assert.equal(isTextLike('application/json', 'data.json'), true);
    assert.equal(isTextLike('text/html; charset=utf-8', 'p.html'), true);
    assert.equal(isTextLike('image/png', 'photo.png'), false);
    assert.equal(isTextLike('application/pdf', 'doc.pdf'), false);
    assert.equal(isTextLike(undefined, 'notes.md'), true);
    assert.equal(isTextLike('application/octet-stream', 'dump.bin'), false);
    assert.equal(isTextLike('application/octet-stream', 'dump.json'), true);
    assert.equal(isTextLike('application/x-directory', 'folder'), false);
});

// ---- unit: embedding config + wire (the key never surfaces) -------------------

test('parseEmbeddingConfig: absent/unsupported/keyless-default → null; aliases normalize', () => {
    assert.equal(parseEmbeddingConfig(undefined), null);
    assert.equal(parseEmbeddingConfig({ provider: 'none' }), null);
    assert.equal(parseEmbeddingConfig({ provider: 'ollama' }), null);
    assert.equal(parseEmbeddingConfig({ provider: 'openai' }), null); // keyless default endpoint
    const cfg = parseEmbeddingConfig({ provider: 'openai', apiKey: 'sk-1', model: 'm-1', baseUrl: 'https://e.example/v1/' });
    assert.equal(cfg.baseUrl, 'https://e.example/v1'); // trailing slash stripped
    assert.equal(cfg.apiKey, 'sk-1');
    assert.equal(cfg.model, 'm-1');
    assert.equal(parseEmbeddingConfig({ provider: 'openai', token: 'sk-2' }).apiKey, 'sk-2'); // token alias
    assert.equal(parseEmbeddingConfig({ provider: 'openai', apiKey: 'sk-1' }).model, 'text-embedding-3-small'); // default model
    assert.equal(parseEmbeddingConfig({ provider: 'openai', apiKey: 'sk-1' }).baseUrl, 'https://api.openai.com/v1'); // default base

    // FRONTBASE_EMBEDDING snake_case JSON → ServiceEnvConfig (the wiring seam).
    const envServices = parseEnvServices({
        FRONTBASE_EMBEDDING: '{"provider":"openai","api_key":"k","model":"m","base_url":"https://e.example"}',
    }, () => {});
    assert.equal(envServices.embedding.apiKey, 'k');
    assert.equal(envServices.embedding.model, 'm');
    assert.equal(envServices.embedding.baseUrl, 'https://e.example');
});

test('openaiEmbedding: POST /embeddings wire shape; failures surface status only — never the key', async () => {
    const calls = [];
    const ok = openaiEmbedding({ baseUrl: 'https://e.example/v1', apiKey: 'sk-secret', model: 'm' }, async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response('{"data":[{"embedding":[0.1,0.2]}]}', { status: 200 });
    });
    assert.deepEqual(await ok('hello'), [0.1, 0.2]);
    assert.equal(calls[0].url, 'https://e.example/v1/embeddings');
    assert.equal(calls[0].init.headers.authorization, 'Bearer sk-secret');
    assert.deepEqual(JSON.parse(calls[0].init.body), { model: 'm', input: 'hello' });

    const denied = openaiEmbedding({ baseUrl: 'https://e.example/v1', apiKey: 'sk-secret', model: 'm' }, async () => new Response('bad key sk-secret', { status: 401 }));
    await assert.rejects(() => denied('hello'), (e) => e.message === 'embedding_failed_401');
    const malformed = openaiEmbedding({ baseUrl: 'https://e.example/v1', apiKey: 'sk-secret', model: 'm' }, async () => new Response('{"data":[]}', { status: 200 }));
    await assert.rejects(() => malformed('hello'), /embedding_failed_no_vector/);
});

// ---- end-to-end: index + search through the routes ---------------------------

test('index → search round-trip (inline path): the right chunk ranks first', async () => {
    const h = await harness();
    try {
        await h.seed('tenant-a', 'docs', [
            { name: 'apple.md', path: 'apple.md', content: 'apple apple apple '.repeat(20) },
            { name: 'banana.md', path: 'banana.md', content: 'banana banana banana '.repeat(20) },
            { name: 'photo.png', path: 'photo.png', content: 'binary-ish', type: 'image/png' },
        ]);
        h.setTenant('tenant-a');
        const indexed = await (await h.req('POST', '/api/rag/index', { bucketId: 'docs' })).json();
        assert.equal(indexed.success, true);
        assert.equal(indexed.queued, false);
        assert.equal(indexed.files_seen, 3);
        assert.equal(indexed.files_indexed, 2);
        assert.equal(indexed.files_skipped, 1); // photo.png — no OCR in v1
        assert.equal(indexed.chunks_indexed, 2);

        const search = await (await h.req('POST', '/api/rag/search', { query: 'apple', limit: 5 })).json();
        assert.equal(search.success, true);
        assert.equal(search.results.length, 2);
        assert.equal(search.results[0].source.path, 'apple.md');
        assert.ok(search.results[0].score > search.results.find((r) => r.source.path === 'banana.md').score, 'apple ranks above banana for "apple"');
        assert.equal(search.results[0].metadata.tenant_id, 'tenant-a');
        assert.equal(search.results[0].source.bucket, 'docs');
        assert.equal(search.results[0].chunk_id, 'apple_md_chunk_0');

        // Last-run stamp (the console-facing record of the latest index).
        const stamp = await h.runner.query("SELECT value FROM settings WHERE tenant_slug = 'tenant-a' AND key = 'rag:last-index'", []);
        const parsed = JSON.parse(stamp[0].value);
        assert.equal(parsed.bucket_id, 'docs');
        assert.equal(parsed.files_indexed, 2);
    } finally { await h.cleanup(); }
});

test('tenant isolation: tenant-b search never returns tenant-a chunks', async () => {
    const h = await harness();
    try {
        await h.seed('tenant-a', 'docs-a', [
            { name: 'apple.md', path: 'apple.md', content: 'apple apple apple '.repeat(20) },
        ]);
        await h.seed('tenant-b', 'docs-b', [
            { name: 'cherry.md', path: 'cherry.md', content: 'cherry cherry cherry '.repeat(20) },
        ]);
        h.setTenant('tenant-a');
        const a = await (await h.req('POST', '/api/rag/index', { bucketId: 'docs-a' })).json();
        assert.equal(a.files_indexed, 1);
        h.setTenant('tenant-b');
        const b = await (await h.req('POST', '/api/rag/index', { bucketId: 'docs-b' })).json();
        assert.equal(b.files_indexed, 1);

        // Different tables per tenant (the primary boundary)…
        assert.notEqual(ragTableName('tenant-a'), ragTableName('tenant-b'));
        // …and the mandatory tenant_id filter holds regardless of ranking.
        h.setTenant('tenant-b');
        const bApple = await (await h.req('POST', '/api/rag/search', { query: 'apple', limit: 10 })).json();
        assert.ok(bApple.results.length >= 1);
        assert.ok(bApple.results.every((r) => r.metadata.tenant_id === 'tenant-b'), 'no tenant-a rows leak');
        assert.ok(bApple.results.every((r) => r.source.path !== 'apple.md'));
        h.setTenant('tenant-a');
        const aCherry = await (await h.req('POST', '/api/rag/search', { query: 'cherry', limit: 10 })).json();
        assert.ok(aCherry.results.every((r) => r.metadata.tenant_id === 'tenant-a'));
        assert.ok(aCherry.results.every((r) => r.source.path !== 'cherry.md'));
    } finally { await h.cleanup(); }
});

test('re-index replaces (stable chunk ids) instead of duplicating', async () => {
    const h = await harness();
    try {
        await h.seed('tenant-a', 'docs', [{ name: 'apple.md', path: 'apple.md', content: 'apple '.repeat(30) }]);
        h.setTenant('tenant-a');
        await h.req('POST', '/api/rag/index', { bucketId: 'docs' });
        const second = await (await h.req('POST', '/api/rag/index', { bucketId: 'docs' })).json();
        assert.equal(second.chunks_indexed, 1, 'still one chunk');
        const search = await (await h.req('POST', '/api/rag/search', { query: 'apple', limit: 10 })).json();
        assert.equal(search.results.filter((r) => r.source.path === 'apple.md').length, 1, 'INSERT OR REPLACE, not INSERT');
    } finally { await h.cleanup(); }
});

test('not configured: no embedding → 503; unknown bucket → 503; bad table name → 400', async () => {
    const h = await harness({ noEmbedding: true });
    try {
        await h.seed('tenant-a', 'docs', [{ name: 'a.md', path: 'a.md', content: 'apple' }]);
        h.setTenant('tenant-a');
        const noEmbed = await (await h.req('POST', '/api/rag/search', { query: 'apple' })).json();
        assert.equal(noEmbed.detail, 'RAG is not configured (FRONTBASE_EMBEDDING absent)');
        const noEmbedIndex = await h.req('POST', '/api/rag/index', { bucketId: 'docs' });
        assert.equal(noEmbedIndex.status, 503);
        assert.match((await noEmbedIndex.json()).detail, /rag_embedding_not_configured/);
    } finally { await h.cleanup(); }
    const h2 = await harness();
    try {
        await h2.seed('tenant-a', 'docs', [{ name: 'a.md', path: 'a.md', content: 'apple' }]);
        h2.setTenant('tenant-a');
        const unknownBucket = await h2.req('POST', '/api/rag/index', { bucketId: 'nope' });
        assert.equal(unknownBucket.status, 503);
        assert.match((await unknownBucket.json()).detail, /rag_bucket_not_found/);
        await h2.req('POST', '/api/rag/index', { bucketId: 'docs' });
        const injected = await h2.req('POST', '/api/rag/search', { query: 'apple', table: 'docs; DROP TABLE x' });
        assert.equal(injected.status, 400);
        assert.equal((await injected.json()).detail, 'invalid table name');
    } finally { await h2.cleanup(); }
});

test('queue path: publish wire shape, then the receive endpoint runs the index', async () => {
    const h = await harness({ queue: true });
    try {
        await h.seed('tenant-a', 'docs', [{ name: 'apple.md', path: 'apple.md', content: 'apple '.repeat(30) }]);
        h.setTenant('tenant-a');
        const res = await h.req('POST', '/api/rag/index', { bucketId: 'docs' });
        assert.equal(res.status, 202);
        assert.deepEqual(await res.json(), { success: true, queued: true });

        // The QStash publish hand-roll: encoded destination, Bearer, typed body.
        const publish = h.httpCalls.filter((c) => c.url.includes('qstash.upstash.io')).at(-1);
        assert.equal(publish.url, `https://qstash.upstash.io/v2/publish/${encodeURIComponent('https://cms.example/api/system/queue/receive')}`);
        assert.equal(publish.init.headers.Authorization, 'Bearer q-tok');
        assert.deepEqual(JSON.parse(publish.init.body), { type: 'rag-index', tenant: 'tenant-a', bucketId: 'docs' });

        // Unsigned receive → 401; callback-secret receive runs the index.
        const unsigned = await h.req('POST', '/api/system/queue/receive', { type: 'rag-index', tenant: 'tenant-a', bucketId: 'docs' });
        assert.equal(unsigned.status, 401);
        const received = await (await h.req('POST', '/api/system/queue/receive',
            { type: 'rag-index', tenant: 'tenant-a', bucketId: 'docs' },
            { 'x-frontbase-callback-secret': 'cb-secret' })).json();
        assert.equal(received.ok, true);
        assert.equal(received.result.files_indexed, 1);

        const search = await (await h.req('POST', '/api/rag/search', { query: 'apple' })).json();
        assert.equal(search.results[0].source.path, 'apple.md');
    } finally { await h.cleanup(); }
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
console.log(failures === 0 ? '\nrag: PASS ✅' : `\nrag: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
