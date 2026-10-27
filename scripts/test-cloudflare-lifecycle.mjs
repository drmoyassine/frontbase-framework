import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { defaultDeploymentManifest } from '../packages/edge-core/dist/deployment.js';
import { fingerprintCloudflareArtifacts } from './deployment-setup/cloudflare.mjs';
const lifecycle=await import(process.env.FRONTBASE_LIFECYCLE_TEST_MODULE??'./deployment-setup/cloudflare-lifecycle.mjs');
const receipts=await import(process.env.FRONTBASE_RECEIPT_TEST_MODULE??'./deployment-setup/receipt.mjs');
const metadata=await import(process.env.FRONTBASE_IDENTITY_TEST_MODULE??'./deployment-setup/cloudflare-identity.mjs');
const {executeManagedCloudflare,reuseManifest}=lifecycle;
const {receiptPath,readReceipt,writeReceipt,acquireDeploymentLock}=receipts;
const root=mkdtempSync(join(tmpdir(),'frontbase-managed-test-')),exampleRoot=join(root,'example'),lockRoot=join(root,'locks');
for(const name of ['dist','src','console-dist'])mkdirSync(join(exampleRoot,name),{recursive:true});
for(const name of ['worker.mjs','pg-worker.mjs'])writeFileSync(join(exampleRoot,'dist',name),'export default {};');
for(const name of ['worker.ts','sw.ts'])writeFileSync(join(exampleRoot,'src',name),'// fixture');
writeFileSync(join(exampleRoot,'console-dist','index.html'),'fixture');
const context={accountId:'a'.repeat(32),appName:'managed-fixture',environment:'preview',artifactHash:fingerprintCloudflareArtifacts(exampleRoot)};
const manifest=defaultDeploymentManifest('cloudflare');
for(const [role,suffix] of [['state-db','db'],['cache','cache'],['storage','storage']]){manifest.bindings[role].config.resourceName=context.appName+'-'+suffix;manifest.bindings[role].mode='create';}
const prepared={manifest,credentials:{}};
const db='11111111-2222-3333-4444-555555555555',kv='b'.repeat(32);
const version=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const stages=[],calls=[];let remote=null,exists=false,storageCreated=false,badStorageIdentity=false,failIdentity=false,failCreate=false,unknownExtra=false,driftOnSecond=false,identityReads=0;
const path=receiptPath(root,context);
const runWrangler=async(args,options)=>{
 calls.push(args);
 if(args[0]==='deployments')return exists?{code:0,stdout:'[]',stderr:''}:{code:1,stdout:'',stderr:'Worker does not exist [code: 10007]'};
 if(args[0]==='d1'&&args[1]==='info')return {code:1,stdout:'',stderr:"Couldn't find a D1 DB with name managed-fixture-db"};
 if(args[0]==='d1'&&args[1]==='create')return {code:0,stdout:'database_id = "'+db+'"',stderr:''};
 if(args.slice(0,3).join(' ')==='kv namespace list')return {code:0,stdout:'[]',stderr:''};
 if(args.slice(0,3).join(' ')==='kv namespace create')return {code:0,stdout:'id = "'+kv+'"',stderr:''};
 if(args.slice(0,3).join(' ')==='r2 bucket info')return storageCreated?{code:0,stdout:JSON.stringify({name:'managed-fixture-storage',created:badStorageIdentity?undefined:'2026-10-20T08:01:40.817Z'}),stderr:''}:{code:1,stdout:'',stderr:'The specified bucket does not exist. [code: 10006]'};
 if(args.slice(0,3).join(' ')==='r2 bucket create'){storageCreated=!failCreate;return {code:failCreate?1:0,stdout:'created',stderr:''};}
 if(args[0]==='secret')return {code:0,stdout:'saved',stderr:''};
 if(args[0]==='deploy'){
  stages.push(options.cwd);exists=true;
  const installationId=args[args.indexOf('--var')+1].split(':')[1],operationId=args[args.indexOf('--tag')+1];
  remote={installationId,operationId,versionId:version(remote?2:1),deploymentId:version(remote?12:11),resources:{storage:{name:'managed-fixture-storage',binding:'FRONTBASE_R2',created:'2026-10-20T08:01:40.817Z'},cache:{name:'managed-fixture-cache',id:kv,binding:'FRONTBASE_KV'},database:{name:'managed-fixture-db',id:db,binding:'DB'}},secrets:['SESSION_SECRET','SETUP_EXPIRES_AT','SETUP_TOKEN']};
  return {code:0,stdout:' https://managed-fixture.test.workers.dev',stderr:''};
 }
 throw Error('unexpected fixture command');
};
const readIdentity=async()=>{
 identityReads++;if(failIdentity)throw Error('network failure');
 const value=structuredClone(remote);
 if(unknownExtra)value.secrets.push('UNEXPECTED_SECRET');
 if(driftOnSecond&&identityReads===2)value.versionId=version(9);
 return value;
};
const options={root,exampleRoot,lockRoot,runWrangler,readIdentity};
try {
 // Same account/name serializes across worktrees AND preview/production labels.
 const unlock=acquireDeploymentLock(context,{lockRoot});
 assert.throws(()=>acquireDeploymentLock({...context,environment:'production'},{lockRoot}),/locked/);
 assert.throws(()=>acquireDeploymentLock(context,{lockRoot}),/locked/);unlock();unlock();
 const result=await executeManagedCloudflare(prepared,context,options);
 assert.equal(result.ok,true);let receipt=readReceipt(path,context);
 assert.equal(receipt.phase,'succeeded');assert.deepEqual(receipt.resources,remote.resources);
 assert.ok(receipt.resources.storage.created);
 assert.equal(receipt.identity.installationId,receipt.installationId);
 const bytes=readFileSync(path,'utf8');
 assert.ok(!bytes.includes('claim=')&&!bytes.includes('fixture-secret'));
 assert.throws(()=>readReceipt(path,{...context,environment:'production'}));
 assert.throws(()=>writeReceipt(path,{...receipt,revision:receipt.revision+1,credential:'forbidden'},context,receipt.revision));
 assert.throws(()=>writeReceipt(path,{...receipt,revision:receipt.revision+1},context,receipt.revision-1),/revision_changed/);
 // The real launcher restores reuse choices without a provider call or exposing its local claim.
 const {deploymentSetupCommand}=await import('./deployment-setup.mjs');
 const previousCwd=process.cwd(),log=console.log;let ui;
 try{
  process.chdir(root);console.log=()=>{};
  const args=['--target','cloudflare','--environment','preview','--deploy','--app-name',context.appName,'--account-id',context.accountId,'--intent','redeploy'];
  ui=await deploymentSetupCommand(args);
  const claim=new URLSearchParams(new URL(ui.url).hash.slice(1)).get('claim');
  const response=await fetch(ui.origin+'/api/claim',{method:'POST',headers:{origin:ui.origin,'content-type':'application/json'},body:JSON.stringify({token:claim})});
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const bootstrap=await (await fetch(ui.origin+'/api/bootstrap',{headers:{cookie}})).json();
  assert.equal(bootstrap.manifest.bindings['state-db'].mode,'reuse');
  assert.equal(bootstrap.manifest.bindings['state-db'].resourceRef,db);
  assert.match(bootstrap.executionInfo,/preserve secrets/);
  await assert.rejects(deploymentSetupCommand([...args.slice(0,-2),'--intent','create']),/receipt_already_exists/);
  await assert.rejects(deploymentSetupCommand(['--intent','redeploy']),/deployment_flag_required/);
 }finally{if(ui)await ui.close();console.log=log;process.chdir(previousCwd);}
 const before=calls.length;
 await assert.rejects(executeManagedCloudflare(prepared,context,options));assert.equal(calls.length,before);
 const reuse={manifest:reuseManifest(receipt),credentials:{}};
 let baseline=structuredClone(remote);
 remote.resources.cache.id='c'.repeat(32);
 await assert.rejects(executeManagedCloudflare(reuse,context,{...options,intent:'redeploy'}));
 assert.equal(calls.length,before);remote=baseline;
 const changed=structuredClone(reuse);changed.manifest.bindings.cache.config.resourceName='other-cache';
 await assert.rejects(executeManagedCloudflare(changed,context,{...options,intent:'redeploy'}));
 assert.equal(calls.length,before);
 // A remote version change after the initial review must stop the upload.
 driftOnSecond=true;identityReads=0;
 await assert.rejects(executeManagedCloudflare(reuse,context,{...options,intent:'redeploy'}));
 assert.ok(!calls.slice(before).some(a=>a[0]==='deploy'));
 driftOnSecond=false;receipt=readReceipt(path,context);assert.equal(receipt.phase,'failed');
 // Restore only our synthetic receipt for the independent positive redeploy case.
 writeReceipt(path,{...receipt,phase:'succeeded',pending:null,operationId:receipt.identity.operationId,revision:receipt.revision+1},context,receipt.revision);
 const replayStart=calls.length;
 await executeManagedCloudflare(reuse,context,{...options,intent:'redeploy'});
 const replay=calls.slice(replayStart);
 assert.ok(replay.some(a=>a[0]==='deploy'&&a.includes('--keep-vars')));
 assert.ok(!replay.some(a=>a[0]==='secret'||a.includes('create')));
 receipt=readReceipt(path,context);assert.equal(receipt.identity.versionId,version(2));
 // A compiler or injected executor cannot turn redeployment into credential/resource mutation.
 const maliciousStart=calls.length;
 await assert.rejects(executeManagedCloudflare(reuse,context,{...options,intent:'redeploy',deploy:async(_,opts)=>{
  await opts.runWrangler(['secret','put','SESSION_SECRET','--name',context.appName],{cwd:opts.cwd,stdin:'fixture-secret'});
  return {ok:true,details:{workerUrl:receipt.url}};
 }}));
 assert.equal(calls.length,maliciousStart);
 receipt=readReceipt(path,context);
 writeReceipt(path,{...receipt,phase:'succeeded',pending:null,operationId:receipt.identity.operationId,revision:receipt.revision+1},context,receipt.revision);
 // Unknown bindings/secret drift is refused before any upload.
 unknownExtra=true;const driftStart=calls.length;
 await assert.rejects(executeManagedCloudflare(reuse,context,{...options,intent:'redeploy'}));
 assert.equal(calls.length,driftStart);unknownExtra=false;
 // Simulate a completed first upload whose final metadata read was unavailable.
 const recoveryRoot=join(root,'recovery');exists=false;remote=null;storageCreated=false;failIdentity=true;
 await assert.rejects(executeManagedCloudflare(prepared,context,{...options,root:recoveryRoot}));
 let failed=readReceipt(receiptPath(recoveryRoot,context),context);assert.equal(failed.phase,'failed');assert.ok(failed.url);
 failIdentity=false;const recoveryStart=calls.length;
 await executeManagedCloudflare({manifest:reuseManifest(failed),credentials:{}},context,{...options,root:recoveryRoot,intent:'resume'});
 assert.equal(calls.length,recoveryStart,'reconciliation must not mutate the provider');
 assert.equal(readReceipt(receiptPath(recoveryRoot,context),context).phase,'succeeded');
 // Failed creation remains uncertain, never adopted by name or automatically retried.
 const uncertainRoot=join(root,'uncertain');exists=false;remote=null;storageCreated=false;failCreate=true;
 await assert.rejects(executeManagedCloudflare(prepared,context,{...options,root:uncertainRoot}));
 failed=readReceipt(receiptPath(uncertainRoot,context),context);
 assert.equal(failed.pending,'storage');
 const uncertainStart=calls.length;
 await assert.rejects(executeManagedCloudflare({manifest:reuseManifest(failed),credentials:{}},context,{...options,root:uncertainRoot,intent:'resume'}));
 assert.equal(calls.length,uncertainStart);
 // An acknowledged R2 create still needs its immutable creation identity before other mutations.
 const badIdentityRoot=join(root,'bad-storage-identity');exists=false;remote=null;storageCreated=false;failCreate=false;badStorageIdentity=true;
 const badIdentityStart=calls.length;
 await assert.rejects(executeManagedCloudflare(prepared,context,{...options,root:badIdentityRoot}));
 assert.equal(readReceipt(receiptPath(badIdentityRoot,context),context).pending,'storage');
 assert.ok(!calls.slice(badIdentityStart).some(a=>a[0]==='secret'||a[0]==='deploy'||a[0]==='d1'&&a[1]==='create'||a[0]==='kv'&&a[2]==='create'));
 badStorageIdentity=false;
 // Project real API response shapes; reject unmanaged/plain values, duplicate and split bindings.
 const id=version(5),op=version(6);
 const settings={bindings:[{type:'plain_text',name:metadata.installationBinding,text:id},{type:'d1',name:'DB',id:db},{type:'secret_text',name:'SESSION_SECRET'},{type:'assets',name:'ASSETS'}]};
 const deployments={deployments:[{id:version(3),created_on:'2026-10-20T10:00:00Z',versions:[{version_id:version(4),percentage:100}]}]};
 assert.equal(metadata.projectWorkerIdentity(settings,deployments,context).installationId,id);
 for(const binding of [{type:'plain_text',name:'UNMANAGED',text:'never-log-this-value'},{type:'service',name:'SERVICE'},{type:'d1',name:'DB',id:db}])assert.throws(()=>metadata.projectWorkerIdentity({bindings:[...settings.bindings,binding]},deployments,context));
 const split=structuredClone(deployments);split.deployments[0].versions[0].percentage=50;
 assert.throws(()=>metadata.projectWorkerIdentity(settings,split,context));
 const missing=structuredClone(settings);missing.bindings.shift();
 assert.throws(()=>metadata.projectWorkerIdentity(missing,deployments,context));
 const apiCalls=[];
 const identity=await metadata.readCloudflareIdentity(context,{runWrangler:async args=>{assert.deepEqual(args,['auth','token','--json']);return {code:0,stdout:JSON.stringify({type:'oauth',token:'synthetic-private-token'})};},
  fetcher:async(url,options)=>{apiCalls.push(url);assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer synthetic-private-token');return Response.json({success:true,result:url.endsWith('/settings')?settings:url.endsWith('/deployments')?deployments:{annotations:{'workers/tag':op}}});}});
 assert.equal(identity.operationId,op);assert.ok(!JSON.stringify(identity).includes('synthetic-private-token'));
 assert.equal(apiCalls.length,3);
 await assert.rejects(metadata.readCloudflareIdentity(context,{runWrangler:async()=>({code:0,stdout:'private-malformed'}),fetcher:()=>{throw Error('must not request');}}),/identity_verification_failed/);
 console.log('PASS managed lifecycle: locked targets, durable IDs/CAS receipts, unchanged-resource redeploy, preserved secrets, remote drift refusal, post-upload reconciliation, uncertain-create refusal and private metadata bridge');
} finally {
 for(const stage of stages){assert.equal(dirname(stage),tmpdir());assert.ok(basename(stage).startsWith('frontbase-cf-profile-'));rmSync(stage,{recursive:true,force:true});}
 assert.equal(dirname(root),tmpdir());assert.ok(basename(root).startsWith('frontbase-managed-test-'));rmSync(root,{recursive:true,force:true});
}
