import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const original=readFileSync(new URL('../dist/pending-administrator.js',import.meta.url),'utf8');
const output=new URL('../dist/pending-administrator-fault.js',import.meta.url);
const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('./pending-administrator.mjs',import.meta.url))],{
 env:{...process.env,FRONTBASE_PENDING_ADMIN_TEST_MODULE:output.href},encoding:'utf8',timeout:30000,windowsHide:true
});
const faults=[
 ['confirmation','if (confirmation !== password)','if (false)'],
 ['scope','record.installationId !== installationId','false'],
 ['plaintext','passwordHash: await hashPassword(password)','passwordHash: password'],
 ['fixed-role',"role: 'master_admin'","role: 'owner'"],
 ['extra-fields','Object.keys(input).length !== 3','false']
];
try{
 writeFileSync(output,original);assert.equal(run().status,0,'healthy control');
 for(const[name,from,to]of faults){
  assert(original.includes(from),'missing mutation anchor '+name);
  writeFileSync(output,original.replace(from,to));
  const result=run();assert.notEqual(result.status,0,name+' survived');
  assert.match(result.stdout+result.stderr,/AssertionError/,name+' must fail a behavioral assertion');
  console.log('PASS detected pending administrator '+name);
 }
}finally{try{unlinkSync(output);}catch{}}

const hosted=readFileSync(new URL('../dist/hosted-bootstrap.js',import.meta.url),'utf8');
const hostedOutput=new URL('../dist/admin-bootstrap-fault.js',import.meta.url);
try{
 for(const[name,from,to]of [
  ['password-check','await verifyPassword(input.password, pending.passwordHash)','true'],
  ['sign-in-limit','!await deps.administrator.consumeSignInAttempt()','false'],
  ['draft-write-after-submit',"c.get('phase') && c.get('phase') !== 'reviewed'",'false']
 ]){
  assert(hosted.includes(from),'missing resume mutation '+name);
  writeFileSync(hostedOutput,hosted.replace(from,to));
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./pending-administrator.mjs',import.meta.url))],{env:{...process.env,FRONTBASE_ADMIN_BOOTSTRAP_TEST_MODULE:hostedOutput.href},encoding:'utf8',timeout:30000,windowsHide:true});
  assert.notEqual(result.status,0,name+' survived');assert.match(result.stdout+result.stderr,/AssertionError/);console.log('PASS detected administrator resume '+name);
 }
}finally{try{unlinkSync(hostedOutput);}catch{}}
