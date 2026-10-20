import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const folder=mkdtempSync(join(tmpdir(),'frontbase-lifecycle-fault-'));
const faults=[
 ['baseline lifecycle','lifecycle',s=>s],
 ['baseline receipt','receipt',s=>s],
 ['baseline identity','identity',s=>s],
 ['cross-environment target lock','receipt',s=>s.replace("context.accountId+'-'+context.appName+'.lock'","context.accountId+'-'+context.appName+'-'+context.environment+'.lock'")],
 ['receipt compare and swap','receipt',s=>s.replace("(current?.revision??-1)!==expectedRevision || value.revision!==expectedRevision+1","false")],
 ['receipt unknown field','receipt',s=>s.replace("!exact(value,['schemaVersion','installationId','operationId','revision','accountId','appName','environment','artifactHash','manifest','phase','pending','resources','identity','url'])","false")],
 ['initial remote identity','lifecycle',s=>s.replace("if(!isDeepStrictEqual(before,receipt.identity))","if(false)")],
 ['immediate version fence','lifecycle',s=>s.replace("if(!isDeepStrictEqual(current,previousIdentity))","if(false)")],
 ['preserve remote variables','lifecycle',s=>s.replace("'--keep-vars',","")],
 ['redeploy command restriction','lifecycle',s=>s.replace("if(options.cwd!==stage || !['deployments','deploy'].includes(args[0]) || args[args.indexOf('--name')+1]!==context.appName || uploaded)","if(false)").replace("if(args.length!==3)","if(false)")],
 ['worker ownership marker','identity',s=>s.replace("if(!installationId || !resources.database", "if(!resources.database")],
 ['unmanaged binding refusal','identity',s=>s.replace("throw new Error('cloudflare_unmanaged_binding_refused');","continue;")],
];
try {
 for(const [name,type,mutate] of faults) {
  const path=new URL('./deployment-setup/'+({lifecycle:'cloudflare-lifecycle',receipt:'receipt',identity:'cloudflare-identity'}[type])+'.mjs',import.meta.url);
  const original=readFileSync(path,'utf8');let source=mutate(original);
  if(!name.startsWith('baseline'))assert.notEqual(source,original,'fault anchor missing: '+name);
  source=source.replace(/from '([.][^']+)'/g,(_,value)=>'from '+JSON.stringify(new URL(value,path).href));
  const candidate=join(folder,type+'.mjs');writeFileSync(candidate,source);
  const key={lifecycle:'FRONTBASE_LIFECYCLE_TEST_MODULE',receipt:'FRONTBASE_RECEIPT_TEST_MODULE',identity:'FRONTBASE_IDENTITY_TEST_MODULE'}[type];
  const run=spawnSync(process.execPath,[fileURLToPath(new URL('./test-cloudflare-lifecycle.mjs',import.meta.url))],{encoding:'utf8',timeout:20000,env:{...process.env,[key]:pathToFileURL(candidate).href}});
  if(name.startsWith('baseline'))assert.equal(run.status,0,name+': '+run.stderr);
  else assert.ok(run.status!==0 && run.status!==null,'fault escaped or timed out: '+name);
  console.log('PASS '+(name.startsWith('baseline')?'':'detected: ')+name);
 }
}finally{rmSync(folder,{recursive:true,force:true});}
