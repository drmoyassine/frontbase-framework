import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('./live-list-consistency.mjs',import.meta.url));
for(const fault of ['view','hidden','sort']){
 const result=spawnSync(process.execPath,[target],{env:{...process.env,LIVE_LIST_FAULT:fault},encoding:'utf8'});
 assert.notEqual(result.status,0,`fault escaped: ${fault}`);
 assert.match(result.stderr,/AssertionError/,`fault must reach behavioral assertion: ${fault}\n${result.stderr}`);
 console.log(`live-list mutation ${fault}: caught`);
}
console.log('live-list-consistency-mutation: PASS (3/3; in-memory faults, no source mutation)');
