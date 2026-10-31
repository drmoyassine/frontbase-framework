import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const cases=[
 ['relay','browser registration origin',"!deps.registerReceiver || c.req.header('origin') ||",'!deps.registerReceiver || false ||'],
 ['relay','receiver response origin','proof.origin !== t.origin','false'],
 ['relay','receiver response host','proof.host !== t.host','false'],
 ['relay','receiver fingerprint','proof.proof !== input.proof','false'],
 ['relay','receiver bounded response','readBody(response, 4096)','readBody(response, 65536)'],
 ['relay','receiver HTTP success',"!response.ok || !response.headers.get('content-type')", "false || !response.headers.get('content-type')"],
 ['store','create-only enrollment','ON CONFLICT(origin) DO NOTHING RETURNING origin','ON CONFLICT(origin) DO UPDATE SET receiver_proof = excluded.receiver_proof RETURNING origin'],
 ['store','enrollment host','rows.length === 1 && rows[0].host === target.host && rows[0].receiver_proof === proof','rows.length === 1 && true && rows[0].receiver_proof === proof'],
 ['store','legacy claim precedence','legacy[0].receiver_proof !== proof','false'],
 ['store','bounded registry','(SELECT COUNT(*) FROM _frontbase_oauth_receivers) < ?','(SELECT COUNT(*) FROM _frontbase_oauth_receivers) <= ?'],
 ['client','private verifier secrecy','proof: await hash(deps.registrationKey)','proof: deps.registrationKey'],
 ['client','enrollment verifier digest','proof: await hash(verifier)','proof: verifier'],
];
const types={relay:['provider-oauth-relay.js','FRONTBASE_RECEIVER_RELAY_MODULE'],store:['provider-oauth-relay-store.js','FRONTBASE_RECEIVER_STORE_MODULE'],client:['provider-oauth-relay-client.js','FRONTBASE_RECEIVER_CLIENT_MODULE']};
let killed=0;
for(const [kind,label,before,after]of cases){const [filename,variable]=types[kind],base=new URL('../dist/'+filename,import.meta.url),source=readFileSync(base,'utf8');assert.equal(source.split(before).length,2,'unique fault site: '+label);const file=new URL('../dist/.receiver-fault-'+randomUUID()+'.js',import.meta.url);const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('./provider-oauth-receiver.mjs',import.meta.url))],{env:{...process.env,[variable]:file.href},encoding:'utf8',windowsHide:true,timeout:20000});
 try{writeFileSync(file,source);const control=run();assert.equal(control.status,0,label+' control failed: '+control.stderr);writeFileSync(file,source.replace(before,after));const fault=run();assert.notEqual(fault.status,0,'survived: '+label);assert(!fault.error,'fault timed out instead of failing: '+label);killed++;}finally{unlinkSync(file);}}
console.log('PASS receiver enrollment mutations: '+killed+'/'+cases.length+' faults detected; original source unchanged');
