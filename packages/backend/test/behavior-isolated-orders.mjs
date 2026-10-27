import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=fileURLToPath(new URL('./',import.meta.url)),output=mkdtempSync(join(tmpdir(),'frontbase-behavior-isolated-'));
const ledger=fileURLToPath(new URL('../contracts/behavior.ledger.json',import.meta.url)),original=readFileSync(ledger);
const orders=['forward','reverse','seed:261022','seed:33417'],reports=[];
console.log('Isolated behavior evidence: '+output);
for(const order of orders){const path=join(output,order.replace(':','-')+'.json');const run=spawnSync(process.execPath,[join(here,'compat-conformance.mjs'),'--behavior','--diagnostic-integrity','--order='+order,'--report='+path],{cwd:here,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});writeFileSync(path+'.log',(run.stdout??'')+(run.stderr??''));assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.status,0,'diagnostic run '+order+' failed; '+path+'.log');const report=JSON.parse(readFileSync(path,'utf8'));assert.equal(report.total,334);assert.equal(report.operations.length,334);assert.equal(new Set(report.operations.map(row=>row.operation)).size,334);reports.push(report);console.log('PASS '+order+' 334/334 fresh contexts');}
const stable=report=>report.operations.map(row=>({operation:row.operation,status:row.status,httpStatus:row.httpStatus??null,outcome:row.diagnostic?.outcome??'inconclusive',positiveControl:row.diagnostic?.positiveControl??null,counterfactual:row.diagnostic?.counterfactual??null,providerAttempts:row.diagnostic?.providerAttempts??0,rawFallbackAttempts:row.diagnostic?.rawFallbackAttempts??0,replayViolation:row.diagnostic?.replayViolation??false})).sort((a,b)=>a.operation.localeCompare(b.operation));
const reference=stable(reports[0]);for(const report of reports.slice(1))assert.deepEqual(stable(report),reference,'operation-order invariance '+report.order);
assert.deepEqual(readFileSync(ledger),original,'measurement must not overwrite accepted historical ledger');
const receipt={version:2,total:334,orders,orderInvariant:true,freshContextPerOperation:true,rawFallbacks:0,unsafeCounterfactualEffects:0,legacyLedgerUnchanged:true,legacyLedgerSha256:createHash('sha256').update(original).digest('hex'),diagnosticCounts:reports[0].diagnosticCounts,claims:'Conservative diagnostics; inconclusive is not proof of a missing feature or of functional success.',operations:reference};
writeFileSync(join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log('PASS isolated forward/reverse/two seeded operation orders; historical ledger unchanged');
