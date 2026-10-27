import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const backend=fileURLToPath(new URL('../packages/backend/',import.meta.url));
const temp=mkdtempSync(join(backend,'.bindings-fault-'));
const route=new URL('../packages/backend/dist/compat/routes/deployment-bindings.js',import.meta.url);
const app=new URL('../packages/backend/dist/compat/app.js',import.meta.url);
const original=readFileSync(route,'utf8');
const faults=[
 ['baseline',s=>s],
 ['operator authorization',s=>s.replaceAll('if (!operator(c))','if (false)')],
 ['tenant scope',s=>s.replace(" && tenant === '_root'",'').replace(" && tenant === '_default'",'')],
 ['cloud exclusion',s=>s.replace('!options.cloudMode &&','true &&')],
 ['nonsecret host projection',s=>s.replace('readManagedRuntimeManifest(options.manifest)',"JSON.parse(options.manifest)")],
 ['bounded request',s=>s.replace('maxSize: 32768','maxSize: 1048576')],
 ['credential payload refusal',s=>s.replace('Object.keys(body).length !== 1','false')],
 ['non-applying response',s=>s.replace('c.json(review, review.ready ? 200 : 422)','c.json({...review,applied:true}, review.ready ? 200 : 422)')],
];
function absolute(source,base){return source.replace(/from '([.][^']+)'/g,(_,path)=>'from '+JSON.stringify(new URL(path,base).href));}
try {
 for(const [name,mutate] of faults){
  const changed=mutate(original);if(name!=='baseline')assert.notEqual(changed,original,name+' anchor');
  const candidate=join(temp,'route.mjs');writeFileSync(candidate,absolute(changed,route));
  let application=readFileSync(app,'utf8').replace("'./routes/deployment-bindings.js'",JSON.stringify(pathToFileURL(candidate).href));
  application=absolute(application,app);const entry=join(temp,'app.mjs');writeFileSync(entry,application);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../packages/backend/test/deployment-bindings.mjs',import.meta.url))],{cwd:backend,encoding:'utf8',timeout:30000,env:{...process.env,FRONTBASE_BINDINGS_APP_TEST_MODULE:pathToFileURL(entry).href}});
  if(name==='baseline')assert.equal(result.status,0,'transformed baseline: '+result.stderr);
  else assert.ok(result.status!==0 && result.status!==null,'fault escaped/timed out: '+name);
  console.log('PASS '+(name==='baseline'?'':'detected: ')+name);
 }
}finally{assert.equal(dirname(temp),backend.replace(/[\\/]$/,''));assert.ok(basename(temp).startsWith('.bindings-fault-'));rmSync(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
