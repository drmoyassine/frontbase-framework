import assert from 'node:assert/strict';
const { startDeploymentSetup }=await import(process.env.FRONTBASE_SETUP_TEST_MODULE??new URL('./deployment-setup/server.mjs',import.meta.url).href);
const secret='private-execution-fixture';
function payload(){return {manifest:{version:1,target:'vercel',environment:'preview',profileVersion:1,bindings:{'state-db':{adapterId:'libsql-http',mode:'connect',config:{url:'https://state.example'},secretRefs:{token:'setup/token'}},...Object.fromEntries(['cache','storage','vector','queue','email-send'].map(role=>[role,{adapterId:'unused',mode:'disabled',config:{},secretRefs:{}}]))}},credentials:{'setup/token':secret}};}
async function access(app){const token=new URLSearchParams(new URL(app.url).hash.slice(1)).get('claim');const response=await fetch(app.origin+'/api/claim',{method:'POST',headers:{origin:app.origin,'content-type':'application/json'},body:JSON.stringify({token})});assert.equal(response.status,200);return {origin:app.origin,cookie:response.headers.get('set-cookie').split(';')[0]};}
async function post(app,path,headers,body){const response=await fetch(app.origin+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body)});const text=await response.text();assert.ok(!text.includes(secret));return {status:response.status,json:JSON.parse(text)};}
let count=0,block=false,release,started;const startedPromise=new Promise(resolve=>started=resolve);
const app=await startDeploymentSetup({target:'vercel',executionInfo:'Fixture only',onDeploy:async prepared=>{count++;assert.equal(prepared.credentials['setup/token'],secret);if(block){started();await new Promise(resolve=>release=resolve);}return {ok:true,url:'https://deployment.example',credentials:secret};}});
try {
 const auth=await access(app);
 assert.equal((await post(app,'/api/deploy',auth,{reviewId:'missing'})).status,409);assert.equal(count,0);
 let ready=await post(app,'/api/prepare',auth,payload());assert.equal(ready.status,200);
 assert.equal((await post(app,'/api/deploy',auth,{reviewId:'wrong'})).status,409);assert.equal(count,0);
 const stale=ready.json.reviewId;
 await post(app,'/api/prepare',auth,{});assert.equal((await post(app,'/api/deploy',auth,{reviewId:stale})).status,409);
 ready=await post(app,'/api/prepare',auth,payload());
 assert.equal((await post(app,'/api/deploy',{...auth,origin:'https://other.example'},{reviewId:ready.json.reviewId})).status,403);assert.equal(count,0);
 block=true;const running=post(app,'/api/deploy',auth,{reviewId:ready.json.reviewId});await startedPromise;
 assert.equal(app.consumePrepared(),undefined,'credentials consumed before callback completes');
 assert.equal((await post(app,'/api/deploy',auth,{reviewId:ready.json.reviewId})).status,409);
 assert.equal((await post(app,'/api/prepare',auth,payload())).status,409);
 release();const result=await running;assert.equal(result.status,200);assert.deepEqual(result.json,{ok:true,url:'https://deployment.example'});assert.equal(count,1);
 const recovered=await (await fetch(app.origin+'/api/bootstrap',{headers:auth})).json();assert.equal(recovered.executionStatus,'succeeded');assert.equal(recovered.executionUrl,'https://deployment.example');assert.equal(recovered.manifest.bindings['state-db'].config.url,'https://state.example');assert.ok(!JSON.stringify(recovered).includes(secret));
 assert.equal((await post(app,'/api/prepare',auth,payload())).status,409);
 console.log('PASS execution handoff: exact review, edit invalidation, origin gate, private credentials, one attempt and no concurrent replay');
} finally {if(release)release();await app.close();}
const failed=await startDeploymentSetup({target:'vercel',onDeploy:async()=>{throw new Error(secret);}});
try {const auth=await access(failed);const ready=await post(failed,'/api/prepare',auth,payload());assert.equal((await post(failed,'/api/deploy',auth,{reviewId:ready.json.reviewId})).status,502);assert.equal((await post(failed,'/api/deploy',auth,{reviewId:ready.json.reviewId})).status,409);console.log('PASS uncertain failure: no secret error echo and no automatic retry');}finally{await failed.close();}
const policy=await startDeploymentSetup({target:'vercel',executionIssues:()=>[{code:'execution_not_supported'}],onDeploy:async()=>{throw new Error('must not run');}});
try {const auth=await access(policy);assert.equal((await post(policy,'/api/prepare',auth,payload())).status,422);}finally{await policy.close();}
let clock=0;let dispatched=false;const expiry=await startDeploymentSetup({target:'vercel',now:()=>clock,ttlMs:10000,onDeploy:async()=>{dispatched=true;return {ok:true,url:'https://deployment.example'};}});
try {const auth=await access(expiry);const ready=await post(expiry,'/api/prepare',auth,payload());clock=10001;assert.equal((await post(expiry,'/api/deploy',auth,{reviewId:ready.json.reviewId})).status,410);assert.equal(dispatched,false);}finally{await expiry.close();}
console.log('PASS execution policy and expired approval refusal');
