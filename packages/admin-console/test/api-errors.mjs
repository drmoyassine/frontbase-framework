import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/lib/api.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs'});
const module={exports:{}};new Function('module','exports',outputFiles[0].text)(module,module.exports);
const {getSetupStatus,postSetupClaim,ApiError}=module.exports;
for(const envelope of ['error','detail']) {
 globalThis.fetch=async()=>Response.json({[envelope]:'setup_link_expired'},{status:403});
 await assert.rejects(()=>postSetupClaim('synthetic'),e=>e instanceof ApiError && /link has expired/.test(e.message) && !/http_403/.test(e.message));
}
for(const status of [400,401,403,404,409,410,429,500,502,503]){
 globalThis.fetch=async()=>Response.json({detail:'secret-provider-stack-SENTINEL'},{status});
 await assert.rejects(getSetupStatus,e=>e.message.length>40&&!/SENTINEL|http_/.test(e.message));
}
globalThis.fetch=async()=>new Response('proxy secret-SENTINEL',{status:502});await assert.rejects(getSetupStatus,e=>/server could not/.test(e.message)&&!e.message.includes('SENTINEL'));
globalThis.fetch=async()=>{throw Error('secret-SENTINEL')};await assert.rejects(getSetupStatus,/could not be reached/);
globalThis.fetch=async()=>new Response('bad json secret-SENTINEL');await assert.rejects(getSetupStatus,/unexpected response/);
globalThis.fetch=async()=>Response.json({detail:[{msg:'secret-SENTINEL'}]},{status:422});await assert.rejects(getSetupStatus,/details were not accepted/);
console.log('PASS setup errors: normalized envelopes, HTTP failures, network, malformed response and no raw details');

const timeout=globalThis.setTimeout;let waits=0,calls=0;
globalThis.setTimeout=fn=>{waits++;fn();return 0;};
try{
 globalThis.fetch=async(url,init)=>{assert.equal(url,'/api/console/setup/claim');assert.equal(init.redirect,'error');assert.deepEqual(JSON.parse(init.body),{setupToken:'synthetic'});calls++;return calls===1?Response.json({error:'activation_in_progress'},{status:503}):Response.json({ok:true});};
 assert.deepEqual(await postSetupClaim('synthetic'),{ok:true});assert.equal(calls,2);assert.equal(waits,1);
 calls=0;globalThis.fetch=async()=>{calls++;throw Error('redirect/temporary transport');};
 await assert.rejects(()=>postSetupClaim('synthetic'),e=>e.code==='network_error');assert.equal(calls,15,'claim retry is bounded');
 calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'invalid_setup_token'},{status:403});};
 await assert.rejects(()=>postSetupClaim('synthetic'),e=>e.code==='invalid_setup_token');assert.equal(calls,1,'authorization refusal is never retried');
}finally{globalThis.setTimeout=timeout;}
console.log('PASS setup rollout: idempotent capability exchange only; bounded readiness/transport retry; no retry of authorization refusal');
