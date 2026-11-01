import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const fault of ['issuer','audience','nonce','receiver','consume']){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./setup-owner-identity.mjs',import.meta.url))],{encoding:'utf8',timeout:60000,windowsHide:true,env:{...process.env,SETUP_IDENTITY_FAULT:fault}});
 assert.notEqual(result.status,0,fault+' survived');assert.match(result.stderr,/AssertionError/,fault+' failed the harness instead of behavior');console.log('PASS detected setup identity '+fault);
}
