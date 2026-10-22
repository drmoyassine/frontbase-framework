import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { repoRoot } from '../../../scripts/mutation-lib.mjs';
import ts from 'typescript';
const faults=[
    ['HTTP export transaction callback','packages/backend/src/compat/backup-restore.ts','if (db.transaction) return db.transaction((tx) => captureStateBackup(tx, now, envSecretPresent, true));','if (false) return db.transaction((tx) => captureStateBackup(tx, now, envSecretPresent, true));'],
    ['HTTP restore transaction callback','packages/backend/src/compat/backup-restore.ts','if (db.transaction) {','if (false) {'],
    ['isolated fresh-target refusal','packages/backend/src/compat/backup-restore.ts','if (existing > 0) throw Error(\'restore_target_not_empty\');','if (existing > 99) throw Error(\'restore_target_not_empty\');'],
    ['foreign-schema version fence','packages/backend/src/compat/backup-restore.ts','backup.migrations.some((version) => !headSet.has(version))','false'],
    ['secret ciphertext accounting','packages/backend/src/compat/backup-restore.ts','drift.length === 0 && encTotal === expected.secretProvenance.encTotal','true'],
];
const originals=new Map(faults.map(([,file])=>[file,readFileSync(repoRoot+file,'utf8')]));
const artifact=file=>repoRoot+file.replace('/src/','/dist/').replace(/\.ts$/,'.js');
const originalArtifacts=new Map([...originals.keys()].map(file=>[file,readFileSync(artifact(file))]));
// Compile only the changed source module against the already-built baseline. Full workspace
// typecheck/build remain separate required gates, not claimed for each isolated mutation.
function compile(file,source){const output=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}});assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0,'fault module compiles');writeFileSync(artifact(file),output.outputText);}

const hash=value=>createHash('sha256').update(value).digest('hex');
function gate(){const r=spawnSync(process.execPath,[repoRoot+'packages/backend/test/backup-restore.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:120000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
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
console.log('backup-restore mutation5/5; all source hashes restored');
