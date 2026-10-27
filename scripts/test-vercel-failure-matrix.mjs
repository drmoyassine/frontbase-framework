import assert from 'node:assert/strict';
import {readFileSync as read,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {executeManagedVercel,readVercelReceipt,vercelReceiptPath} from './deployment-setup/vercel-receipt.mjs';
import {executeVercelProfile} from './deployment-setup/vercel.mjs';
import {defaultDeploymentManifest,readManagedRuntimeManifest} from '../packages/edge-core/dist/deployment.js';
import * as policy from './vercel-deployment-policy.mjs';
import * as operation from './deployment-setup/vercel-operation.mjs';
import {DEPLOY_SECRET_NAMES,deploymentEnvironment} from './deploy-environment.mjs';
// Execute the actual deploy orchestration with only OS/build/provider boundaries replaced.
// This is deterministic fault evidence, not a live-provider or real-build certificate.
const source=read(process.env.FRONTBASE_VERCEL_SCRIPT_TEST_PATH??new URL('./deploy-vercel.mjs',import.meta.url),'utf8');
const executable=source.replace(/^#![^\n]*\n/,'').replace(/^import [^\n]+;\r?$/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('./deploy-vercel.mjs',import.meta.url).href));
const dependencies={fileURLToPath,pathToFileURL,dirname,join,SECRET_NAMES:DEPLOY_SECRET_NAMES,deploymentEnvironment,readManagedRuntimeManifest,...policy,...operation};
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const main=new AsyncFunction(...Object.keys(dependencies),'spawnSync','readFileSync','validateStagedConsole','verifyHostArtifact','process','console',executable);
const root=mkdtempSync(join(tmpdir(),'frontbase-vercel-failure-'));
const context={scope:'team_fixture',project:'failure-'+basename(root).slice(-6).toLowerCase(),environment:'preview'};
const oldUrl='https://previous-fixture.vercel.app',newUrl='https://candidate-fixture.vercel.app';
const manifest=defaultDeploymentManifest('vercel');manifest.bindings['state-db']={adapterId:'turso-marketplace',mode:'reuse',resourceRef:'store_fixture',config:{},secretRefs:{}};
class Exit extends Error{constructor(code){super('exit');this.code=code;}}
const cases=['build','console-gate','artifact-gate','auth','link','project-identity','history-unavailable','empty-preview','integration','env-first','env-middle','env-ambiguous','env-last','project-update','upload-failed','upload-lost-ack','url-unknown','target-unavailable','wrong-target','wrong-team','not-ready','operation-unavailable','operation-ambiguous','operation-mismatch','success'];
let count=0;
try{
 for(const failure of cases){
  const fixtureRoot=join(root,failure),prepared={manifest,credentials:{}};
  await executeManagedVercel(prepared,context,{root:fixtureRoot,execute:async()=>({ok:true,url:oldUrl})});
  const original=readVercelReceipt(fixtureRoot,context),calls=[],writes=[],logs=[];
  let uploaded=false,envCount=0,expectedEnvCount=0,desired={FRONTBASE_CACHE:'old-cache',SESSION_SECRET:'existing-private-key'},before=structuredClone(desired),candidateSnapshot;
  const execute=async(p,marked)=>executeVercelProfile(p,marked,{run:async(argv,stdin)=>{
   const envInput=JSON.parse(stdin),envKeys=Object.keys(deploymentEnvironment(envInput));expectedEnvCount=envKeys.length;
   const run=(bin,args,opts={})=>{
    if(bin==='node')return {status:failure==='build'?1:0};
    assert.equal(bin,'vercel');assert.ok(args.includes(context.scope));calls.push(args);
    assert.ok(!JSON.stringify(args).includes('existing-private-key'));
    const answer=(data,status=0)=>({status,stdout:typeof data==='string'?data:JSON.stringify(data),stderr:''});
    if(args[0]==='whoami')return answer('fixture',failure==='auth'?1:0);
    if(args[0]==='link')return answer('',failure==='link'?1:0);
    if(args[0]==='project'&&args[1]==='inspect')return answer({id:failure==='project-identity'?'prj_other':'prj_fixture',name:context.project,accountId:context.scope,owner:{slug:'fixture-team'}});
    if(args[0]==='integration'&&args[1]==='list')return answer({resources:[{id:'store_fixture',name:'fixture-db',projects:[context.project]}]});
    if(args[0]==='integration')return answer({resource:{id:'store_fixture',product:'Turso',projects:[{id:'prj_fixture',environments:failure==='integration'?['production']:['preview']}]}});
    if(args[0]==='list'&&!args.includes('--meta'))return answer({deployments:failure==='empty-preview'?[]:[{url:new URL(oldUrl).hostname}]},failure==='history-unavailable'?1:0);
    if(args[0]==='env'){
     assert.equal(args[1],'add');assert.ok(args.includes('preview'));assert.ok(!args.includes('production'));assert.ok(args.includes('--force'));assert.ok(args.includes('--sensitive'));
     envCount++;const cutoff=failure==='env-first'?1:failure==='env-middle'||failure==='env-ambiguous'?2:failure==='env-last'?envKeys.length:-1;
     if(envCount===cutoff&&failure!=='env-ambiguous')return answer('',1);
     desired[args[2]]=opts.input;writes.push(args[2]);
     return answer('',envCount===cutoff?1:0);
    }
    if(args[0]==='project'&&args[1]==='update')return answer('',failure==='project-update'?1:0);
    if(args[0]==='deploy'){
     assert.equal(args[args.indexOf('--environment')+1],'preview');
     if(failure==='upload-failed')return answer('synthetic-private-host-output',1);
     uploaded=true;candidateSnapshot=structuredClone(desired);
     return answer(failure==='url-unknown'?'no canonical URL':{url:newUrl},failure==='upload-lost-ack'?1:0);
    }
    if(args[0]==='inspect')return answer({id:'dpl_fixture',name:context.project,target:failure==='wrong-target'?'production':'preview',readyState:failure==='not-ready'?'BUILDING':'READY',contextName:failure==='wrong-team'?'other-team':'fixture-team',url:new URL(newUrl).hostname},failure==='target-unavailable'?1:0);
    if(args[0]==='list'){
     const match={url:new URL(newUrl).hostname,name:context.project,target:null,state:'READY',meta:{frontbaseOperation:failure==='operation-mismatch'?'other':marked.operationId,frontbaseManifest:marked.manifestDigest}};
     return answer({deployments:failure==='operation-ambiguous'?[match,match]:[match]},failure==='operation-unavailable'?1:0);
    }
    throw Error('unexpected host command: '+args.slice(0,2).join(' '));
   };
   const readFileSync=(path)=>path===0?stdin:String(path).endsWith('project.json')?JSON.stringify({orgId:context.scope,projectId:'prj_fixture'}):assert.fail('unexpected file read');
   const fakeProcess={argv:['node','deploy-vercel.mjs',...argv],env:{},platform:process.platform,exit:code=>{throw new Exit(code);}};
   try{await main(...Object.values(dependencies),run,readFileSync,()=>{if(failure==='console-gate')throw Error('artifact refused');},()=>({ok:failure!=='artifact-gate',checks:[]}),fakeProcess,{log:(...x)=>logs.push(x.join(' ')),error:(...x)=>logs.push(x.join(' '))});return {code:0,stdout:logs.join('\n')};}catch(e){if(e instanceof Exit)return {code:e.code,stdout:logs.join('\n')};throw e;}
  }});
  if(failure==='success')await executeManagedVercel(prepared,{...context,intent:'redeploy'},{root:fixtureRoot,execute});
  else await assert.rejects(executeManagedVercel(prepared,{...context,intent:'redeploy'},{root:fixtureRoot,execute}),/vercel_profile_deployment_failed_resources_preserved/);
  const journal=readVercelReceipt(fixtureRoot,context);
  assert.equal(journal.phase,failure==='success'?'succeeded':'failed',failure);
  assert.equal(journal.url,failure==='success'?newUrl:oldUrl,'failure retains previous known URL');
  assert.deepEqual(journal.manifest,original.manifest);assert.equal(desired.SESSION_SECRET,before.SESSION_SECRET);
  assert.ok(calls.every(a=>!['rollback','promote','remove','rm'].includes(a[0])),'no implicit remote rollback or resource removal');
  assert.ok(calls.every(a=>a[0]!=='env'||a[1]==='add'),'no environment deletion or secret retrieval');
  assert.ok(!read(vercelReceiptPath(fixtureRoot,context),'utf8').includes('existing-private-key'));
  const noWrites=['build','console-gate','artifact-gate','auth','link','project-identity','history-unavailable','empty-preview','integration'];
  if(noWrites.includes(failure)){assert.equal(writes.length,0);assert.equal(uploaded,false);}
  if(failure.startsWith('env-')){assert.equal(uploaded,false);assert.ok(!calls.some(a=>a[0]==='project'&&a[1]==='update'));assert.equal(envCount,failure==='env-first'?1:failure==='env-last'?expectedEnvCount:2);}
  if(failure==='env-ambiguous')assert.ok(writes.length===2,'unacknowledged applied write is preserved, not assumed rolled back');
  if(failure==='project-update')assert.equal(uploaded,false,'failed project configuration cannot upload');
  if(failure==='upload-failed')assert.equal(uploaded,false);
  if(['upload-lost-ack','url-unknown','target-unavailable','wrong-target','wrong-team','not-ready','operation-unavailable','operation-ambiguous','operation-mismatch'].includes(failure))assert.equal(uploaded,true,'unknown upload outcome retains failed journal');
  if(candidateSnapshot)assert.equal(candidateSnapshot.SESSION_SECRET,before.SESSION_SECRET);
  assert.equal(before.FRONTBASE_CACHE,'old-cache','original deployment snapshot remains separate from desired host values');
  if(failure!=='success'){
   const saved=read(vercelReceiptPath(fixtureRoot,context),'utf8'),revert=structuredClone(manifest);revert.bindings.cache={adapterId:'upstash-http',mode:'connect',config:{url:'https://previous.example'},secretRefs:{token:'cache/token'}};
   await assert.rejects(executeManagedVercel({manifest:revert,credentials:{'cache/token':'synthetic'}},{...context,intent:'redeploy'},{root:fixtureRoot,execute:async()=>assert.fail('unreconciled rollback must not dispatch')}),/pending_plan_requires_reconciliation/);
   assert.equal(read(vercelReceiptPath(fixtureRoot,context),'utf8'),saved,'blocked different plan preserves failed journal');
  }
  count++;console.log('PASS '+failure);
 }
 console.log('PASS '+count+' actual-orchestrator failure cases; no automatic rollback, provider deletion, secret rotation or unknown-outcome success');
}finally{assert.equal(resolve(root,'..'),resolve(tmpdir()));assert.ok(basename(root).startsWith('frontbase-vercel-failure-'));rmSync(root,{recursive:true,force:true});}
