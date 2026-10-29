import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const file=relative=>fileURLToPath(new URL(relative,import.meta.url));
const source=file('./deployment-setup/supabase-state-provision.mjs');
const suite=file('./test-supabase-state-provision.mjs');
const original=readFileSync(source,'utf8');
const faults=[
 // Dropping the create emptiness fence would DDL into an occupied schema.
 ['create emptiness fence',"if(plan.mode==='create'){\n  if((await tablesIn(fetch,token,plan.projectRef,plan.schemaName)).length)throw","if(plan.mode==='create'){\n  if(false&&(await tablesIn(fetch,token,plan.projectRef,plan.schemaName)).length)throw"],
 // Dropping the reuse existence fence would mint credentials for a vanished schema.
 ['reuse existence fence',"if(!Array.isArray(schemas)||!schemas.length)throw Error('selected_resource_changed');","if(false)throw Error('selected_resource_changed');"],
 // Dropping the database-wide grants leaves an adopted schema without sequence access.
 ['reuse connect and sequence grants',"+`GRANT CONNECT ON DATABASE postgres TO ${roleName};\\n`\n ",""],
 // Leaking the management token into the execution profile hands the operator's DDL
 // credential to every downstream host.
 ['token stripped from execution profile',"delete transformed.credentials[plan.tokenRef];",";"],
];
const run=(moduleHref)=>spawnSync(process.execPath,[suite],{encoding:'utf8',timeout:60000,env:{...process.env,FRONTBASE_SUPABASE_PROVISION_MODULE:moduleHref}});
assert.equal(run().status,0,'baseline suite must pass before faulting');
const candidates=[];
try{
 for(const [name,before,after] of faults){
  assert.equal(original.split(before).length,2,'unique source anchor '+name);
  const candidate=join(dirname(source),'.supabase-state-fault-'+randomUUID()+'.mjs');candidates.push(candidate);
  writeFileSync(candidate,original.replace(before,after),{flag:'wx'});
  const result=run(pathToFileURL(candidate).href);
  assert.ok(result.status!==0&&result.status!==null,'fault escaped '+name);
  assert.match(result.stdout+result.stderr,/❌|AssertionError|Error:/,'fault must fail behavior, not imports '+name);
  console.log('PASS detected: '+name);
  unlinkSync(candidate);candidates.pop();
 }
 assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),createHash('sha256').update(original).digest('hex'));
 assert.equal(run().status,0,'restored baseline');
 console.log('PASS four independent supabase state provisioning faults; original bytes unchanged');
}finally{for(const candidate of candidates)unlinkSync(candidate);}
