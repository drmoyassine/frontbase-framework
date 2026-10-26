import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const suite=fileURLToPath(new URL('./test-vercel-binding-changes.mjs',import.meta.url));
const helper=fileURLToPath(new URL('./deployment-setup/vercel-bindings.mjs',import.meta.url));
const lowering=fileURLToPath(new URL('./deployment-setup/profile-environment.mjs',import.meta.url));
const runtime=fileURLToPath(new URL('../packages/backend/src/compat/system-services.ts',import.meta.url));
const runtimeDir=fileURLToPath(new URL('../packages/backend/dist/compat/',import.meta.url));
const originals=new Map([helper,lowering,runtime].map(file=>[file,readFileSync(file,'utf8')]));
const faults=[
 ['uncertain-plan fence',helper,"previous.phase!=='succeeded'&&!isDeepStrictEqual(previous.manifest,manifest)",'false','FRONTBASE_BINDING_CHANGE_MODULE'],
 ['unsupported role fence',helper,"role!=='state-db'&&!supported.has(role)&&!isDeepStrictEqual(previous.manifest.bindings[role],binding)",'false','FRONTBASE_BINDING_CHANGE_MODULE'],
 ['explicit disabled host value',lowering,"if(name)",'if(false)','FRONTBASE_PROFILE_ENV_MODULE'],
 ['cache legacy resurrection',runtime,"cache.provider === 'none' || hasContent(cache)",'hasContent(cache)','FRONTBASE_SERVICE_ENV_MODULE'],
 ['queue legacy resurrection',runtime,"explicitQueue.provider === 'none' || hasContent(explicitQueue)",'hasContent(explicitQueue)','FRONTBASE_SERVICE_ENV_MODULE'],
 ['disabled queue callback credential',runtime,"explicitQueue.provider !== 'none' && env.FRONTBASE_QUEUE_CALLBACK_SECRET",'env.FRONTBASE_QUEUE_CALLBACK_SECRET','FRONTBASE_SERVICE_ENV_MODULE'],
];
const run=env=>spawnSync(process.execPath,[suite],{encoding:'utf8',timeout:60000,env:{...process.env,...env}});
const base=run({});assert.equal(base.status,0,base.stderr);const artifacts=[];
try {
 for(const [name,file,before,after,variable] of faults) {
  const original=originals.get(file);assert.equal(original.split(before).length,2,'unique anchor '+name);
  let changed=original.replace(before,after);
  if(file===runtime)changed=ts.transpileModule(changed,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const candidate=join(file===runtime?runtimeDir:dirname(file),'.binding-fault-'+randomUUID()+'.mjs');artifacts.push(candidate);writeFileSync(candidate,changed,{flag:'wx'});
  const result=run({[variable]:pathToFileURL(candidate).href});
  assert.ok(result.status!==null&&result.status!==0,'fault escaped '+name);
  assert.match(result.stderr,/AssertionError/,'fault must fail a behavioral assertion, not import/compile '+name);
  console.log('PASS detected: '+name);unlinkSync(candidate);artifacts.pop();
 }
 assert.equal(run({}).status,0,'restored baseline');
 for(const [file,original] of originals)assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),createHash('sha256').update(original).digest('hex'));
 console.log('PASS six independent optional-binding faults; original source bytes unchanged');
}finally{for(const candidate of artifacts)unlinkSync(candidate);}
