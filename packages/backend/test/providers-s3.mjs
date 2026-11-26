import assert from 'node:assert/strict';
import { S3Strategy } from '../dist/compat/routes/edge-providers/strategies/s3.js';
import { createStorageClientResolver } from '../dist/compat/routes/storage.js';
import { registerEdgeProvidersRoutes } from '../dist/compat/routes/edge-providers.js';
import { Hono } from 'hono';

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
calls = [];
assert.equal((await new S3Strategy(transport).test({ ...credentials, bucket_selection: 'images, assets, images' })).success, true);
assert.deepEqual(calls.map(({ url }) => url), ['https://s3.example.com/images', 'https://s3.example.com/assets']);
calls = [];
assert.equal((await new S3Strategy(transport).test({ ...credentials, bucket_selection: '../wrong' })).success, false);
assert.equal(calls.length, 0);
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
config = { ...credentials, public_bucket: 'images', public_base_url: 'https://images.example.com', bucket_selection: 'images' };
calls = [];
const selected = (await resolver.resolveForOp('owner', 'storage')).client;
assert.deepEqual((await selected.listBuckets()).map(bucket => bucket.name), ['images']);
assert.deepEqual(calls.map(({ url, init }) => [url, init.method]), [['https://s3.example.com/images', 'HEAD']]);
assert.equal(selected.publicUrl('images', 'old.png'), 'https://images.example.com/old.png');
config.bucket_selection = '';
calls = [];
await (await resolver.resolveForOp('owner', 'storage')).client.listBuckets();
assert.deepEqual(calls.map(({ url, init }) => [url, init.method]), [['https://s3.example.com/', 'GET']]);

let account = { id: 'account', kind: 'provider', name: 'Garage', provider: 's3', config: 'encrypted' };
const store = {
  getEdgeResource: async () => account,
  getEdgeResourceConfig: async () => config,
  updateS3Account: async (id, before, after) => {
    assert.equal(id, account.id);
    assert.equal(before.config, account.config);
    account = { ...account, ...after };
    return true;
  },
};
const cipher = { encrypt: async value => { config = JSON.parse(value); return 'encrypted'; }, isEncrypted: value => value === 'encrypted' };
const app = new Hono();
app.use('*', async (c, next) => { c.set('tenant', 'owner'); await next(); });
registerEdgeProvidersRoutes(app, () => store, () => ({}), cipher, transport, () => '2026-11-19');
const scope = value => app.request('/api/edge-providers/account', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ provider_credentials: { bucket_selection: value } }),
});
assert.equal((await scope('../wrong')).status, 400);
const response = await scope('images');
assert.equal(response.status, 200);
const saved = await response.json();
assert.deepEqual(saved.provider_metadata, { s3_buckets: ['images'] });
assert.ok(!JSON.stringify(saved).includes('test-secret'));
assert.equal(config.secret_access_key, credentials.secret_access_key);
assert.equal(config.public_base_url, 'https://images.example.com');
assert.deepEqual((await (await scope('')).json()).provider_metadata, { s3_buckets: [] });
console.log('S3 guarded probes, resolver scope and opaque error checks passed');
