import assert from 'node:assert/strict';
import { d1RunnerFromRest } from '../dist/providers/runners.js';
const originalFetch = globalThis.fetch;
let rawCalls = 0;
globalThis.fetch = async () => { rawCalls++; throw new Error('OFFLINE_RAW_DENIED'); };
let passed = 0, failed = 0;
async function test(name, action) {
  try { await action(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.log('FAIL ' + name + ': ' + error.message); }
}
function runner(payload) {
  return d1RunnerFromRest({ accountId: 'invented-account', databaseId: 'invented-db', apiToken: 'invented-token',
    fetchImpl: async (input, init) => {
      const req = new Request(input, init);
      assert.equal(req.url, 'https://api.cloudflare.com/client/v4/accounts/invented-account/d1/database/invented-db/query');
      assert.equal(req.method, 'POST');
      assert.equal(req.headers.get('Authorization'), 'Bearer invented-token');
      assert.deepEqual(await req.json(), { sql: 'UPDATE invented SET id = ?', params: [42] });
      return Response.json(payload);
    },
  });
}
try {
  for (const count of [0, 1, 7]) await test('numeric count ' + count, async () => {
    assert.equal(await runner({ success: true, result: [{ meta: { changes: count } }] }).exec('UPDATE invented SET id = ?', [42]), count);
  });
  for (const count of [0, 7]) await test('legacy object count ' + count, async () => {
    assert.equal(await runner({ success: true, result: [{ meta: { changes: { count } } }] }).exec('UPDATE invented SET id = ?', [42]), count);
  });
  await test('unreported count remains zero without capability inference', async () => {
    assert.equal(await runner({ success: true, result: [{}] }).exec('UPDATE invented SET id = ?', [42]), 0);
  });
  for (const [label, changes] of [['negative', -1], ['fractional', 1.5], ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['string', '7'], ['legacy string', { count: '7' }], ['empty object', {}], ['array', []]]) {
    await test('malformed count ' + label, async () => {
      await assert.rejects(() => runner({ success: true, result: [{ meta: { changes } }] }).exec('UPDATE invented SET id = ?', [42]),
        e => e.message === 'd1_invalid_change_count');
    });
  }
  await test('failed envelope cannot become a successful count', async () => {
    await assert.rejects(() => runner({ success: false, result: [{ meta: { changes: 7 } }] }).exec('UPDATE invented SET id = ?', [42]),
      e => e.message === 'd1_exec_failed');
  });
  await test('reported zero stays distinct from nonzero returned rows', async () => {
    assert.equal(await runner({ success: true, result: [{ meta: { changes: 0 }, results: [{ id: 42 }] }] })
      .exec('UPDATE invented SET id = ?', [42]), 0);
  });
  assert.equal(rawCalls, 0);
} finally { globalThis.fetch = originalFetch; }
console.log(`D1 REST counts: ${passed} passed, ${failed} failed; raw global calls ${rawCalls}`);
process.exitCode = failed ? 1 : 0;
