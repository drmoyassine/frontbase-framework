// Private in-memory SDK experiment, not an adopted driver or production gate.
// Keeps upstream MIT code in memory; never writes package/runtime/dependency files.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const requireInfra = createRequire(new URL('../../edge-infra/package.json', import.meta.url));
const sourcePath = join(dirname(requireInfra.resolve('@neondatabase/serverless')), 'index.mjs');
const original = await readFile(sourcePath, 'utf8');
const hash = s => createHash('sha256').update(s).digest('hex');
const upstreamHash = '2913bd33766e5e9ca954c86d77c3664fc4169b2188cc8de558a07bb04ca0df27';
assert.equal(hash(original), upstreamHash, 'SDK changed: review the experiment patch first');
const patches = [
  ['function cs(r,{arrayMode:e,fullResults:t,fetchOptions:n,',
   'function cs(r,{fetchImpl:frontbaseFetch,arrayMode:e,fullResults:t,fetchOptions:n,'],
  ['let{fetchEndpoint:Z,fetchFunction:W}=ce,',
   'let{fetchEndpoint:Z}=ce,W=frontbaseFetch??ce.fetchFunction,'],
];
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'patch must match exactly once');
  return source.replace(before, after);
}
const candidate = patches.reduce((s, [a, b]) => replaceOnce(s, a, b), original);
const originalFetch = globalThis.fetch;
let rawAttempts = 0;
globalThis.fetch = async () => { rawAttempts++; throw new Error('OFFLINE_RAW_NEON_DENIED'); };
const sdkFromSource = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const dsn = owner => `postgresql://${owner}:invented@ep-${owner}.us-east-2.aws.neon.tech/${owner}`;
const response = (command = 'SELECT', rowCount = 1, rows = [['42']]) => Response.json({
  command, rowCount, rows, fields: [{ name: 'answer', dataTypeID: 23 }],
});
const groups = [];
try {
  const { guardedExternalFetch } = await import('../dist/compat/external-http.js');
  const sdk = await sdkFromSource(candidate);
  const configBefore = [sdk.neonConfig.fetchFunction, sdk.neonConfig.fetchEndpoint];
  const calls = [];
  function hook(owner, reply = () => response()) {
    return (input, init) => guardedExternalFetch(async request => {
      // Select the Request branch, retaining a joint caller/deadline signal.
      assert.ok(request instanceof Request);
      const body = await request.json();
      assert.equal(request.method, 'POST');
      assert.equal(request.redirect, 'manual');
      assert.equal(request.headers.get('Neon-Connection-String'), dsn(owner));
      assert.deepEqual(body.params, ['42']);
      calls.push({ owner, query: body.query });
      await Promise.resolve(); // make transport lifetimes overlap
      return reply(body);
    }, new Request(input, init));
  }
  async function group(name, action) { await action(); groups.push(name); }
  async function ownerProof(module, reverse = false) {
    const start = calls.length;
    const owners = reverse ? ['b', 'a'] : ['a', 'b'];
    const clients = owners.map(owner => module.neon(dsn(owner), { fetchImpl: hook(owner) }));
    const pending = clients.map(c => c.query('SELECT $1 AS answer', [42]));
    const rows = await Promise.all(pending);
    assert.deepEqual(rows, [[{ answer: 42 }], [{ answer: 42 }]]);
    assert.deepEqual(calls.slice(start).map(c => c.owner), owners);
  }
  await group('forward and reversed lazy owners retain separate guarded transports', async () => {
    await ownerProof(sdk);
    await ownerProof(sdk, true);
    assert.equal(rawAttempts, 0);
  });
  await group('derived private endpoint rejects before injected transport', async () => {
    let sent = 0;
    const client = sdk.neon('postgresql://invented:invented@database.internal/db', {
      fetchImpl: (input, init) => guardedExternalFetch(async () => { sent++; return response(); }, new Request(input, init)),
    });
    await assert.rejects(() => Promise.resolve(client.query('SELECT 42')), /unsafe_provider_url/);
    assert.equal(sent, 0);
    assert.equal(rawAttempts, 0);
  });
  await group('redirect and injected denial do not fall back to raw fetch', async () => {
    const redirect = sdk.neon(dsn('a'), { fetchImpl: hook('a', () => new Response(null, {
      status: 307, headers: { location: 'https://database.internal/sql' },
    })) });
    await assert.rejects(() => Promise.resolve(redirect.query('SELECT $1', [42])), /redirect/);
    const denied = sdk.neon(dsn('b'), { fetchImpl: async () => { throw new Error('CLIENT_DENIED'); } });
    await assert.rejects(() => Promise.resolve(denied.query('SELECT $1', [42])), /CLIENT_DENIED/);
    assert.equal(rawAttempts, 0);
  });
  await group('upstream fullResults preserves empty DML rows and actual count', async () => {
    const client = sdk.neon(dsn('a'), { fetchImpl: hook('a', () => response('UPDATE', 7, [])), fullResults: true });
    const result = await client.query('UPDATE invented SET answer = $1', [42]);
    assert.deepEqual(result.rows, []);
    assert.equal(result.rowCount, 7);
    assert.equal(result.command, 'UPDATE');
  });
  await group('transaction batch retains upstream serialization and parsing', async () => {
    let batches = 0;
    const client = sdk.neon(dsn('a'), { fetchImpl: (input, init) => guardedExternalFetch(async request => {
      const body = await request.json();
      assert.equal(request.headers.get('Neon-Connection-String'), dsn('a'));
      assert.equal(request.redirect, 'manual');
      assert.deepEqual(body, { queries: [
        { query: 'SELECT $1 AS answer', params: ['42'] },
        { query: 'UPDATE invented SET answer = $1', params: ['42'] },
      ] });
      batches++;
      return Response.json({ results: [
        { command: 'SELECT', rowCount: 1, rows: [['42']], fields: [{ name: 'answer', dataTypeID: 23 }] },
        { command: 'UPDATE', rowCount: 7, rows: [], fields: [] },
      ] });
    }, new Request(input, init)), fullResults: true });
    const results = await client.transaction([
      client.query('SELECT $1 AS answer', [42]),
      client.query('UPDATE invented SET answer = $1', [42]),
    ]);
    assert.equal(batches, 1);
    assert.deepEqual(results[0].rows, [{ answer: 42 }]);
    assert.equal(results[1].rowCount, 7);
  });
  await group('already aborted caller refuses before transport', async () => {
    let sent = 0;
    const controller = new AbortController();
    controller.abort(new Error('CALLER_ABORTED'));
    const client = sdk.neon(dsn('a'), { fetchImpl: (input, init) => guardedExternalFetch(async () => {
      sent++; return response();
    }, new Request(input, init)), fetchOptions: { signal: controller.signal } });
    await assert.rejects(() => Promise.resolve(client.query('SELECT 42')), /CALLER_ABORTED/);
    assert.equal(sent, 0);
  });
  await group('missing per-client option retains upstream operator default', async () => {
    const before = rawAttempts;
    await assert.rejects(() => Promise.resolve(sdk.neon(dsn('a')).query('SELECT 42')), /OFFLINE_RAW_NEON_DENIED/);
    assert.equal(rawAttempts, before + 1);
  });
  await group('fault dropping client transport is detected; independent baseline restored', async () => {
    const faulty = replaceOnce(candidate, 'W=frontbaseFetch??ce.fetchFunction,', 'W=ce.fetchFunction,');
    const badSdk = await sdkFromSource(faulty);
    const before = rawAttempts;
    await assert.rejects(() => ownerProof(badSdk), /OFFLINE_RAW_NEON_DENIED/);
    assert.equal(rawAttempts, before + 2);
    await ownerProof(sdk);
  });
  await group('candidate globals and installed upstream bytes remain unchanged', async () => {
    assert.deepEqual([sdk.neonConfig.fetchFunction, sdk.neonConfig.fetchEndpoint], configBefore);
    assert.equal(hash(await readFile(sourcePath, 'utf8')), upstreamHash);
  });
} finally {
  globalThis.fetch = originalFetch;
  assert.equal(globalThis.fetch, originalFetch);
}
console.log(JSON.stringify({ experiment: 'in-memory-neon-client-seam', upstreamHash,
  candidateHash: hash(candidate), exactReplacements: patches, groups,
  observedGroups: groups.length, networkRequestsSent: 0,
  claim: 'Copied-source runtime feasibility only; no driver adoption, declarations or production integration.' }, null, 2));
