/**
 * Vector adapters: libsql on a real temp-file database (DDL → upsert →
 * in-process cosine search → metadata filters → delete → ping) and Vectorize
 * against a fetch double (v1 REST paths, Bearer, bodies, result mapping,
 * error surfaces). Table-name interpolation is validated, not trusted.
 */
import { strict as assert } from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { libsqlVectorAdapter, vectorizeAdapter, vectorTableName } from '../dist/index.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const DOCS = [
    { id: 'a', vector: [1, 0], text: 'alpha', metadata: { tenant_id: 'tenant-a' } },
    { id: 'b', vector: [0, 1], text: 'beta', metadata: { tenant_id: 'tenant-a' } },
    { id: 'c', vector: [1, 1], text: 'gamma', metadata: { tenant_id: 'tenant-b' } },
];

async function tempFileAdapter() {
    const dir = mkdtempSync(join(tmpdir(), 'frontbase-vector-'));
    const adapter = libsqlVectorAdapter({ url: `file:${join(dir, 'v.db')}` });
    return {
        adapter,
        // Windows refuses to delete a file libsql still holds — close first,
        // and tolerate a straggler (the OS sweeps its own tmpdir).
        cleanup: async () => {
            try { await adapter.close(); } catch { /* already closed */ }
            try { rmSync(dir, { recursive: true, force: true }); } catch { /* open handle — tmpdir sweep */ }
        },
    };
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---- libsql (local file — in-process cosine path) ----------------------------

test('libsql: ensureTable + upsert + search returns cosine order with scores', async () => {
    const { adapter, cleanup } = await tempFileAdapter();
    try {
        await adapter.ping();
        await adapter.ensureTable('docs');
        await adapter.upsert('docs', DOCS);
        const hits = await adapter.search('docs', [1, 0], 3);
        assert.deepEqual(hits.map((h) => h.id), ['a', 'c', 'b']);
        assert.ok(near(hits[0].score, 1), `alpha similarity ~1, got ${hits[0].score}`);
        assert.ok(near(hits[2].score, 0), `beta similarity ~0, got ${hits[2].score}`);
        assert.equal(hits[0].text, 'alpha');
        assert.deepEqual(hits[0].metadata, { tenant_id: 'tenant-a' });
    } finally { cleanup(); }
});

test('libsql: metadata filters scope the search (the RAG tenant predicate)', async () => {
    const { adapter, cleanup } = await tempFileAdapter();
    try {
        await adapter.ensureTable('docs');
        await adapter.upsert('docs', DOCS);
        const hits = await adapter.search('docs', [1, 1], 3, { tenant_id: 'tenant-a' });
        assert.deepEqual(hits.map((h) => h.id).sort(), ['a', 'b']);
        assert.ok(hits.every((h) => h.metadata.tenant_id === 'tenant-a'));
    } finally { cleanup(); }
});

test('libsql: upsert replaces by id (INSERT OR REPLACE semantics)', async () => {
    const { adapter, cleanup } = await tempFileAdapter();
    try {
        await adapter.ensureTable('docs');
        await adapter.upsert('docs', DOCS);
        await adapter.upsert('docs', [{ id: 'a', vector: [0, 1], text: 'alpha-2', metadata: {} }]);
        const hits = await adapter.search('docs', [1, 0], 3);
        assert.equal(hits[0].id, 'c', 'c ([1,1]) now beats the rotated a');
        const a = hits.find((h) => h.id === 'a');
        assert.equal(a.text, 'alpha-2');
        assert.ok(a.score < 0.01, `a now orthogonal to [1,0], got ${a.score}`);
    } finally { cleanup(); }
});

test('libsql: delete removes exactly the given ids; limit caps results', async () => {
    const { adapter, cleanup } = await tempFileAdapter();
    try {
        await adapter.ensureTable('docs');
        await adapter.upsert('docs', DOCS);
        await adapter.delete('docs', ['a', 'b']);
        const hits = await adapter.search('docs', [1, 1], 10);
        assert.deepEqual(hits.map((h) => h.id), ['c']);
        assert.equal((await adapter.search('docs', [1, 1], 1)).length, 1);
    } finally { cleanup(); }
});

test('vectorTableName rejects injection-shaped identifiers (product diverges)', () => {
    assert.equal(vectorTableName('rag_tenant_a'), '"rag_tenant_a"');
    for (const bad of ['docs; DROP TABLE users', 'has-dash', 'spaced name', '']) {
        assert.throws(() => vectorTableName(bad), /invalid vector table name/);
    }
});

// ---- Vectorize (fetch double) --------------------------------------------------

function double() {
    const calls = [];
    const fetchImpl = async (input, init) => {
        calls.push({ url: String(input), init });
        const body = init?.body ? JSON.parse(init.body) : {};
        if (String(input).endsWith('/upsert')) return new Response('{"result":{}}', { status: 200 });
        if (String(input).endsWith('/query')) {
            return new Response(JSON.stringify({
                result: { matches: [
                    { id: 'doc-1', score: 0.93, metadata: { text: 'hello chunk', tenant_id: 'tenant-a' } },
                    { id: 'doc-2', score: 0.41, metadata: { text: 'other', tenant_id: 'tenant-a' } },
                ] },
            }), { status: 200 });
        }
        if (String(input).endsWith('/delete_by_ids')) return new Response('{"result":{}}', { status: 200 });
        return new Response('{"result":{"dimensions":2}}', { status: 200 }); // GET describe (ping)
    };
    return { calls, fetchImpl };
}

test('vectorize: upsert/query/delete wire shapes + Bearer', async () => {
    const { calls, fetchImpl } = double();
    const adapter = vectorizeAdapter({ accountId: 'acct_1', apiToken: 'cf-tok', indexName: 'rag_documents', fetchImpl });
    const base = 'https://api.cloudflare.com/client/v4/accounts/acct_1/vectorize/indexes/rag_documents';
    await adapter.upsert('ignored-table', [{ id: 'd1', vector: [0.1, 0.2], text: 'hi', metadata: { tenant_id: 't' } }]);
    assert.equal(calls[0].url, `${base}/upsert`);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer cf-tok');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        vectors: [{ id: 'd1', vector: [0.1, 0.2], metadata: { text: 'hi', tenant_id: 't' } }],
    });

    await adapter.search('ignored', [0.1, 0.2], 5, { tenant_id: 't' });
    assert.equal(calls[1].url, `${base}/query`);
    assert.deepEqual(JSON.parse(calls[1].init.body), {
        vector: [0.1, 0.2], topK: 5, filter: { tenant_id: 't' }, returnValues: false, returnMetadata: true,
    });

    await adapter.delete('ignored', ['d1']);
    assert.equal(calls[2].url, `${base}/delete_by_ids`);
    assert.deepEqual(JSON.parse(calls[2].init.body), { ids: ['d1'] });
});

test('vectorize: query maps matches; text moves out of metadata; ping describes', async () => {
    const { calls, fetchImpl } = double();
    const adapter = vectorizeAdapter({ accountId: 'a', apiToken: 't', indexName: 'i', fetchImpl });
    const hits = await adapter.search('ignored', [1, 2], 2);
    assert.deepEqual(hits, [
        { id: 'doc-1', text: 'hello chunk', score: 0.93, metadata: { tenant_id: 'tenant-a' } },
        { id: 'doc-2', text: 'other', score: 0.41, metadata: { tenant_id: 'tenant-a' } },
    ]);
    await adapter.ping();
    assert.equal(calls.at(-1).init.method, 'GET');
});

test('vectorize: non-2xx throws with the operation + status (probe surface)', async () => {
    const fetchImpl = async () => new Response('nope', { status: 403 });
    const adapter = vectorizeAdapter({ accountId: 'a', apiToken: 'bad', indexName: 'i', fetchImpl });
    await assert.rejects(() => adapter.search('ignored', [1], 1), /Vectorize query failed: 403/);
    await assert.rejects(() => adapter.ping(), /Vectorize describe failed: 403/);
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
console.log(failures === 0 ? '\nvector: PASS ✅' : `\nvector: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
