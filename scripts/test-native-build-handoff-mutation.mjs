import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),source=readFileSync(new URL('./deployment-setup/native-build-handoff.mjs',import.meta.url),'utf8');
const folder=mkdtempSync(join(tmpdir(),'fb-build-handoff-fault-'));
const run=module=>spawnSync(process.execPath,[fileURLToPath(new URL('./test-native-build-handoff.mjs',import.meta.url))],{cwd:root,env:{...process.env,FRONTBASE_BUILD_HANDOFF_MODULE:pathToFileURL(module).href},encoding:'utf8',windowsHide:true});
try{
 const file=join(folder,'handoff.mjs');writeFileSync(file,source);assert.equal(run(file).status,0,'unmodified control must pass');
 const faults=[
  ["auth?.type!=='api_token'","false"],
  ["result?.id!==account","false"],
  ['await verifyNativeBuildPermissions(account,read);','/* skipped permission check */'],
  ["!/^[a-f0-9]{64}$/.test(owner)",'false'],
  ["result?.returnPath!=='/frontbase-bootstrap/activation#claim='+owner",'false'],
  ["capabilities.push('vectorize')",'/* optional capability lost */'],
 ];
 for(const [before,after] of faults){assert.equal(source.split(before).length,2,'fault must match one source site');writeFileSync(file,source.replace(before,after));assert.notEqual(run(file).status,0,'security fault must be detected: '+before);}
 writeFileSync(file,source);assert.equal(run(file).status,0,'restored control must pass');
 console.log('PASS native build handoff mutations: 6/6 faults detected; original source unchanged');
}finally{rmSync(folder,{recursive:true,force:true});}
