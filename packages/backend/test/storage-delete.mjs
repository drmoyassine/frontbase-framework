/**
 * BUG-1 gate (Phase 3 follow-ups / P0). Proves DELETE /storage/files/:id removes
 * the REAL provider object (not just the metadata row). Uses the P0-PRE injection
 * seam + memoryStorageProvider, which exposes `_store` for direct inspection.
 *
 * Before the fix, check 3 failed: storage.delete('', fileId) left the object behind.
 */
import { createConsole } from '../dist/index.js';
import { sqliteRunner, memoryStorageProvider } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const storage = memoryStorageProvider();
let clock = 0;
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-A' }),
    sessionSecret: 'frontbase-test-session-secret',
    now: () => `2026-07-13T00:00:${String(clock++).padStart(2, '0')}Z`,
    storageProvider: storage, // P0-PRE injection seam
});
const req = (m, p, b) => app.fetch(new Request('http://x' + p, {
    method: m, headers: { 'content-type': 'application/json' },
    body: b === undefined ? undefined : JSON.stringify(b),
}));

// Bucket + a file WITH real bytes (base64 content path).
await req('PUT', '/storage/buckets/b1', { name: 'B1' });
const content = Buffer.from('hello-world').toString('base64');
const put = await req('POST', '/storage/buckets/b1/files', { path: 'docs/f.txt', name: 'f.txt', content });
const { id } = await put.json();
check('upload stored real bytes in provider', storage._store.has('b1/docs/f.txt'));

// Delete → BOTH the row AND the object must be gone.
await req('DELETE', `/storage/files/${id}`);
const list = await (await req('GET', '/storage/buckets/b1/files')).json();
check('metadata row removed', list.files.length === 0);
check('BUG-1: real object removed from provider (not just the row)', !storage._store.has('b1/docs/f.txt'));

// Deleting a missing file is a clean 200 (idempotent, no throw).
const gone = await req('DELETE', '/storage/files/does-not-exist');
check('delete missing file → 200 (no throw)', gone.status === 200);

console.log(failures === 0 ? '\nstorage-delete: PASS ✅' : `\nstorage-delete: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
