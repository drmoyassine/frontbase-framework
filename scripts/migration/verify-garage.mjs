/** Bounded live proof. Credentials/report stay in owner-provided files outside Git.
 * Usage: node scripts/migration/verify-garage.mjs KEY_JSON LOGIN_JSON REPORT_JSON [PUBLIC_BASE_URL]
 * Runs against the authenticated local full CMS on 127.0.0.1:4389.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { sigv4StorageProvider } from '../../packages/edge-infra/dist/index.js';
const [keyFile, loginFile, reportFile, publicBase] = process.argv.slice(2);
if (!keyFile || !loginFile || !reportFile) throw new Error('Three file paths are required');
const key = JSON.parse(await readFile(keyFile, 'utf8'));
const login = JSON.parse(await readFile(loginFile, 'utf8'));
const origin = 'http://127.0.0.1:4389';
const report = { endpoint: key.endpoint, bucket: key.bucket, started_at: new Date().toISOString(), checks: {} };
let cookie = '';
async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(origin + path, { method, headers: { 'content-type': 'application/json', cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (path === '/api/auth/login') cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  if (!res.ok) {
    const text = await res.text();
    const code = text.match(/s3_[a-z_]+_failed_[0-9]+|unsafe_provider_url|provider_redirect_rejected/);
    throw new Error(`local_api_${res.status}${code ? ':' + code[0] : ''}`);
  }
  return res.json();
}
const client = sigv4StorageProvider({ endpoint: key.endpoint, region: key.region, accessKeyId: key.access_key_id, secretAccessKey: key.secret_access_key });
const prefix = `_frontbase-verification/${randomUUID()}`;
const source = `${prefix}/probe.txt`, moved = `${prefix}/moved.txt`, browserPut = `${prefix}/signed-put.txt`, imageKey = `${prefix}/public-probe.png`;
const probeKeys = [source, moved, browserPut, imageKey];
const bytes = new TextEncoder().encode('Frontbase Garage compatibility probe. Disposable test data.');
let phase = 'login', uploaded = false;
try {
  await api('/api/auth/login', { email: login.email, password: login.password });
  report.checks.authenticated_local_cms = Boolean(cookie);
  const credentials = { endpoint: key.endpoint, region: key.region, access_key_id: key.access_key_id, secret_access_key: key.secret_access_key, test_bucket: key.bucket, ...(publicBase ? { public_bucket: key.bucket, public_base_url: publicBase } : {}) };
  phase = 'connection_test';
  const probe = await api('/api/edge-providers/test-connection', { provider: 's3', credentials });
  assert.equal(probe.success, true);
  report.checks.guarded_connection_test = true;
  phase = 'encrypted_account';
  let accounts = await api('/api/edge-providers/');
  if (!Array.isArray(accounts)) accounts = accounts.providers ?? accounts.items ?? [];
  let account = accounts.find(a => a.name === 'Garage USA pilot' && a.provider === 's3');
  if (!account) account = await api('/api/edge-providers/', { name: 'Garage USA pilot', provider: 's3', config: credentials });
  assert.ok(account.id);
  if (publicBase) await api(`/api/edge-providers/${account.id}`, { config: credentials }, 'PUT');
  assert.ok(!JSON.stringify(account).includes(key.secret_access_key));
  let providers = await api('/api/storage/providers/');
  let provider = providers.find(p => p.provider_account_id === account.id);
  if (!provider) provider = await api('/api/storage/providers/', { name: 'Garage USA images', provider: 's3', provider_account_id: account.id });
  report.account_id = account.id; report.provider_id = provider.id;
  report.checks.account_api_redacted = true;
  phase = 'compat_upload';
  const form = new FormData();
  form.set('provider_id', provider.id); form.set('bucket', key.bucket); form.set('path', source);
  form.set('file', new File([bytes], 'probe.txt', { type: 'text/plain' }));
  const upload = await fetch(origin + '/api/storage/upload', { method: 'POST', headers: { cookie }, body: form });
  if (!upload.ok) throw new Error(`local_api_${upload.status}`);
  uploaded = true;
  report.checks.compat_route_upload = true;
  phase = 'adapter_get';
  assert.deepEqual((await client.get(key.bucket, source)).bytes, bytes);
  report.checks.actual_adapter_exact_bytes = true;
  phase = 'adapter_move';
  await client.move(key.bucket, source, moved);
  assert.deepEqual((await client.get(key.bucket, moved)).bytes, bytes);
  report.checks.actual_adapter_copy_delete = true;
  phase = 'adapter_listing';
  assert.ok((await client.listFiles(key.bucket, prefix)).some(file => file.name === 'moved.txt'));
  report.checks.actual_adapter_prefix_listing = true;
  phase = 'signed_get';
  const signed = await fetch(await client.signedUrl(key.bucket, moved));
  assert.equal(signed.status, 200); assert.deepEqual(new Uint8Array(await signed.arrayBuffer()), bytes);
  report.checks.plain_fetch_signed_get = true;
  phase = 'signed_put';
  const put = await fetch(await client.signedUploadUrl(key.bucket, browserPut), { method: 'PUT', body: bytes });
  assert.ok(put.ok); assert.deepEqual((await client.get(key.bucket, browserPut)).bytes, bytes);
  report.checks.plain_fetch_signed_put = true;
  phase = 'anonymous';
  const anon = await fetch(client.publicUrl(key.bucket, moved));
  report.anonymous_s3_status = anon.status; assert.equal(anon.status, 403);
  report.checks.anonymous_s3_denied = true;
  if (publicBase) {
    phase = 'public_png';
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const imageForm = new FormData();
    imageForm.set('provider_id', provider.id); imageForm.set('bucket', key.bucket); imageForm.set('path', imageKey);
    imageForm.set('file', new File([png], 'public-probe.png', { type: 'image/png' }));
    const imageUpload = await fetch(origin + '/api/storage/upload', { method: 'POST', headers: { cookie }, body: imageForm });
    report.public_upload_status = imageUpload.status;
    assert.ok(imageUpload.ok);
    phase = 'public_png_mapping';
    const result = await imageUpload.json();
    assert.equal(result.publicUrl, publicBase.replace(/\/+$/, '') + '/' + imageKey);
    phase = 'public_png_get';
    const publicImage = await fetch(result.publicUrl);
    report.public_get_status = publicImage.status;
    assert.equal(publicImage.status, 200);
    assert.equal(publicImage.headers.get('content-type')?.split(';')[0], 'image/png');
    assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()), new Uint8Array(png));
    report.checks.compat_public_png_exact_bytes = true;
    report.public_base_url = publicBase;
  }
  phase = 'cleanup';
  await api('/api/storage/delete', { provider_id: provider.id, bucket: key.bucket, paths: probeKeys }, 'DELETE');
  assert.equal((await client.listFiles(key.bucket, prefix)).length, 0);
  report.checks.probes_deleted = true;
  report.success = true;
} catch (error) {
  report.success = false; report.failed_phase = phase;
  report.failure_code = /^local_api_|^s3_[a-z_]+_failed_[0-9]+$/.test(error.message) ? error.message : error.name;
} finally {
  if (uploaded && !report.checks.probes_deleted) {
    try { await client.deleteFiles(key.bucket, probeKeys); report.checks.cleanup_after_failure = true; } catch { report.checks.cleanup_after_failure = false; }
  }
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
if (!report.success) process.exitCode = 1;
