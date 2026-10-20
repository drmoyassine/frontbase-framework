import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const temp=mkdtempSync(join(tmpdir(),'frontbase-execution-fault-'));
const serverUrl=new URL('./deployment-setup/server.mjs',import.meta.url),executorUrl=new URL('./deployment-setup/cloudflare.mjs',import.meta.url);
const faults=[
 ['baseline server','server',s=>s],
 ['baseline executor','executor',s=>s],
 ['review identity','server',s=>s.replace('!equal(input?.reviewId,reviewId)','false')],
 ['attempt lock','server',s=>s.replaceAll('if(attempted)return','if(false)return')],
 ['private consumption','server',s=>s.replace('const selected=prepared;executedManifest=structuredClone(selected.manifest);prepared=undefined;reviewId=undefined;revision++;','const selected=prepared;executedManifest=structuredClone(selected.manifest);reviewId=undefined;revision++;')],
 ['execution policy','server',s=>s.replace('if(executionProblems.length)','if(false)')],
 ['execution response secrecy','server',s=>s.replace('return reply(200,{ok:true,url:url.origin});','return reply(200,{ok:true,url:url.origin,credentials:selected.credentials});')],
 ['build fingerprint','executor',s=>s.replaceAll('!==context.artifactHash','===null')],
 ['create collision adoption','executor',s=>s.replace("if(args[0]==='d1' && args[1]==='create' && result.code!==0)",'if(false)')],
 ['KV existing namespace refusal','executor',s=>s.replace("if(entries.some(entry=>entry.title===cache.config.resourceName))","if(false)")],
 ['KV failed-create refusal','executor',s=>s.replace("if(created.code!==0)throw new Error('cache_create_failed');","if(false)throw new Error('cache_create_failed');")],
 ['R2 known-absent preflight','executor',s=>s.replace("if(info.code===0)throw new Error('storage_already_exists');","if(false)throw new Error('storage_already_exists');").replace('if(!/The specified bucket','if(false && !/The specified bucket')],
 ['R2 failed-create refusal','executor',s=>s.replace("if(created.code!==0)throw new Error('storage_create_failed');","if(false)throw new Error('storage_create_failed');")],
 ['fixed mutation target','executor',s=>s.replace("if((kind==='secret put' || args[0]==='deploy') && args[args.indexOf('--name')+1]!==context.appName)",'if(false)')],
 ['context validation','executor',s=>s.replace('    assertCloudflareExecutionContext(context);','    // removed')],
 ['supported execution binding','executor',s=>s.replace('cloudflareExecutionIssues(plan.manifest,context).length','false')],
];
try {
 for(const [name,type,mutate] of faults){
  const url=type==='server'?serverUrl:executorUrl;const source=readFileSync(url,'utf8');let changed=mutate(source);if(!name.startsWith('baseline'))assert.notEqual(changed,source,name);
  for(const path of ['../../packages/edge-core/dist/deployment.js','../../packages/compiler/dist/cli/deploy.js','../../packages/compiler/dist/cli/app-identity.js','../console-pin.mjs'])changed=changed.replace(JSON.stringify(path).replaceAll('"',"'"),JSON.stringify(new URL(path,url).href));
  changed=changed.replace('new URL(asset[0],import.meta.url)',`new URL(asset[0],${JSON.stringify(serverUrl.href)})`);
  const candidate=join(temp,'fault.mjs');writeFileSync(candidate,changed);
  const suite=fileURLToPath(new URL(type==='server'?'./test-deployment-setup-execution.mjs':'./test-cloudflare-setup-executor.mjs',import.meta.url));
  const key=type==='server'?'FRONTBASE_SETUP_TEST_MODULE':'FRONTBASE_CF_EXECUTOR_TEST_MODULE';
  const result=spawnSync(process.execPath,[suite],{encoding:'utf8',timeout:15000,env:{...process.env,[key]:pathToFileURL(candidate).href}});
  if(name.startsWith('baseline')){assert.equal(result.status,0,`transformed baseline failed: ${name}: ${result.stderr}`);console.log(`PASS ${name}`);}else{assert.ok(result.status!==0 && result.status!==null,`fault escaped or timed out: ${name}`);console.log(`PASS detected: ${name}`);}
 }
} finally {rmSync(temp,{recursive:true,force:true});}
console.log('Fourteen execution faults detected; production source unchanged');
