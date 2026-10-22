import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPackage,repoRoot} from '../../../scripts/mutation-lib.mjs';
const routes='packages/backend/src/compat/routes/actions.ts',runtime='packages/backend/src/routes/phase2.ts',store='packages/backend/src/db/phase2-store.ts',mail='packages/backend/src/compat/routes/workflows.ts',authoring='packages/backend/src/compat/workflow-authoring.ts';
const originals=new Map([routes,runtime,store,mail,authoring].map(path=>[path,readFileSync(repoRoot+path,'utf8')]));
const faults=[
 ['authoring privilege',routes,"app.use('/api/actions/*',requireRole('owner','admin','tenant_admin','master_admin','master_admin_root'));",''],
 ['actual execution result',runtime,'JSON.stringify(result.result ?? {})','JSON.stringify({})'],
 ['selected-node recovery fence',runtime,"if(row.trigger==='authoring_test'||row.trigger==='authoring_node')",'if(false)'],
 ['publication version CAS',store,'id=? AND tenant_slug=? AND version=?\',[now,id,this.tenant,version]','id=? AND tenant_slug=? AND (? IS NOT NULL)\',[now,id,this.tenant,version]'],
 ['mail guarded transport',mail,'guardedExternalFetch(externalFetch,input,init)','fetch(input,init)'],
 ['workflow HTTP guard',authoring,'guardedExternalFetch(externalFetch,input,','externalFetch(input,'],
];
const gate=()=>{const result=spawnSync(process.execPath,[repoRoot+'packages/backend/test/workflow-authoring.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(result.error,undefined);assert.equal(result.signal,null);return result;};
assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate().status,0);
try{for(const[name,path,before,after]of faults){const original=originals.get(path);assert.equal(original.split(before).length,2,'unique anchor '+name);try{writeFileSync(repoRoot+path,original.replace(before,after));assert.equal(buildPackage('@frontbase/backend'),true);assert.notEqual(gate().status,0,'fault must fail '+name);}finally{writeFileSync(repoRoot+path,original);}assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate().status,0);console.log('RED / restored GREEN: '+name);}}finally{for(const[path,text]of originals)writeFileSync(repoRoot+path,text);assert.equal(buildPackage('@frontbase/backend'),true);}
for(const[path,text]of originals)assert.equal(readFileSync(repoRoot+path,'utf8'),text);console.log(faults.length+' independent authoring faults detected; sources restored');
