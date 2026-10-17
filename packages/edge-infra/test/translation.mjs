import assert from 'node:assert/strict';
import { translationPersistenceFromSupabase, translationAccountingFromSupabase } from '../dist/translation.js';
const calls = [];
const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ protocol: 'frontbase-translation-postgrest', version: 1 }), { headers: { 'content-type': 'application/json' } });
};
await translationPersistenceFromSupabase({ url: 'https://test.invalid', serviceKey: 'sb_secret_fixture', fetchImpl }).initialize();
await translationPersistenceFromSupabase({ url: 'https://native.invalid', restUrl: 'https://native.invalid', serviceKey: 'synthetic-jwt', fetchImpl }).initialize();
assert.equal(calls[0].url, 'https://test.invalid/rest/v1/rpc/translation_request');
assert.equal(calls[1].url, 'https://native.invalid/rpc/translation_request');
for (const { options } of calls) {
    const headers = new Headers(options.headers), body = JSON.parse(options.body);
    assert.equal(options.method, 'POST'); assert.equal(headers.get('content-profile'), 'translations');
    assert.equal(body.p_operation, 'capabilities'); assert.deepEqual(body.p_input, {});
    assert.equal(body.p_scope.projectId, '__setup__'); assert.ok(!options.body.includes('SELECT'));
}
assert.equal(new Headers(calls[0].options.headers).get('authorization'), null);
assert.equal(new Headers(calls[1].options.headers).get('authorization'), 'Bearer synthetic-jwt');
assert.throws(() => translationPersistenceFromSupabase({ url: 'http://test.invalid', serviceKey: 'fixture' }), /https_required/);
assert.throws(() => translationPersistenceFromSupabase({ url: 'https://user:pass@test.invalid', serviceKey: 'fixture' }), /https_required/);
const failing = translationPersistenceFromSupabase({ url: 'https://test.invalid', serviceKey: 'fixture', fetchImpl: async () => new Response(JSON.stringify({ message: 'private credential details' }), { status: 500 }) });
await assert.rejects(failing.initialize(), e => e.message === 'translation_rpc_failed');
console.log('edge-infra translation HTTP bridge: PASS (shared client, auth/schema/URL policy, safe errors; no sockets)');

const accountingCalls=[];const accounting=translationAccountingFromSupabase({url:'https://native.invalid',restUrl:'https://native.invalid',serviceKey:'synthetic-jwt',fetchImpl:async(url,options)=>{accountingCalls.push({url,options});return Response.json(String(url).endsWith('/translation_request')?{protocol:'frontbase-translation-postgrest',version:1}:{protocol:'frontbase-translation-accounting',version:1,jobProtocolVersion:1});}});await accounting.initialize();assert.deepEqual(accountingCalls.map(c=>c.url),['https://native.invalid/rpc/translation_request','https://native.invalid/rpc/translation_accounting_request']);for(const c of accountingCalls){assert.equal(new Headers(c.options.headers).get('content-profile'),'translations');assert.equal(new Headers(c.options.headers).get('authorization'),'Bearer synthetic-jwt');}console.log('accounting bridge PASS: shared HTTP client, two explicit finite RPCs, no SQL/setup request');
