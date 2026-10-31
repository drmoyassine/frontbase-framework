import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
const file=fileURLToPath(new URL('./test-native-handoff-routing.mjs',import.meta.url));
const run=fault=>spawnSync(process.execPath,[file],{env:{...process.env,...(fault?{FB_NATIVE_HANDOFF_FAULT:fault}:{})},encoding:'utf8',timeout:30000,windowsHide:true});
assert.equal(run().status,0,'healthy rollout control');
for(const fault of ['status','scope','bounded','readonly']){const result=run(fault);assert.notEqual(result.status,0,fault+' survived');assert.match(result.stderr,/AssertionError/,'behavioral fault must fail an assertion');console.log('PASS detected native rollout '+fault);}
assert.equal(run().status,0,'restored rollout control');console.log('PASS four native rollout authorization/bounds/no-replay faults; original source unchanged');
