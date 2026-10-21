import assert from 'node:assert/strict';
const {assertVercelOptionalChanges}=await import(process.env.FRONTBASE_BINDING_CHANGE_MODULE??'./deployment-setup/vercel-bindings.mjs');
const {profileEnvironment}=await import(process.env.FRONTBASE_PROFILE_ENV_MODULE??'./deployment-setup/profile-environment.mjs');
const {parseEnvServices,createSystemServiceResolver}=await import(process.env.FRONTBASE_SERVICE_ENV_MODULE??'../packages/backend/dist/compat/system-services.js');
const {defaultDeploymentManifest}=await import('../packages/edge-core/dist/deployment.js');
const manifest=defaultDeploymentManifest('vercel');manifest.bindings['state-db']={adapterId:'turso-marketplace',mode:'reuse',resourceRef:'store_fixture',config:{},secretRefs:{}};
const prepared={manifest,credentials:{}},disabled=profileEnvironment(prepared);
for(const key of ['FRONTBASE_CACHE','FRONTBASE_VECTOR','FRONTBASE_QUEUE']){assert.equal(typeof disabled[key],'string','disabled binding must overwrite the host value');assert.deepEqual(JSON.parse(disabled[key]),{provider:'none'});}
assert.ok(!('SESSION_SECRET' in disabled));assert.ok(!('APP_DB_URL' in disabled));assert.ok(!('PUBLIC_URL' in disabled));
const legacy={FRONTBASE_CACHE_URL:'https://legacy.example',FRONTBASE_CACHE_TOKEN:'synthetic-legacy',QSTASH_TOKEN:'synthetic-qstash',BULLMQ_REDIS_URL:'redis://legacy.example',FRONTBASE_QUEUE_CALLBACK_SECRET:'synthetic-callback',PUBLIC_URL:'https://app.example'};
const active=parseEnvServices(legacy);assert.equal(active.cache.url,legacy.FRONTBASE_CACHE_URL);assert.equal(active.queue.provider,'qstash');
const env=parseEnvServices({...legacy,...disabled});assert.equal(env.cache,undefined);assert.equal(env.queue,undefined);assert.equal(env.vector,undefined);assert.equal(env.queueCallbackSecret,undefined);assert.equal(env.publicUrl,legacy.PUBLIC_URL);
// A removed host binding restores the ordinary memory floor; no old provider is contacted.
let calls=0;const resolver=createSystemServiceResolver({phase2For:()=>{throw Error('no adopted resource');},env,externalFetch:async()=>{calls++;throw Error('unexpected provider call');},log:()=>{}});
const a=await resolver.cacheFor('a'),b=await resolver.cacheFor('b');await a.setex('sentinel',30,'retained');assert.equal(await a.get('sentinel'),'retained');assert.equal(await b.get('sentinel'),null);assert.equal(calls,0);
const cache=structuredClone(manifest);cache.bindings.cache={adapterId:'upstash-http',mode:'connect',config:{url:'https://new.example'},secretRefs:{token:'cache/token'}};
const previous={manifest,phase:'succeeded'};assert.doesNotThrow(()=>assertVercelOptionalChanges(previous,cache));
const replacement=structuredClone(cache);replacement.bindings.cache.config.url='https://replacement.example';assert.doesNotThrow(()=>assertVercelOptionalChanges({manifest:cache,phase:'succeeded'},replacement));
assert.doesNotThrow(()=>assertVercelOptionalChanges({manifest:replacement,phase:'succeeded'},manifest));
for(const phase of ['prepared','failed']) {assert.throws(()=>assertVercelOptionalChanges({manifest:cache,phase},manifest),/vercel_pending_plan_requires_reconciliation/);assert.doesNotThrow(()=>assertVercelOptionalChanges({manifest:cache,phase},structuredClone(cache)));}
const unsupported=structuredClone(manifest);unsupported.bindings['email-send']={adapterId:'unimplemented-email',mode:'connect',config:{},secretRefs:{}};assert.throws(()=>assertVercelOptionalChanges(previous,unsupported),/binding_change_requires_review/);
const live=profileEnvironment({manifest:cache,credentials:{'cache/token':'synthetic-new-secret'}});assert.equal(JSON.parse(live.FRONTBASE_CACHE).url,'https://new.example');assert.equal(JSON.parse(live.FRONTBASE_CACHE).token,'synthetic-new-secret');assert.ok(!live.FRONTBASE_DEPLOYMENT_MANIFEST.includes('synthetic-new-secret'));
const next=parseEnvServices({...legacy,...disabled,...live});assert.equal(next.cache.url,'https://new.example');assert.equal(next.queue,undefined);assert.equal(parseEnvServices({...legacy,...disabled}).cache,undefined);
const vector=structuredClone(manifest);vector.bindings.vector={adapterId:'libsql-vector-http',mode:'connect',config:{url:'https://vector.example'},secretRefs:{token:'vector/token'}};
assert.doesNotThrow(()=>assertVercelOptionalChanges(previous,vector));assert.equal(parseEnvServices(profileEnvironment({manifest:vector,credentials:{'vector/token':'synthetic-vector'}})).vector.provider,'libsql');
const queue=structuredClone(manifest);queue.bindings.queue={adapterId:'qstash-http',mode:'connect',config:{destination:'https://app.example/api/system/queue/receive'},secretRefs:{token:'queue/token',signingKey:'queue/current',nextSigningKey:'queue/next'}};
assert.doesNotThrow(()=>assertVercelOptionalChanges(previous,queue));const qenv=profileEnvironment({manifest:queue,credentials:{'queue/token':'synthetic-publish','queue/current':'synthetic-current','queue/next':'synthetic-next'}});assert.equal(parseEnvServices(qenv).queue.signingKey,'synthetic-current');assert.equal(parseEnvServices({...qenv,...disabled}).queue,undefined);
console.log('PASS binding changes: add/replace/disable, no stale legacy dispatch, tenant memory isolation, retry fence, unsupported-role refusal and private credentials');
