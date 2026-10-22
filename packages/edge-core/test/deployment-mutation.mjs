import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { transform } from 'esbuild';
const source=readFileSync(new URL('../src/deployment.ts',import.meta.url),'utf8');
const suite=new URL('./deployment.mjs',import.meta.url);
const faults=[
 ['required state',"if(role === 'state-db')",'if(false)'],
 ['target filtering','a.targets.includes(target)','true'],
 ['user override persistence','const base=saved??defaultDeploymentManifest(target);','const base=defaultDeploymentManifest(target);'],
 ['adapter readiness','if(!adapter.selectable)','if(false)'],
 ['missing secret refusal',"if(!binding.secretRefs[field])","if(false)"],
];
for(const [name,needle,replacement] of faults){
 assert.ok(source.includes(needle),name+' mutation anchor');
 const temporary=new URL('./.deployment-fault-'+randomUUID()+'.mjs',import.meta.url);
 try{
  const {code}=await transform(source.replace(needle,replacement),{loader:'ts',format:'esm',target:'node22'});
  writeFileSync(temporary,code);
  const run=spawnSync(process.execPath,[suite.pathname.replace(/^\/(?=[A-Za-z]:)/,'')],{encoding:'utf8',env:{...process.env,FRONTBASE_DEPLOYMENT_TEST_MODULE:temporary.href},timeout:30000});
  assert.notEqual(run.status,0,name+' must be detected');
  assert.match(run.stderr,/AssertionError/,name+' must fail an assertion, not the harness');
  console.log('PASS detected: '+name);
 }finally{rmSync(temporary,{force:true});}
}
console.log('Five deployment contract faults detected; source unchanged');
