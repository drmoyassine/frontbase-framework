import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const target=new URL('../dist/node-http.js',import.meta.url),gate=new URL('node-http.mjs',import.meta.url),original=readFileSync(target,'utf8');
const faults=[
 ['private address policy','const family = isIP(address);','return true; const family = isIP(address);'],
 ['DNS lookup wired into connector','connect: { lookup, autoSelectFamily: true }','connect: { lookup: undefined, autoSelectFamily: true }'],
 ['manual redirects',"redirect: 'manual'","redirect: 'follow'"],
 ['native Request body','body: request.body,','body: undefined,'],
 ['safe errors',"throw Error('provider_node_http_failed');","throw Error('PRIVATE_PROVIDER_CAUSE');"],
];
function run(){const result=spawnSync(process.execPath,[fileURLToPath(gate)],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(result.error,undefined);assert.equal(result.signal,null);return result;}
assert.equal(run().status,0,'clean baseline');
try{for(const[name,before,after]of faults){assert.equal(original.split(before).length,2,'unique '+name);writeFileSync(target,original.replace(before,after));assert.notEqual(run().status,0,name+' must fail');writeFileSync(target,original);assert.equal(run().status,0,name+' restored');console.log('RED / restored GREEN: '+name);}}
finally{writeFileSync(target,original);}
assert.equal(readFileSync(target,'utf8'),original);console.log('node-http: five independent artifact faults detected; artifact restored');
