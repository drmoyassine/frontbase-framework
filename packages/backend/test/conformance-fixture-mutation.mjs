/** Prove the real strict gate still fails if the repaired success fixtures regress. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const source=new URL('./compat-conformance.mjs',import.meta.url),original=readFileSync(source,'utf8');
const faults=[
 ['unique service URL','cache_url: `https://probe.example/${nextFixture(\'cache-url\')}`',"cache_url: 'https://probe.example'"],
 ['owned provider binding',"query.set('provider_id', params.storage_provider_id)","query.set('provider_id', 'missing-fixture-provider')"],
 ['valid local connection',"body = { type: 'sqlite', url: temporaryDatabaseUrl() };","body = { type: 'invalid-fixture-kind' };"],
 ['searchable nonempty query',"query.set('q', 'R2 searchable fixture')","query.set('q', '')"],
];
function gate() {
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('./compat-conformance.mjs',import.meta.url)) ,'--gate'],{encoding:'utf8',timeout:90000,windowsHide:true});
 assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.notEqual(r.status,null);
 return r;
}
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(gate().status,0,'current strict baseline GREEN');
try {
 for(const [name,before,after] of faults) {
  assert.equal(original.split(before).length,2,name+' unique mutation anchor');
  try {
   writeFileSync(source,original.replace(before,after));const result=gate();
   assert.equal(result.status,1,name+' must fail the strict gate');
   assert.match(result.stdout,/UNREACHABLE\s+[1-9]/,name+' exposes the intended unreachable operation');
  } finally {writeFileSync(source,original);}
  assert.equal(gate().status,0,name+' independently restored GREEN');console.log('RED / restored GREEN: '+name);
 }
} finally {writeFileSync(source,original);assert.equal(gate().status,0,'final strict baseline GREEN');}
assert.equal(hash(readFileSync(source)),hash(original));console.log('conformance fixture mutation4/4 passed; original source hash restored');
