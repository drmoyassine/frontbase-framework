import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPackage,repoRoot} from '../../../scripts/mutation-lib.mjs';
const path=repoRoot+'packages/backend/src/compat/frontend-records.ts',original=readFileSync(path,'utf8');
const faults=[
 ['source tenant',"host.syncFor(owner)","host.syncFor('alpha')"],
 ['source fingerprint','if(shown!==field.text)', 'if(false)'],
 ['record key predicate','WHERE ${quote(key.column)} = ${ph(2)} AND ${predicate}','WHERE (${ph(2)} IS NOT NULL) AND ${predicate}'],
 ['concurrent value predicate','AND ${predicate} RETURNING','AND (${ph(3)} IS NOT NULL) RETURNING'],
];
const gate=()=>spawnSync(process.execPath,[repoRoot+'packages/backend/test/frontend-records.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});
assert.ok(buildPackage('@frontbase/backend'));assert.equal(gate().status,0);
try{for(const [name,before,after]of faults){assert.equal(original.split(before).length,2,name);try{writeFileSync(path,original.replace(before,after));assert.ok(buildPackage('@frontbase/backend'));const result=gate();assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.notEqual(result.status,0,'undetected '+name);}finally{writeFileSync(path,original);}assert.ok(buildPackage('@frontbase/backend'));assert.equal(gate().status,0);console.log('RED / restored GREEN: '+name);}}finally{writeFileSync(path,original);assert.ok(buildPackage('@frontbase/backend'));}
console.log('4 source-write faults detected; source restored');
