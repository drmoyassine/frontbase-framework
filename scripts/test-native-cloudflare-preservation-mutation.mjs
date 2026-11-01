import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const fault of ['r2','queue','unknown']){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./test-native-cloudflare-settings.mjs',import.meta.url))],{encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,NATIVE_PRESERVE_FAULT:fault}});
 assert.notEqual(result.status,0,fault+' survived');assert.match(result.stderr,/AssertionError/,fault+' failed the harness');console.log('PASS detected native binding preservation '+fault);
}
