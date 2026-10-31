import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
const file=fileURLToPath(new URL('./cloudflare-setup-metadata.mjs',import.meta.url));
const run=fault=>spawnSync(process.execPath,[file],{env:{...process.env,...(fault?{FRONTBASE_METADATA_FAULT:fault}:{})},encoding:'utf8',timeout:60000,windowsHide:true});
assert.equal(run().status,0,'healthy metadata control must pass');
for(const fault of ['number','stale','context','owner','history','revision','replace','plaintext','activation']){const r=run(fault);assert.notEqual(r.status,0,fault+' survived');assert.match(r.stdout+r.stderr,/AssertionError/,fault+' did not reach a behavioral assertion');console.log('PASS detected metadata '+fault);}
assert.equal(run().status,0,'restored control must pass');console.log('PASS nine metadata ownership/CAS/encryption/recovery faults; original source unchanged');
