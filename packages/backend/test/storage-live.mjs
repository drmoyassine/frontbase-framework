/**
 * F4c live gate (Phase 3 follow-ups / P3-b). Exercises the REAL s3StorageProvider
 * (not the memory stub) against a live R2/S3 endpoint. Credential-gated: self-skips
 * without STORAGE_ACCESS_KEY + STORAGE_SECRET_KEY + STORAGE_ENDPOINT + STORAGE_BUCKET.
 *
 * Proves: put → get round-trips bytes; signedUrl is non-empty; delete removes the
 * object (get-after-delete throws).
 */
import { s3StorageProvider } from '@frontbase/edge-infra';

const { STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_REGION } = process.env;
if (!STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY || !STORAGE_ENDPOINT || !STORAGE_BUCKET) {
    console.log('  (storage-live: credential-gated — set STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY/STORAGE_ENDPOINT/STORAGE_BUCKET to run)');
    console.log('\nstorage-live: SKIP (no creds) ⏭️');
    process.exit(0);
}

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const provider = s3StorageProvider({
    accessKeyId: STORAGE_ACCESS_KEY,
    secretAccessKey: STORAGE_SECRET_KEY,
    endpoint: STORAGE_ENDPOINT,
    region: STORAGE_REGION ?? 'auto',
});

const key = `fb-live-probe/${Date.now().toString(36)}.txt`;
const payload = new TextEncoder().encode('live-storage-probe-' + key);

// put → get round-trip
await provider.put({ bucket: STORAGE_BUCKET, key, bytes: payload, contentType: 'text/plain' });
const got = await provider.get(STORAGE_BUCKET, key);
check('put → get round-trips bytes', new TextDecoder().decode(got.bytes) === new TextDecoder().decode(payload));
check('get preserves content-type', got.contentType === 'text/plain');

// presigned urls (download + upload) are non-empty
const durl = await provider.signedUrl(STORAGE_BUCKET, key);
const uurl = await provider.signedUploadUrl(STORAGE_BUCKET, key, 'text/plain');
check('signedUrl (download) is a non-empty https URL', typeof durl === 'string' && durl.startsWith('http'));
check('signedUploadUrl is a non-empty https URL', typeof uurl === 'string' && uurl.startsWith('http'));

// delete removes the object — get-after-delete throws
await provider.delete(STORAGE_BUCKET, key);
try { await provider.get(STORAGE_BUCKET, key); check('get after delete throws', false); }
catch { check('get after delete throws (object gone)', true); }

console.log(failures === 0 ? '\nstorage-live: PASS ✅' : `\nstorage-live: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
