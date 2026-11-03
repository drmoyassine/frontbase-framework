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

const {fixture,scope}=await import('../../translation/test/job-fixtures.mjs');
const f=await fixture();try{
 await f.engine.writeManual(scope,f.revision());const snapshot=await f.store.read(scope,f.source.unitId,'ar'),reads=[];
 const batch=translationPersistenceFromSupabase({url:'https://native.invalid',restUrl:'https://native.invalid',serviceKey:'synthetic-jwt',fetchImpl:async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);reads.push(url);
  assert.equal(req.method,'POST');assert.equal(req.headers.get('content-profile'),'translations');assert.equal(req.headers.get('authorization'),'Bearer synthetic-jwt');
  assert.equal(url.pathname,'/rpc/translation_read_batch');const {p_operation,p_scope,p_input}=await req.json();assert.deepEqual(p_scope,scope);assert.equal(p_input.locale,'ar');
  if(p_operation==='read-many')return Response.json(p_input.unitIds.map(unitId=>({unitId,snapshot:unitId===f.source.unitId?snapshot:{version:0,source:null,head:null}})));
  assert.equal(p_operation,'read-revisions');return Response.json(p_input.keys.map(key=>({...key,revision:snapshot.head})));
 }});
 const ids=[f.source.unitId,...Array.from({length:66},(_,i)=>i.toString(16).padStart(64,'0'))];
 const result=await batch.readMany(scope,ids,'ar');assert.equal(result.length,67);assert.deepEqual(result[0],snapshot);assert.deepEqual(result[66],{version:0,source:null,head:null});
 assert.equal(reads.length,1,'67 fields must issue exactly one HTTP request');
 assert.equal((await batch.readRevisions(scope,[{unitId:f.source.unitId,revisionId:'revision'}],'ar'))[0].revisionId,'revision');assert.equal(reads.length,2);
 console.log('translation batch reads PASS: one scoped HTTP request for 67 fields, isolated revision lookup');
}finally{f.close();}

const accountingCalls=[];const accounting=translationAccountingFromSupabase({url:'https://native.invalid',restUrl:'https://native.invalid',serviceKey:'synthetic-jwt',fetchImpl:async(url,options)=>{accountingCalls.push({url,options});return Response.json(String(url).endsWith('/translation_request')?{protocol:'frontbase-translation-postgrest',version:1}:{protocol:'frontbase-translation-accounting',version:1,jobProtocolVersion:1});}});await accounting.initialize();assert.deepEqual(accountingCalls.map(c=>c.url),['https://native.invalid/rpc/translation_request','https://native.invalid/rpc/translation_accounting_request']);for(const c of accountingCalls){assert.equal(new Headers(c.options.headers).get('content-profile'),'translations');assert.equal(new Headers(c.options.headers).get('authorization'),'Bearer synthetic-jwt');}console.log('accounting bridge PASS: shared HTTP client, two explicit finite RPCs, no SQL/setup request');
