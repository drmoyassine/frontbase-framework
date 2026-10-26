import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
const { executeCloudflareFirstInstall, fingerprintCloudflareArtifacts }=await import(process.env.FRONTBASE_CF_EXECUTOR_TEST_MODULE??new URL('./deployment-setup/cloudflare.mjs',import.meta.url).href);
import { defaultDeploymentManifest } from '../packages/edge-core/dist/deployment.js';
const root=mkdtempSync(join(tmpdir(),'frontbase-executor-test-'));
const stages=[];
for(const directory of ['dist','src','console-dist'])mkdirSync(join(root,directory));
for(const name of ['worker.mjs','pg-worker.mjs'])writeFileSync(join(root,'dist',name),'export default {};');
for(const name of ['worker.ts','sw.ts'])writeFileSync(join(root,'src',name),'// source fixture');
writeFileSync(join(root,'console-dist','index.html'),'fixture');
const context={appName:'profile-fixture',accountId:'a'.repeat(32),environment:'preview',artifactHash:fingerprintCloudflareArtifacts(root)};
const manifest=defaultDeploymentManifest('cloudflare');manifest.bindings.cache.mode='disabled';manifest.bindings['state-db'].config.resourceName='profile-fixture-db';
const prepared={manifest,credentials:{}};
const databaseId='11111111-2222-3333-4444-555555555555';
function fixture({existingWorker=false,existingDb=false,unknown=false,createFailed=false}={}) {
 const calls=[];let createAttempted=false;
 const run=async(args,options)=>{
  calls.push({args,options});
  if(args[0]==='deployments')return existingWorker?{code:0,stdout:'exists',stderr:''}:{code:1,stdout:'',stderr:'Worker does not exist [code: 10007]'};
  if(args[0]==='d1' && args[1]==='info')return existingDb || (createFailed && createAttempted)?{code:0,stdout:JSON.stringify({uuid:databaseId}),stderr:''}:{code:1,stdout:'',stderr:unknown?'network unavailable':"Couldn't find a D1 DB with name profile-fixture-db"};
  if(args[0]==='d1' && args[1]==='create'){createAttempted=true;return createFailed?{code:1,stdout:'',stderr:'already exists'}:{code:0,stdout:`database_id = "${databaseId}"`,stderr:''};}
  if(args[0]==='secret')return {code:0,stdout:'saved',stderr:''};
  if(args[0]==='deploy')return {code:0,stdout:'  https://profile-fixture.test.workers.dev',stderr:''};
  throw new Error('unexpected_fixture_call');
 };
 return {calls,run};
}
const receipt=value=>stages.push(value.directory);
function walk(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(directory,entry.name)):[join(directory,entry.name)]);}
try {
 const fake=fixture();let setup;
 const result=await executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:fake.run,onSetupLink:value=>setup=value,onReceipt:receipt});
 assert.deepEqual(result,{ok:true,url:'https://profile-fixture.test.workers.dev'});
 assert.ok(setup.url.includes('#/setup?claim='));assert.ok(!JSON.stringify(result).includes('claim='));
 const stage=stages.at(-1);const config=readFileSync(join(stage,'wrangler.toml'),'utf8');
 assert.ok(config.includes(context.accountId));assert.ok(config.includes(databaseId));assert.ok(!config.includes('hyperdrive'));assert.ok(!config.includes('9deebce3'));
 assert.equal(readFileSync(join(stage,'deployment-receipt.json'),'utf8').includes('succeeded'),true);
 const secretCalls=fake.calls.filter(call=>call.args[0]==='secret');assert.ok(secretCalls.length>=3);
 for(const call of secretCalls){assert.ok(call.options.stdin);assert.ok(!JSON.stringify(call.args).includes(call.options.stdin));for(const path of walk(stage))assert.ok(!readFileSync(path,'utf8').includes(call.options.stdin),'secret persisted to stage');}
 for(const fault of [{existingWorker:true},{existingDb:true},{unknown:true}]) {
  const fake=fixture(fault);await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:fake.run,onReceipt:receipt}));
  assert.ok(!fake.calls.some(call=>call.args[0]==='secret'||call.args[0]==='deploy'||call.args[1]==='create'),'unsafe preflight mutated host');if(fault.existingWorker)assert.equal(fake.calls.length,1,'existing worker refused before database handling');
 }
 const failed=fixture({createFailed:true});await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:failed.run,onReceipt:receipt}));assert.ok(!failed.calls.some(call=>call.args[0]==='secret'||call.args[0]==='deploy'));

 const withCache=structuredClone(prepared);withCache.manifest.bindings.cache.mode='create';withCache.manifest.bindings.cache.config.resourceName='profile-fixture-cache';
 const kvId='a'.repeat(32);
 for(const fault of ['none','existing','unknown','create-failed','bad-identity']) {
  const base=fixture();const calls=[];const run=async(args,opts)=>{calls.push(args);
   if(args.slice(0,3).join(' ')==='kv namespace list')return fault==='unknown'?{code:1,stdout:'',stderr:'network failure'}:{code:0,stdout:JSON.stringify(fault==='existing'?[{title:'profile-fixture-cache',id:kvId}]:[]),stderr:''};
   if(args.slice(0,3).join(' ')==='kv namespace create')return {code:fault==='create-failed'?1:0,stdout:fault==='bad-identity'?'created without id':`id = "${kvId}"`,stderr:''};
   return base.run(args,opts);};
  const operation=executeCloudflareFirstInstall(withCache,context,{exampleRoot:root,runWrangler:run,onReceipt:receipt});
  if(fault==='none'){await operation;const stage=stages.at(-1);assert.ok(readFileSync(join(stage,'wrangler.toml'),'utf8').includes(kvId));assert.equal(JSON.parse(readFileSync(join(stage,'deployment-receipt.json'),'utf8')).resources.cache.id,kvId);const create=calls.find(args=>args.slice(0,3).join(' ')==='kv namespace create');assert.equal(create[3],'profile-fixture-cache');}
  else {await assert.rejects(operation);assert.ok(!calls.some(args=>args[0]==='secret'||args[0]==='deploy'||args[1]==='create'),'KV refusal must precede D1/Worker mutation');}
 }
 // Existing resources are explicitly selected, rechecked and never recreated.
 for(const fault of ['none','nonempty-db','nonempty-cache','renamed','missing']) {
  const reused=structuredClone(withCache);
  reused.manifest.bindings['state-db']={adapterId:'cloudflare-d1',mode:'reuse',resourceRef:databaseId,config:{resourceName:'existing-state'},secretRefs:{}};
  reused.manifest.bindings.cache={adapterId:'cloudflare-kv',mode:'reuse',resourceRef:kvId,config:{resourceName:'existing-cache'},secretRefs:{}};
  const base=fixture(),calls=[];
  const run=async(args,opts)=>{
   calls.push(args);
   if(args[0]==='d1'&&args[1]==='list')return {code:0,stdout:JSON.stringify(fault==='missing'?[]:[{uuid:databaseId,name:fault==='renamed'?'renamed-state':'existing-state'}]),stderr:''};
   if(args[0]==='d1'&&args[1]==='execute')return {code:0,stdout:JSON.stringify([{success:true,results:fault==='nonempty-db'?[{name:'users'}]:[]}]),stderr:''};
   if(args.slice(0,3).join(' ')==='kv namespace list')return {code:0,stdout:JSON.stringify([{id:kvId,title:'existing-cache'}]),stderr:''};
   if(args.slice(0,3).join(' ')==='kv key list')return {code:0,stdout:JSON.stringify(fault==='nonempty-cache'?[{name:'occupied'}]:[]),stderr:''};
   return base.run(args,opts);
  };
  const operation=executeCloudflareFirstInstall(reused,context,{exampleRoot:root,runWrangler:run,onReceipt:receipt});
  if(fault==='none') {
   await operation;
   const saved=JSON.parse(readFileSync(join(stages.at(-1),'deployment-receipt.json'),'utf8'));
   assert.equal(saved.resources.database.name,'existing-state');assert.equal(saved.resources.database.id,databaseId);
   assert.equal(saved.resources.cache.name,'existing-cache');assert.equal(saved.resources.cache.id,kvId);
   assert.ok(!calls.some(args=>args.includes('create')),'reuse cannot create duplicates');
  } else {
   await assert.rejects(operation);
   assert.ok(!calls.some(args=>args[0]==='secret'||args[0]==='deploy'||args.includes('create')),'invalid/occupied selection must refuse before writes');
  }
 }
 // HTTP adapters reuse the existing environment lowering; no unused D1 is provisioned.
 const external=structuredClone(prepared);
 external.manifest.bindings['state-db']={adapterId:'libsql-http',mode:'connect',config:{url:'https://fixture.turso.io'},secretRefs:{token:'state/token'}};
 external.manifest.bindings.vector={adapterId:'cloudflare-vectorize-http',mode:'connect',config:{accountId:context.accountId,indexName:'fixture-vector'},secretRefs:{token:'vector/token'}};
 external.credentials={'state/token':'fixture-state-secret','vector/token':'fixture-vector-secret'};
 const externalFake=fixture();let probed=0;
 await executeCloudflareFirstInstall(external,context,{exampleRoot:root,runWrangler:externalFake.run,onReceipt:receipt,checkExternalState:async value=>{assert.deepEqual(value,external);probed++;}});
 assert.equal(probed,1);
 assert.ok(!externalFake.calls.some(c=>c.args[0]==='d1'||c.args.includes('create')));
 for(const secret of Object.values(external.credentials)) {
  assert.ok(externalFake.calls.some(c=>c.options.stdin?.includes(secret)));
  assert.ok(!externalFake.calls.some(c=>JSON.stringify(c.args).includes(secret)));
  for(const path of walk(stages.at(-1)))assert.ok(!readFileSync(path,'utf8').includes(secret));
 }
 const failedProbe=fixture();await assert.rejects(executeCloudflareFirstInstall(external,context,{exampleRoot:root,runWrangler:failedProbe.run,onReceipt:receipt,checkExternalState:async()=>{throw Error('not empty');}}));
 assert.ok(!failedProbe.calls.some(c=>c.args[0]==='secret'||c.args[0]==='deploy'||c.args.includes('create')));
 const wrongName=structuredClone(withCache);wrongName.manifest.bindings.cache.config.resourceName='other-cache';const unused=fixture();await assert.rejects(executeCloudflareFirstInstall(wrongName,context,{exampleRoot:root,runWrangler:unused.run}));assert.equal(unused.calls.length,0);

 const withStorage=structuredClone(withCache);withStorage.manifest.bindings.storage.mode='create';withStorage.manifest.bindings.storage.config.resourceName='profile-fixture-storage';
 for(const fault of ['none','existing','unknown','create-failed']) {
  const base=fixture(),calls=[];const run=async(args,opts)=>{calls.push(args);
   if(args.slice(0,3).join(' ')==='kv namespace list')return {code:0,stdout:'[]',stderr:''};
   if(args.slice(0,3).join(' ')==='kv namespace create')return {code:0,stdout:`id = "${kvId}"`,stderr:''};
   if(args.slice(0,3).join(' ')==='r2 bucket info')return fault==='existing'?{code:0,stdout:'{}',stderr:''}:{code:1,stdout:'',stderr:fault==='unknown'?'permission denied':'The specified bucket does not exist. [code: 10006]'};
   if(args.slice(0,3).join(' ')==='r2 bucket create')return {code:fault==='create-failed'?1:0,stdout:'created',stderr:''};
   return base.run(args,opts);};
  const operation=executeCloudflareFirstInstall(withStorage,context,{exampleRoot:root,runWrangler:run,onReceipt:receipt});
  if(fault==='none'){await operation;const stage=stages.at(-1),config=readFileSync(join(stage,'wrangler.toml'),'utf8');assert.ok(config.includes('FRONTBASE_R2'));assert.ok(config.includes('profile-fixture-storage'));assert.equal(JSON.parse(readFileSync(join(stage,'deployment-receipt.json'),'utf8')).resources.storage.name,'profile-fixture-storage');}
  else {await assert.rejects(operation);assert.ok(!calls.some(args=>args[0]==='deploy'||args[0]==='secret'||args[0]==='d1'&&args[1]==='create'||args[0]==='kv'&&args[2]==='create'),'R2 refusal must precede other resource mutations');}
 }
 const wrongStorage=structuredClone(withStorage);wrongStorage.manifest.bindings.storage.config.resourceName='unrelated-storage';const unusedStorage=fixture();await assert.rejects(executeCloudflareFirstInstall(wrongStorage,context,{exampleRoot:root,runWrangler:unusedStorage.run}));assert.equal(unusedStorage.calls.length,0);
 const bad=structuredClone(prepared);bad.manifest.bindings.storage={adapterId:'s3-http',mode:'connect',config:{endpoint:'https://s3.example',bucket:'fixture'},secretRefs:{accessKeyId:'a',secretAccessKey:'b'}};
 const fakeUnused=fixture();await assert.rejects(executeCloudflareFirstInstall(prepared,{...context,accountId:'invalid'},{exampleRoot:root,runWrangler:fakeUnused.run}),/invalid_cloudflare_execution_context/);assert.equal(fakeUnused.calls.length,0);await assert.rejects(executeCloudflareFirstInstall(bad,context,{exampleRoot:root,runWrangler:fakeUnused.run}));assert.equal(fakeUnused.calls.length,0);
 writeFileSync(join(root,'dist/worker.mjs'),'changed');await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:fakeUnused.run}),/artifacts_changed/);assert.equal(fakeUnused.calls.length,0);writeFileSync(join(root,'dist/worker.mjs'),'export default {};');
 const isolated=fixture();await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:isolated.run,onReceipt:receipt,deploy:async(_,opts)=>{await opts.runWrangler(['secret','put','SESSION_SECRET','--name','unrelated-worker'],{cwd:opts.cwd,stdin:'fixture-secret'});return {ok:true};}}));assert.ok(!isolated.calls.some(call=>call.args[0]==='secret'));
 console.log('PASS real compiler/fake Wrangler: isolated config, new-resource guards, fixed target, artifact fence, stdin secrets and no automatic adoption');
} finally {
 for(const stage of stages){assert.equal(dirname(stage),tmpdir());assert.ok(basename(stage).startsWith('frontbase-cf-profile-'));rmSync(stage,{recursive:true,force:true});}
 assert.equal(dirname(root),tmpdir());assert.ok(basename(root).startsWith('frontbase-executor-test-'));rmSync(root,{recursive:true,force:true});
}
