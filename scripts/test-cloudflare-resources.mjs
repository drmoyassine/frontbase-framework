import assert from 'node:assert/strict';
import {discoverCloudflareResources} from './deployment-setup/cloudflare-resources.mjs';
for(const stdout of ['not JSON','{}','[{"uuid":"bad","name":"bad"}]']) {
 await assert.rejects(discoverCloudflareResources(async()=>({code:0,stdout}),'.'));
}
await assert.rejects(discoverCloudflareResources(async()=>({code:1,stdout:'[]'}),'.'));
const id='11111111-2222-3333-4444-555555555555';
await assert.rejects(discoverCloudflareResources(async args=>({code:0,stdout:JSON.stringify(args[0]==='d1'?[{uuid:id,name:'A'},{uuid:id,name:'B'}]:[])}),'.'));
const result=await discoverCloudflareResources(async args=>({code:0,stdout:JSON.stringify(args[0]==='d1'?[{uuid:id,name:'Existing DB',private:'not forwarded'}]:[{id:'a'.repeat(32),title:'Existing cache'}])}),'.');
assert.deepEqual(result['cloudflare-d1'],[{id,name:'Existing DB'}]);
console.log('PASS Cloudflare discovery: explicit IDs/names only; invalid, duplicate and failed reads refused');
