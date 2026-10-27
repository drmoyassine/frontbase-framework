import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildPackage,repoRoot} from '../../../scripts/mutation-lib.mjs';
const probe='packages/backend/test/compat-conformance.mjs',outcomes='packages/backend/test/behavior-outcomes.mjs',agent='packages/backend/src/compat/routes/agent-compat.ts',storage='packages/backend/src/compat/routes/storage.ts';
const originals=new Map([probe,outcomes,agent,storage].map(path=>[path,readFileSync(repoRoot+path,'utf8')]));
const faults=[
 ['shared operation database',probe,"const baseRunner=sqliteRunner(':memory:');","const baseRunner=(createOperationContext.reusedRunner??=sqliteRunner(':memory:'));"],
 ['counterfactual write attempt',probe,'trace.starveReads = true;',"trace.starveReads = true;await ctx.runner.exec('UPDATE settings SET value=value WHERE tenant_slug=?',['_default']);"],
 ['negative-envelope laundering',outcomes,"if(negativeEnvelope)return 'negative-envelope';","if(negativeEnvelope)return 'positive-control';"],
 ['incidental SQL laundering',outcomes,"return !hasStateObservation&&!providerAttempts?'static-response':'inconclusive';","return !hasStateObservation&&!providerAttempts?'static-response':'verified-read';"],
 ['canned agent defaults',agent,'const general = { ...profileDefaults.general, ...stored.general };','const general = { ...profileDefaults.general };'],
 ['canned empty size',storage,'for (const file of files) size += Number(file.size ?? 0);','for (const file of files) size += 0;'],
];
const output=mkdtempSync(join(tmpdir(),'frontbase-behavior-faults-'));console.log('Behavior fault evidence: '+output);
const run=(script,args=[])=>{const result=spawnSync(process.execPath,[repoRoot+'packages/backend/test/'+script,...args],{cwd:repoRoot,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});assert.equal(result.error,undefined);assert.equal(result.signal,null);return result;};
const gate=name=>{const control=run('behavior-outcomes-controls.mjs');if(control.status!==0)return control;return run('compat-conformance.mjs',['--diagnostic-integrity','--report='+join(output,name+'.json')]);};
assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate('baseline').status,0);
try{for(const[name,path,before,after]of faults){const original=originals.get(path);assert.equal(original.split(before).length,2,'unique fault anchor '+name);try{writeFileSync(repoRoot+path,original.replace(before,after));if(path.includes('/src/'))assert.equal(buildPackage('@frontbase/backend'),true);const fault=gate(name.replaceAll(' ','-'));writeFileSync(join(output,name.replaceAll(' ','-')+'.log'),fault.stdout+fault.stderr);assert.notEqual(fault.status,0,'fault must fail '+name);}finally{writeFileSync(repoRoot+path,original);}if(path.includes('/src/'))assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate('restored-'+name.replaceAll(' ','-')).status,0);console.log('RED / restored GREEN: '+name);}}finally{for(const[path,text]of originals)writeFileSync(repoRoot+path,text);assert.equal(buildPackage('@frontbase/backend'),true);}
for(const[path,text]of originals)assert.equal(readFileSync(repoRoot+path,'utf8'),text);console.log(faults.length+' independent measurement faults detected; sources restored; historical ledger unchanged');
