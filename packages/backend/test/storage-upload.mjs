/**
 * F4b gate (Phase 3 follow-ups / P1). Proves the two new upload capabilities:
 * (a) presigned-upload URL returned; (b) multipart/form-data stores real bytes +
 * a metadata row. The base64 path stays covered by storage.mjs.
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
    storageProvider: storage,
});
const req = (m, p, init) => app.fetch(new Request('http://x' + p, init ? { method: m, ...init } : { method: m }));
const jreq = (m, p, b) => app.fetch(new Request('http://x' + p, {
    method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b),
}));

await req('PUT', '/storage/buckets/b1', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'B1' }) });

// ---- 1. Presigned upload URL ----
const urlRes = await jreq('POST', '/storage/buckets/b1/upload-url', { path: 'direct/u.txt', contentType: 'text/plain' });
const urlBody = await urlRes.json();
check('upload-url → 200', urlRes.status === 200);
check('presigned url is a non-empty string', typeof urlBody.url === 'string' && urlBody.url.length > 0);
check('method = PUT', urlBody.method === 'PUT');

// ---- 2. Multipart upload stores real bytes + a row ----
const form = new FormData();
form.append('file', new File([new TextEncoder().encode('multipart-bytes')], 'u.txt', { type: 'text/plain' }));
form.append('path', 'uploads/u.txt');
const mpRes = await req('POST', '/storage/buckets/b1/files', { body: form }); // FormData sets its own content-type
const mpBody = await mpRes.json();
check('multipart upload → 200', mpRes.status === 200);
check('multipart reports stored:true', mpBody.stored === true);
check('multipart bytes landed in the provider', storage._store.has('b1/uploads/u.txt'));
check('multipart bytes are correct', new TextDecoder().decode(storage._store.get('b1/uploads/u.txt').bytes) === 'multipart-bytes');

const list = await (await jreq('GET', '/storage/buckets/b1/files')).json();
check('multipart created a metadata row', list.files.length === 1 && list.files[0].name === 'u.txt');

// ---- 3. upload-url without a provider → 501 (proves the guard) ----
const noProvRunner = sqliteRunner(':memory:');
await migrateUp(noProvRunner);
const noProvApp = await createConsole({
    makeRunner: async () => noProvRunner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-B' }),
    sessionSecret: 'frontbase-test-session-secret',
    now: () => '2026-07-13T00:00:00Z',
});
const noProv = await noProvApp.fetch(new Request('http://x/storage/buckets/b1/upload-url', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'x' }),
}));
check('upload-url without provider → 501', noProv.status === 501);

// ---- 4. provider interface: signedUploadUrl exists on the S3-shaped contract ----
check('memory provider signedUploadUrl returns a url', typeof (await storage.signedUploadUrl('b1', 'x')) === 'string');

console.log(failures === 0 ? '\nstorage-upload: PASS ✅' : `\nstorage-upload: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
