import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const fault of ['team-owner','confirmed','held','account','canonical-origin','cf-closed','cf-root']){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./setup-renewal.mjs',import.meta.url))],{encoding:'utf8',timeout:60000,env:{...process.env,HOSTED_RENEWAL_FAULT:fault}});
 assert.notEqual(result.status,0,fault+' survives');assert.match(result.stderr,/AssertionError/,fault+' must fail behavior, not the harness');console.log('PASS detected renewal '+fault);
}
