import {readFile,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const source=new URL('../dist/compat/template-install-store.js',import.meta.url),raw=await readFile(source,'utf8');
const cases=[
 ['history','config.length || pages.length > 1 || versions.length','config.length || pages.length > 1'],
 ['welcome',"if (seed.name !== 'Home'",'if (false && seed.name !== \'Home\''],
 ['atomic-guard','WHERE NOT (${guard})','WHERE 0'],
 ['receipt',"phase: 'installed'","phase: 'applying'"],
 ['request-binding','prior.operationId !== operationId || prior.reviewHash !== reviewHash || prior.requestHash !== requestHash','prior.operationId !== operationId'],
];
for(const [name,find,replace]of cases){assert(raw.includes(find),'mutation anchor missing: '+name);const target=new URL('../dist/compat/.template-install-'+name+'.js',import.meta.url);try{await writeFile(target,raw.replace(find,replace));const test=spawnSync(process.execPath,[fileURLToPath(new URL('./template-install.mjs',import.meta.url))],{env:{...process.env,FRONTBASE_INSTALL_MODULE:target.href},encoding:'utf8',timeout:45000});assert(test.status!==0,'undetected installer fault: '+name);assert(!test.error,'harness failed: '+name);console.log('PASS detected installer '+name);}finally{await unlink(target).catch(()=>{});}}
