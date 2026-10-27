import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const modulePath=fileURLToPath(new URL('../dist/deployment-bootstrap.js',import.meta.url));
const testPath=fileURLToPath(new URL('./deployment-bootstrap.mjs',import.meta.url));
const source=readFileSync(modulePath,'utf8');
const faults=[
 ['apply review identity','record.operationId !== reviewId','false'],
 ['apply phase fence',"record.phase !== 'reviewed'",'false'],
 ['review phase fence',"prior.phase !== 'reviewed'",'false'],
 ['credential validation','validateCredentials(record.manifest, credentials);',''],
 ['claimed operation dispatch','if (!await journal.compareAndSwap(context, record.revision, structuredClone(applying)))','if (false)'],
 ['manifest integrity','if (await fingerprint(context, manifest) !== record.fingerprint)','if (false)'],
 ['destination ownership','record.destination !== context.destination','false'],
 ['active operation identity','proof.operationId === record.operationId','true'],
 ['active manifest proof','proof.fingerprint === record.fingerprint','true'],
 ['health proof','proof.healthy === true','true'],
 ['disabled bootstrap proof','proof.bootstrapDisabled === true','true'],
];
for(const [name,before,after] of faults){assert.equal(source.split(before).length,2,name+' anchor');const path=fileURLToPath(new URL('../dist/.bootstrap-fault-'+randomUUID()+'.js',import.meta.url));try{writeFileSync(path,source.replace(before,after));const r=spawnSync(process.execPath,[testPath],{encoding:'utf8',timeout:20000,env:{...process.env,FRONTBASE_BOOTSTRAP_TEST_MODULE:pathToFileURL(path).href}});assert.notEqual(r.status,0,name);assert.match(r.stderr,/AssertionError/,name+' must fail behavior');console.log('PASS detected '+name);}finally{unlinkSync(path);}}
assert.equal(readFileSync(modulePath,'utf8'),source);console.log('PASS 11 bootstrap fault injections; source unchanged');
