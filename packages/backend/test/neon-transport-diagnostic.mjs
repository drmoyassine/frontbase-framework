// Evidence of the installed Neon API/transport boundary, NOT a security gate.
// Run in its own Node process. All fetch implementations below are scripted;
// no socket, real credential, environment connection or live SQL is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const requireInfra = createRequire(new URL('../../edge-infra/package.json', import.meta.url));
const sdkDir = dirname(requireInfra.resolve('@neondatabase/serverless'));
const sdkPath = join(sdkDir, 'index.mjs');
const sdkPackage = JSON.parse(await readFile(join(sdkDir, 'package.json'), 'utf8'));
assert.equal(sdkPackage.version, '1.1.0', 're-review this diagnostic for another SDK version');
const originalFetch = globalThis.fetch;
const attempts = [];
const results = [];
const dsnA = 'postgresql://owner_a:invented-a@ep-a.us-east-2.aws.neon.tech/db_a';
const dsnB = 'postgresql://owner_b:invented-b@ep-b.us-east-2.aws.neon.tech/db_b';
const marker = 'OFFLINE_NEON_DENIAL';
let config;
let originalFunction;
let originalEndpoint;
const reply = (command = 'SELECT', rowCount = 1, rows = [['42']]) => Response.json({
  command, rowCount, rows, fields: [{ name: 'answer', dataTypeID: 23 }],
});
const scripted = (owner) => async (input, init) => {
  const req = new Request(input, init);
  attempts.push({ owner, url: req.url, method: req.method,
    dsn: req.headers.get('Neon-Connection-String'), body: await req.json() });
  return reply();
};
globalThis.fetch = scripted('global');

try {
  const { neon, neonConfig } = await import(pathToFileURL(sdkPath).href);
  config = neonConfig;
  originalFunction = config.fetchFunction;
  originalEndpoint = config.fetchEndpoint;
  // Do not inherit an operator's configured transport in this offline process.
  config.fetchFunction = undefined;
  const { postgresRunner } = await import('../../edge-infra/dist/providers/postgres.js');
  const { checkedExternalUrl } = await import('../dist/compat/external-http.js');
  async function group(name, run) {
    await run();
    results.push(name);
  }

  await group('legacy callable SDK API rejects before transport', async () => {
    const before = attempts.length;
    await assert.rejects(async () => neon(dsnA)('SELECT $1', [42]), /tagged-template/);
    assert.equal(attempts.length, before);
  });
  await group('current production runner shares that API incompatibility', async () => {
    const before = attempts.length;
    const runner = postgresRunner({ connectionString: dsnA });
    await assert.rejects(() => runner.query('SELECT $1', [42]), /tagged-template/);
    await assert.rejects(() => runner.exec('UPDATE invented SET id = $1', [42]), /tagged-template/);
    assert.equal(attempts.length, before);
  });
  await group('per-client fetchOptions cannot select an HTTP function', async () => {
    let injected = 0;
    const client = neon(dsnA, { fetchOptions: { fetchFunction: async () => {
      injected++;
      throw new Error('PER_CLIENT_DENIED');
    } } });
    const rows = await client.query('SELECT $1 AS answer', [42]);
    assert.deepEqual(rows, [{ answer: 42 }]);
    assert.equal(injected, 0);
    const last = attempts.at(-1);
    assert.equal(last.owner, 'global');
    assert.equal(last.method, 'POST');
    assert.equal(last.dsn, dsnA);
    assert.deepEqual(last.body, { query: 'SELECT $1 AS answer', params: ['42'] });
  });
  await group('lazy concurrent owners both select the latest global hook', async () => {
    config.fetchFunction = scripted('owner-a-hook');
    const pendingA = neon(dsnA).query('SELECT 42 AS answer');
    config.fetchFunction = scripted('owner-b-hook');
    const pendingB = neon(dsnB).query('SELECT 42 AS answer');
    const before = attempts.length;
    await Promise.all([pendingA, pendingB]);
    const calls = attempts.slice(before);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(c => c.owner), ['owner-b-hook', 'owner-b-hook']);
    assert.deepEqual(calls.map(c => c.dsn).sort(), [dsnA, dsnB].sort());
  });
  await group('SDK-derived private endpoint is outside the current policy', async () => {
    config.fetchFunction = undefined;
    await neon('postgresql://invented:invented@database.internal/db').query('SELECT 42');
    const last = attempts.at(-1);
    assert.equal(last.url, 'https://api.internal/sql');
    assert.throws(() => checkedExternalUrl(last.url), /unsafe_provider_url/);
  });
  await group('fullResults carries affected rows even when DML returns no rows', async () => {
    config.fetchFunction = async () => reply('UPDATE', 7, []);
    const bare = await neon(dsnA).query('UPDATE invented SET answer = $1', [42]);
    assert.equal(bare.length, 0);
    const full = await neon(dsnA, { fullResults: true }).query('UPDATE invented SET answer = $1', [42]);
    assert.deepEqual(full.rows, []);
    assert.equal(full.rowCount, 7);
    assert.equal(full.command, 'UPDATE');
  });
  await group('SDK transport failure does not use raw fetch after global denial', async () => {
    const before = attempts.length;
    config.fetchFunction = async () => { throw new Error(marker); };
    await assert.rejects(() => Promise.resolve(neon(dsnA).query('SELECT 42')),
      e => e.sourceError?.message === marker);
    assert.equal(attempts.length, before);
  });
} finally {
  if (config) {
    config.fetchFunction = originalFunction;
    config.fetchEndpoint = originalEndpoint;
    assert.equal(config.fetchFunction, originalFunction);
    assert.equal(config.fetchEndpoint, originalEndpoint);
  }
  globalThis.fetch = originalFetch;
  assert.equal(globalThis.fetch, originalFetch);
}
results.push('offline process global configuration restored');
console.log(JSON.stringify({ diagnostic: 'neon-transport-boundary', sdkVersion: sdkPackage.version,
  sdkSha256: createHash('sha256').update(await readFile(sdkPath)).digest('hex'),
  groups: results, observedGroups: results.length, networkRequestsSent: 0,
  claim: 'Counterexamples and API evidence only; production Neon guard remains unresolved.' }, null, 2));
