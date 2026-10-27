import assert from 'node:assert/strict';
import { sigv4StorageProvider } from '../dist/index.js';

const calls = [];
const storage = sigv4StorageProvider({
  endpoint: 'https://s3.example.com', region: 'garage',
  accessKeyId: 'test-id', secretAccessKey: 'test-secret',
  publicUrls: { images: 'https://images.example.com/media/' },
  fetch: async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes('list-type=2')) return new Response('<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>probe</Key></Contents></ListBucketResult>');
    return new Response(init.method === 'GET' ? 'probe' : '', { status: 200 });
  },
});
assert.equal(storage.publicUrl('images', 'a b/#cover.png'), 'https://images.example.com/media/a%20b/%23cover.png');
assert.equal(storage.publicUrl('private', 'secret.txt'), 'https://s3.example.com/private/secret.txt');
assert.throws(() => storage.publicUrl('images', '../private'), /invalid_s3_public_key/);
for (const base of ['http://images.example.com', 'https://user:password@images.example.com', 'https://images.example.com/?token=secret', 'https://images.example.com/#fragment']) {
  assert.throws(() => sigv4StorageProvider({ accessKeyId: 'id', secretAccessKey: 'secret', publicUrls: { images: base } }));
}
await storage.put({ bucket: 'images', key: 'probe', bytes: new TextEncoder().encode('probe') });
assert.equal(new TextDecoder().decode((await storage.get('images', 'probe')).bytes), 'probe');
await storage.move('images', 'probe', 'copy');
await storage.getBucket('images');
await storage.listBuckets();
await storage.listFiles('images', '');
await storage.createBucket({ name: 'test' });
await storage.deleteBucket('test');
await storage.emptyBucket('images');
assert.equal(calls.length, 11);
for (const { init } of calls) assert.match(new Headers(init.headers).get('authorization'), /^AWS4-HMAC-SHA256 Credential=test-id\//);
const signed = new URL(await storage.signedUrl('private', 'probe'));
assert.equal(signed.hostname, 's3.example.com');
assert.ok(signed.searchParams.has('X-Amz-Signature'));
console.log('SigV4 transport and bucket-scoped public URL checks passed');
