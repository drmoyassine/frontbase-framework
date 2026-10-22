import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPackage,repoRoot} from '../../../scripts/mutation-lib.mjs';
const store='packages/backend/src/compat/frontend-copy.ts',route='packages/backend/src/compat/routes/frontend-edit.ts',locale='packages/backend/src/compat/translation-homepage.ts';
const originals=new Map([store,route,locale].map(path=>[path,readFileSync(repoRoot+path,'utf8')]));
const faults=[
 ['privileged role',route,"if(!frontendEditorAllowed(c.get('principal')?.user))",'if(false)'],
 ['same origin',route,'!sameEditorOrigin(c.req.raw)','false'],
 ['page/source token',route,'if(s.token!==body.token)','if(false)'],
 ['plain text',route,'translationDisplayText(field.text,entry.text)','entry.text'],
 ['owner isolation',store,'[this.owner,ACTIVE]','[\'alpha\',ACTIVE]'],
 ['source fingerprint',store,'entry?.source===source','entry!==undefined'],
 ['publication compare-and-set',store,'AND key=? AND value=?','AND key=? AND (? IS NOT NULL)'],
 ['record identity',store,".filter(field=>!field.path.includes('initialRows')||!!field.record)",'.filter(()=>true)'],
 ['unrelated translation drafts',locale,'const catalog=[...published.catalog];',"if(Date.now()>=0){const prepared=await prepareHomepageLocale(host,db,tenant,request,target,s.token,reviewer,now,liveQuery,path,published.policy);await activateHomepageLocale(host,db,tenant,request,prepared.hash,pointer,now,liveQuery);return{hash:prepared.hash,saved:pending.length};}const catalog=[...published.catalog];"],
];
const gate=()=>{let result;for(const file of ['frontend-edit.mjs','frontend-edit-locales.mjs']){result=spawnSync(process.execPath,[repoRoot+'packages/backend/test/'+file],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(result.error,undefined);assert.equal(result.signal,null);if(result.status!==0)return result;}return result;};
const only=process.argv.includes('--only')?process.argv[process.argv.indexOf('--only')+1]:null;
if(only){const index=faults.findIndex(([name])=>name===only);assert.ok(index>=0);faults.splice(0,faults.length,faults[index]);}
assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate().status,0);
try{for(const[name,path,before,after]of faults){const original=originals.get(path);assert.equal(original.split(before).length,2,'unique anchor '+name);try{writeFileSync(repoRoot+path,original.replace(before,after));assert.equal(buildPackage('@frontbase/backend'),true);const result=gate();assert.notEqual(result.status,0,'fault detected: '+name+'\n'+result.stdout+result.stderr);}finally{writeFileSync(repoRoot+path,original);}assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate().status,0,'restored baseline '+name);console.log('RED / restored GREEN: '+name);}}finally{for(const[path,text]of originals)writeFileSync(repoRoot+path,text);assert.equal(buildPackage('@frontbase/backend'),true);}
for(const[path,text]of originals)assert.equal(readFileSync(repoRoot+path,'utf8'),text);console.log(faults.length+' independent frontend editing faults detected; sources restored');
