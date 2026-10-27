import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const sourcePath=fileURLToPath(new URL('../dist/hosted-bootstrap.js',import.meta.url)),source=readFileSync(sourcePath,'utf8');
const testPath=fileURLToPath(new URL('./hosted-bootstrap.mjs',import.meta.url));
const faults=[
 ['configured origin','url.origin !== deps.origin','false'],
 ['POST origin',"c.req.header('origin') !== deps.origin",'false'],
 ['setup expiry','now() >= expiry','false'],
 ['cookie audience','payload.aud === audience','true'],
 ['cookie expiry','payload.exp > now()','true'],
 ['body bounds','length > 65536','false'],
 ['initialized lock',"(await deps.journal.read(deps.context))?.phase === 'active'",'false'],
];
for(const [name,before,after] of faults){assert.equal(source.split(before).length,2,name+' anchor');const path=fileURLToPath(new URL('../dist/.hosted-bootstrap-fault-'+randomUUID()+'.js',import.meta.url));try{writeFileSync(path,source.replace(before,after));const r=spawnSync(process.execPath,[testPath],{encoding:'utf8',timeout:20000,env:{...process.env,FRONTBASE_HOSTED_BOOTSTRAP_TEST_MODULE:pathToFileURL(path).href}});assert.notEqual(r.status,0,name);assert.match(r.stderr,/AssertionError/,name+' behavior');console.log('PASS detected '+name);}finally{unlinkSync(path);}}
assert.equal(readFileSync(sourcePath,'utf8'),source);console.log('PASS seven hosted authorization faults; source unchanged');
