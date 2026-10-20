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
 const bad=structuredClone(prepared);bad.manifest.bindings.storage={adapterId:'s3-http',mode:'connect',config:{endpoint:'https://s3.example',bucket:'fixture'},secretRefs:{accessKeyId:'a',secretAccessKey:'b'}};
 const fakeUnused=fixture();await assert.rejects(executeCloudflareFirstInstall(prepared,{...context,accountId:'invalid'},{exampleRoot:root,runWrangler:fakeUnused.run}),/invalid_cloudflare_execution_context/);assert.equal(fakeUnused.calls.length,0);await assert.rejects(executeCloudflareFirstInstall(bad,context,{exampleRoot:root,runWrangler:fakeUnused.run}));assert.equal(fakeUnused.calls.length,0);
 writeFileSync(join(root,'dist/worker.mjs'),'changed');await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:fakeUnused.run}),/artifacts_changed/);assert.equal(fakeUnused.calls.length,0);writeFileSync(join(root,'dist/worker.mjs'),'export default {};');
 const isolated=fixture();await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:isolated.run,onReceipt:receipt,deploy:async(_,opts)=>{await opts.runWrangler(['secret','put','SESSION_SECRET','--name','unrelated-worker'],{cwd:opts.cwd,stdin:'fixture-secret'});return {ok:true};}}));assert.ok(!isolated.calls.some(call=>call.args[0]==='secret'));
 console.log('PASS real compiler/fake Wrangler: isolated config, new-resource guards, fixed target, artifact fence, stdin secrets and no automatic adoption');
} finally {
 for(const stage of stages){assert.equal(dirname(stage),tmpdir());assert.ok(basename(stage).startsWith('frontbase-cf-profile-'));rmSync(stage,{recursive:true,force:true});}
 assert.equal(dirname(root),tmpdir());assert.ok(basename(root).startsWith('frontbase-executor-test-'));rmSync(root,{recursive:true,force:true});
}
