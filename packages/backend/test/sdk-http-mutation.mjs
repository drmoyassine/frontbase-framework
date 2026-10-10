import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildPackage, repoRoot } from '../../../scripts/mutation-lib.mjs';
const faults=[
 ['libsql per-client fetch','packages/edge-infra/src/providers/libsql-http.ts','return { url, authToken, fetch: fetchImpl };','return { url, authToken };','FAIL vector Request POST auth body crosses injected guard'],
 ['PostgREST per-client fetch','packages/edge-infra/src/providers/runners.ts','fetch: opts.fetchImpl,','// deliberate fault: missing fetch injection','FAIL Supabase RPC query and exec preserve keys schema SQL and result'],
 ['D1 per-client fetch','packages/edge-infra/src/providers/runners.ts','const transport = opts.fetchImpl ?? globalThis.fetch;','const transport = globalThis.fetch;','FAIL D1 REST query and exec use injected owner transport'],
 ['datasource destination policy','packages/backend/src/db/datasource-runner.ts','const transport: CompatFetch = (input, init) => guardedExternalFetch(externalFetch, input, init);','const transport: CompatFetch = externalFetch;','FAIL private datasource URL never reaches any transport'],
 ['libsql remote transport policy','packages/edge-infra/src/providers/libsql-http.ts','if (fetchImpl) {','if (false) {','FAIL unsupported remote libsql transports refused before fallback'],
 ['vector route Request preservation','packages/backend/src/compat/routes/edge-generic.ts','(input, init) => guardedExternalFetch(externalFetch, input, init),','(input, init) => guardedExternalFetch(externalFetch, input instanceof Request ? input.url : input, init),','FAIL vector probe route retains SDK Request semantics for all operations'],
];
const originals=new Map(faults.map(([,path])=>[path,readFileSync(repoRoot+path,'utf8')]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function build(){assert.equal(buildPackage('@frontbase/edge-infra'),true,'infra compiles');assert.equal(buildPackage('@frontbase/backend'),true,'backend compiles');}
function gate(){const result=spawnSync(process.execPath,[repoRoot+'packages/backend/test/sdk-http.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.notEqual(result.status,null);return result;}
function green(label){build();const r=gate();assert.equal(r.status,0,label+' GREEN: '+r.stdout+r.stderr);assert.match(r.stdout,/SDK HTTP: 15 passed, 0 failed; raw global calls 0/);}
green('initial');
try {
 for(const [name,path,before,after,expected] of faults){
  const original=originals.get(path);assert.equal(original.split(before).length,2,name+' unique source anchor');
  try {writeFileSync(repoRoot+path,original.replace(before,after));build();const r=gate();assert.equal(r.status,1,name+' functional RED');assert.ok((r.stdout+r.stderr).includes(expected),name+' named regression observed: '+r.stdout+r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/ERR_MODULE_NOT_FOUND|ENOTFOUND|ECONNREFUSED|SyntaxError/,name+' not environment/network failure');}
  finally{writeFileSync(repoRoot+path,original);}
  green(name+' independently restored');assert.equal(hash(readFileSync(repoRoot+path,'utf8')),hash(original));console.log('RED / independently rebuilt restored GREEN: '+name);
 }
} finally {for(const [path,original] of originals)writeFileSync(repoRoot+path,original);green('final independently restored');}
console.log('SDK HTTP mutations: '+faults.length+'/'+faults.length+' detected');
console.log(JSON.stringify(Object.fromEntries([...originals].map(([path,bytes])=>[path,hash(bytes)]))));
