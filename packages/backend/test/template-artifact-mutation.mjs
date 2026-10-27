import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildPackage,repoRoot} from '../../../scripts/mutation-lib.mjs';
const validator='packages/backend/src/compat/template-artifact.ts',route='packages/backend/src/compat/routes/template-artifact.ts';
const originals=new Map([validator,route].map(p=>[p,readFileSync(repoRoot+p,'utf8')]));
const faults=[
 ['secret exclusion',validator,"if(typeof value==='string'&&secret.test(value))","if(false)"],
 ['destination exclusion',validator,'if(c.datasourceId||c.site.origin||c.site.name||c.site.destination||c.contacts.email||c.contacts.whatsapp||Object.values(c.collections).some(m=>m.scope.value!==\'\'))','if(false)'],
 ['binding declarations',validator,"if(directoryConfigurationReadiness(c).some(gap=>!declared.has(gap)&&!declared.has('configuration.'+gap)))",'if(false)'],
 ['node identities',validator,'if(ids.has(n.id))','if(false)'],
 ['CSS safety',validator,'!/["\'<>;{}\\\\\\x00-\\x1f]|url\\s*\\(|expression\\s*\\(|@import/i.test(v)','true'],
 ['required query',validator,'if(required.some(q=>!queries.includes(q as any)))','if(false)'],
 ['route role',route,"if(!['owner','admin','tenant_admin','master_admin','master_admin_root'].includes((c.get('principal').user as {role?:string})?.role??''))",'if(false)'],
 ['route bound',route,'if(size>1024*1024)','if(size>2*1024*1024)'],
];
const gate=()=>{const r=spawnSync(process.execPath,[repoRoot+'packages/backend/test/template-artifact.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.notEqual(r.status,null);return r.status;};
assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate(),0);
try{for(const [name,path,before,after] of faults){const original=originals.get(path);assert.equal(original.split(before).length,2,name+' unique anchor');
 try{writeFileSync(repoRoot+path,original.replace(before,after));assert.equal(buildPackage('@frontbase/backend'),true);assert.notEqual(gate(),0,name+' detected');}finally{writeFileSync(repoRoot+path,original);}
 assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate(),0,name+' independently restored');console.log('RED / rebuilt GREEN: '+name);
}}finally{for(const [path,original] of originals)writeFileSync(repoRoot+path,original);assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate(),0);}
for(const [path,original] of originals)assert.equal(createHash('sha256').update(readFileSync(repoRoot+path)).digest('hex'),createHash('sha256').update(original).digest('hex'));
console.log('template-artifact mutation8/8 passed; restored source hashes match');
