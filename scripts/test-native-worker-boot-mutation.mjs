import assert from 'node:assert/strict';
import {copyFileSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const original=readFileSync(new URL('../examples/cf-full/dist/worker.mjs',import.meta.url),'utf8');
const condition=/if\((\w+)\.FRONTBASE_DEPLOYMENT_MODE==="cloud"&&!\1\.SESSION_SECRET\)/;
assert.ok(condition.test(original),'built worker guard required');
const root=mkdtempSync(join(tmpdir(),'frontbase-native-boot-fault-'));
try {
 copyFileSync(new URL('../examples/cf-full/dist/pg-worker.mjs',import.meta.url),join(root,'pg-worker.mjs'));
 const faults=[['old self-host refusal',original.replace(condition,(_,name)=>`if(!${name}.SESSION_SECRET)`)],['cloud explicit-secret bypass',original.replace(condition,'if(false)')]];
 for(const [label,source] of faults){const path=join(root,'worker.mjs');writeFileSync(path,source);const result=spawnSync(process.execPath,[fileURLToPath(new URL('../examples/cf-full/test/native-worker-boot.mjs',import.meta.url))],{env:{...process.env,FRONTBASE_NATIVE_WORKER_MODULE:pathToFileURL(path).href},encoding:'utf8',windowsHide:true});assert.equal(result.error,undefined);assert.notEqual(result.status,0,label);assert.match(result.stderr,/AssertionError/,label);console.log('PASS independent bootstrap fault caught: '+label);}
 const restored=spawnSync(process.execPath,['examples/cf-full/test/native-worker-boot.mjs'],{encoding:'utf8',windowsHide:true});assert.equal(restored.status,0,restored.stderr);console.log('PASS original artifact retained and baseline restored');
} finally {rmSync(root,{recursive:true,force:true});}
