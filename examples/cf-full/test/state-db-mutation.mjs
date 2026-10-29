// Mutation gate for the state-db resolver's native Hyperdrive selection: each fault
// must flip a behavioral assertion in test/state-db.mjs (run against the faulted
// BUILT module via FRONTBASE_STATE_DB_TEST_MODULE), never an import error.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const source=fileURLToPath(new URL('../dist/state-db.mjs',import.meta.url));
const suite=fileURLToPath(new URL('./state-db.mjs',import.meta.url));
const original=readFileSync(source,'utf8');
// The bare-binding gate stays: without an explicit key the committed cloud binding
// must never adopt application state; the opt-in consumption and its fail-loud
// refusal are the two faulted decisions.
const faults=[
 ['native opt-in consumption','env.APP_DB_HYPERDRIVE?.trim() === "1"','env.APP_DB_HYPERDRIVE?.trim() === "2"'],
 ['native opt-in refusal','if (hyperdriveOptIn) {','if (false) {'],
];
const run=env=>spawnSync(process.execPath,[suite],{encoding:'utf8',timeout:60000,env:{...process.env,...env}});
try{
 assert.equal(run({}).status,0,'baseline suite');
 for(const [name,before,after] of faults){
  assert.equal(original.split(before).length,2,'unique dist anchor '+name);
  const candidate=join(dirname(source),'.state-db-fault-'+randomUUID()+'.mjs');
  writeFileSync(candidate,original.replace(before,after),{flag:'wx'});
  try{
   const result=run({FRONTBASE_STATE_DB_TEST_MODULE:pathToFileURL(candidate).href});
   assert.ok(result.status!==0&&result.status!==null,'fault escaped '+name);
   // The suite reports failed checks on stdout (❌) and hard failures on stderr.
   assert.match(result.stdout+result.stderr,/❌|AssertionError|Error:/,'fault must fail behavior, not imports '+name);
   console.log('PASS detected: '+name);
  }finally{unlinkSync(candidate);}
 }
 assert.equal(readFileSync(source,'utf8'),original,'production artifact unchanged');
 console.log('PASS two state-db resolver faults detected; original bytes unchanged');
}catch(e){if(readFileSync(source,'utf8')!==original)writeFileSync(source,original);throw e;}
