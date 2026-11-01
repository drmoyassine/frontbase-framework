import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const faults=[
 ['hosted-setup-access.js','FRONTBASE_SETUP_ACCESS_MODULE','generation conflict','previous.generation !== expected','false'],
 ['hosted-setup-access.js','FRONTBASE_SETUP_ACCESS_MODULE','context binding','value.scope !== scope','false'],
 ['hosted-bootstrap.js','FRONTBASE_SETUP_BOOTSTRAP_MODULE','session generation','(payload.generation ?? 0) === access.generation','true'],
 ['hosted-bootstrap.js','FRONTBASE_SETUP_BOOTSTRAP_MODULE','renewed link','await digest(access.token)','await digest(deps.token)'],
 ['hosted-bootstrap.js','FRONTBASE_SETUP_BOOTSTRAP_MODULE','renewed expiry','now() >= Date.parse(access.expiresAt)','now() >= Date.parse(deps.expiresAt)'],
];
for(const[file,env,label,before,after]of faults){
 const path=fileURLToPath(new URL('../dist/'+file,import.meta.url)),source=readFileSync(path,'utf8');assert.equal(source.split(before).length,2,label+' anchor');
 const fault=fileURLToPath(new URL('../dist/.setup-access-fault-'+randomUUID()+'.js',import.meta.url));
 try{writeFileSync(fault,source.replace(before,after));const result=spawnSync(process.execPath,[fileURLToPath(new URL('./hosted-setup-access.mjs',import.meta.url))],{encoding:'utf8',timeout:30000,env:{...process.env,[env]:pathToFileURL(fault).href}});assert.notEqual(result.status,0,label);assert.match(result.stderr,/AssertionError/,label+' behavioral failure');console.log('PASS detected '+label);}finally{unlinkSync(fault);}
 assert.equal(readFileSync(path,'utf8'),source);
}
