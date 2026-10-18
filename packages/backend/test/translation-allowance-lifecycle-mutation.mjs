import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { repoRoot } from '../../../scripts/mutation-lib.mjs';
import ts from 'typescript';
const file='packages/backend/src/compat/translation-allowance.ts';
const faults=[
 ['durable freeze',file,'await lifecycle(runner, tenant, record.policyHash) === null','true'],
 ['job cancellation fence',file,'await session.persistence.cancelJob(session.scope, intent.jobId);','void 0;'],
 ['undispatched proof',file,"if (attempt.state === 'reserved') {\n                    if (job.dispatched || job.uncertainAttempts > 0 || job.status === 'completed') throw Error();","if (attempt.state === 'reserved') {\n                    if (false) throw Error();"],
 ['explicit unknown acknowledgment',file,"choice.unknownDisposition === 'count-as-consumed'",'true'],
 ['original destination identity',file,'JSON.stringify(session.destination) !== JSON.stringify(destination)','false'],
 ['fresh allocation CAS',file,"AND value = ?',\n                [JSON.stringify(record)","AND ? IS NOT NULL',\n                [JSON.stringify(record)"],
 ['closing progress CAS',file,"AND value = ?',\n            [JSON.stringify(next)","AND ? IS NOT NULL',\n            [JSON.stringify(next)"],
 ['archived identity cannot reopen',file,'if (await readValue(runner, tenant, archiveKey(review.allowanceId)) !== null) throw Error();','void 0;'],
];
const originals=new Map(faults.map(([,file])=>[file,readFileSync(repoRoot+file,'utf8')]));
const artifact=file=>repoRoot+file.replace('/src/','/dist/').replace(/\.ts$/,'.js');
const originalArtifacts=new Map([...originals.keys()].map(file=>[file,readFileSync(artifact(file))]));
// Compile only the changed source module against the already-built baseline. Full workspace
// typecheck/build remain separate required gates, not claimed for each isolated mutation.
function compile(file,source){const output=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}});assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0,'fault module compiles');writeFileSync(artifact(file),output.outputText);}

const hash=value=>createHash('sha256').update(value).digest('hex');
function gate(){const r=spawnSync(process.execPath,[repoRoot+'packages/backend/test/translation-allowance-lifecycle.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
function green(label){const r=gate();assert.equal(r.status,0,label+' passes: '+r.stdout+r.stderr);}
green('initial baseline');
try{
    for(const [name,file,before,after] of faults){
        const original=originals.get(file), normalized=original.replaceAll('\r\n','\n');assert.equal(normalized.split(before).length,2,name+' unique anchor');
        try{
            const changed=normalized.replace(before,after);writeFileSync(repoRoot+file,changed);compile(file,changed);const r=gate();assert.equal(r.status,1,name+' must fail');assert.match(r.stderr,/AssertionError/,name+' fails a behavioral assertion');assert.doesNotMatch(r.stderr,/SQLITE_ERROR|SQLITE_RANGE|wrong number of|bind.*parameter/i,name+' is not a fixture SQL failure');
        }finally{writeFileSync(repoRoot+file,original);writeFileSync(artifact(file),originalArtifacts.get(file));}
        green(name+' restored');console.log('RED / restored GREEN: '+name);
    }
}finally{
    for(const [file,original] of originals){writeFileSync(repoRoot+file,original);writeFileSync(artifact(file),originalArtifacts.get(file));}
    green('final baseline');for(const [file,original] of originals){assert.equal(hash(readFileSync(repoRoot+file)),hash(original));assert.equal(hash(readFileSync(artifact(file))),hash(originalArtifacts.get(file)));}
}
console.log('translation allowance lifecycle mutation8/8; all source hashes restored');
