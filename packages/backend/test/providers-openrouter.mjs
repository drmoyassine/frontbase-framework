import assert from 'node:assert/strict';
import {initStrategies,testProvider,listSupportedProviders} from '../dist/compat/routes/edge-providers/strategies/index.js';

globalThis.fetch=()=>{throw Error('raw_fetch_forbidden')};
let calls=[],status=200;
initStrategies(async(input,init)=>{const request=input instanceof Request?input:new Request(input,init);calls.push(request);return Response.json({data:{label:'PRIVATE_LABEL',usage:42}},{status});});
assert.ok(listSupportedProviders().includes('openrouter'));
assert.equal((await testProvider('openrouter',{})).success,false);assert.equal(calls.length,0);
for(const field of ['api_key','token','apiKey']){
 const result=await testProvider('openrouter',{[field]:'PRIVATE_ROUTER',base_url:'https://127.0.0.1'});
 assert.deepEqual(result,{success:true,detail:'Connection verified'});const request=calls.at(-1);
 assert.equal(request.url,'https://openrouter.ai/api/v1/key');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');
 assert.equal(request.headers.get('authorization'),'Bearer PRIVATE_ROUTER');assert.equal(request.body,null);
}
status=401;const result=await testProvider('openrouter',{api_key:'PRIVATE_ROUTER'});assert.equal(result.success,false);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
console.log('providers-openrouter PASS: registered encrypted-account credential test uses fixed guarded read-only key endpoint, aliases and safe metadata');
