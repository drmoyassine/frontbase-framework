import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { repoRoot } from '../../../scripts/mutation-lib.mjs';
import ts from 'typescript';
const faults=[
 ['immutable allocation','packages/backend/src/compat/translation-allowance.ts',"(await lifecycle(runner, tenant, prior.policyHash))?.phase !== 'closed'",'false'],
 ['configuration/destination pin','packages/backend/src/compat/translation-allowance.ts','JSON.stringify(await currentPin(host, runner, tenant)) === JSON.stringify(record.plan.pin)','true'],
 ['reviewed exact intent','packages/backend/src/compat/translation-allowance.ts','JSON.stringify(translationJobIntentSchema.parse(job.intent)) === JSON.stringify(expected)','true'],
 ['input transmission bound','packages/backend/src/compat/translation-allowance.ts','new TextEncoder().encode(JSON.stringify(translationMessages(source, job.intent.locale))).byteLength <= review.maxMessageBytes','true'],
 ['last pre-call guard','packages/backend/src/compat/translation-allowance.ts','if (!await guard() || new TextEncoder()','if (false || new TextEncoder()'],
 ['original-ledger settlement','packages/backend/src/compat/translation-allowance.ts','settle: (job, usage) => accounting.settle(job, usage)','settle: (job, usage) => Promise.resolve(true)'],
];
const originals=new Map(faults.map(([,file])=>[file,readFileSync(repoRoot+file,'utf8')]));
const artifact=file=>repoRoot+file.replace('/src/','/dist/').replace(/\.ts$/,'.js');
const originalArtifacts=new Map([...originals.keys()].map(file=>[file,readFileSync(artifact(file))]));
// Compile only the changed source module against the already-built baseline. Full workspace
// typecheck/build remain separate required gates, not claimed for each isolated mutation.
function compile(file,source){const output=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}});assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0,'fault module compiles');writeFileSync(artifact(file),output.outputText);}

const hash=value=>createHash('sha256').update(value).digest('hex');
function gate(){const r=spawnSync(process.execPath,[repoRoot+'packages/backend/test/translation-allowance.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
function green(label){const r=gate();assert.equal(r.status,0,label+' passes: '+r.stdout+r.stderr);}
green('initial baseline');
try{
    for(const [name,file,before,after] of faults){
        const original=originals.get(file);assert.equal(original.split(before).length,2,name+' unique anchor');
        try{
            const changed=original.replace(before,after);writeFileSync(repoRoot+file,changed);compile(file,changed);const r=gate();assert.equal(r.status,1,name+' must fail');assert.match(r.stderr,/AssertionError/,name+' fails a behavioral assertion');assert.doesNotMatch(r.stderr,/SQLITE_ERROR|SQLITE_RANGE|wrong number of|bind.*parameter/i,name+' is not a fixture SQL failure');
        }finally{writeFileSync(repoRoot+file,original);writeFileSync(artifact(file),originalArtifacts.get(file));}
        green(name+' restored');console.log('RED / restored GREEN: '+name);
    }
}finally{
    for(const [file,original] of originals){writeFileSync(repoRoot+file,original);writeFileSync(artifact(file),originalArtifacts.get(file));}
    green('final baseline');for(const [file,original] of originals){assert.equal(hash(readFileSync(repoRoot+file)),hash(original));assert.equal(hash(readFileSync(artifact(file))),hash(originalArtifacts.get(file)));}
}
console.log('translation allowance mutation6/6; all source hashes restored');
