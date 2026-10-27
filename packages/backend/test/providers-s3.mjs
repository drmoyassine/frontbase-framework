import assert from 'node:assert/strict';
import { S3Strategy } from '../dist/compat/routes/edge-providers/strategies/s3.js';
import { createStorageClientResolver } from '../dist/compat/routes/storage.js';

const credentials = { endpoint: 'https://s3.example.com', region: 'garage', access_key_id: 'test-id', secret_access_key: 'test-secret', test_bucket: 'images' };
let calls = [];
const transport = async (input, init) => {
  calls.push({ url: String(input), init });
  return new Response('', { status: 200 });
};
assert.equal((await new S3Strategy(transport).test(credentials)).success, true);
assert.equal(calls[0].url, 'https://s3.example.com/images');
assert.equal(calls[0].init.method, 'HEAD');
assert.equal(calls[0].init.redirect, 'manual');
for (const endpoint of ['http://s3.example.com', 'https://127.0.0.1', 'https://169.254.169.254', 'https://[::1]', 'https://user:secret@s3.example.com']) {
  calls = [];
  assert.equal((await new S3Strategy(transport).test({ ...credentials, endpoint })).success, false);
  assert.equal(calls.length, 0);
}
const redirect = new S3Strategy(async () => new Response(null, { status: 302, headers: { location: 'https://another.example.com' } }));
assert.equal((await redirect.test(credentials)).success, false);
const leaking = new S3Strategy(async () => { throw new Error('test-secret signed-url'); });
assert.ok(!JSON.stringify(await leaking.test(credentials)).includes('test-secret'));
let config = { ...credentials, public_bucket: 'images', public_base_url: 'https://images.example.com' };
const resolver = createStorageClientResolver({
  phase2For: tenant => ({ getEdgeResourceConfig: async id => { assert.equal(tenant, 'owner'); assert.equal(id, 'account'); return config; } }),
  kvFor: tenant => ({ getJson: async () => tenant === 'owner' ? [{ id: 'storage', provider: 's3', provider_account_id: 'account' }] : [] }),
  externalFetch: transport,
});
assert.equal((await resolver.resolveForOp('other', 'storage')).status, 404);
const resolved = await resolver.resolveForOp('owner', 'storage');
assert.equal(resolved.client.publicUrl('images', 'cover.png'), 'https://images.example.com/cover.png');
assert.equal(resolved.client.publicUrl('private', 'evidence'), 'https://s3.example.com/private/evidence');
await resolved.client.getBucket('images');
assert.equal(calls.at(-1).init.redirect, 'manual');
for (const bad of [{ public_bucket: '' }, { public_base_url: 'https://localhost' }, { public_base_url: 'https://images.example.com?token=secret' }, { endpoint: 'https://10.0.0.1' }]) {
  config = { ...credentials, public_bucket: 'images', public_base_url: 'https://images.example.com', ...bad };
  assert.equal((await resolver.resolveForOp('owner', 'storage')).status, 400);
}
console.log('S3 guarded probes, resolver scope and opaque error checks passed');
