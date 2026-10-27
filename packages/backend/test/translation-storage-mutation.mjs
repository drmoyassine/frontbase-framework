import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { repoRoot } from '../../../scripts/mutation-lib.mjs';
import ts from 'typescript';
const faults=[
    ['cross-host project isolation','packages/backend/src/compat/translation-storage.ts','projectId: prior?.settings.projectId ?? crypto.randomUUID()',"projectId: 'shared-project'"],
    ['stable project identity','packages/backend/src/compat/translation-storage.ts','projectId: prior?.settings.projectId ?? crypto.randomUUID()','projectId: crypto.randomUUID()'],
    ['shared HTTP client injection','packages/edge-infra/src/providers/supabase-http.ts','fetch: opts.fetchImpl,','// deliberate fault: omitted injected HTTP transport'],
    ['datasource ownership','packages/backend/src/compat/sync-store.ts',
        "'SELECT id, name, kind, config, created_at, updated_at FROM datasources WHERE tenant_slug = ? AND id = ?'",
        "'SELECT id, name, kind, config, created_at, updated_at FROM datasources WHERE ? IS NOT NULL AND id = ?'"],
    ['trusted translation scope','packages/backend/src/compat/translation-storage.ts',
        'scope: localizationScopeSchema.parse({ tenantId: tenant, projectId })',"scope: localizationScopeSchema.parse({ tenantId: 'foreign-tenant', projectId })"],
    ['atomic settings update','packages/backend/src/compat/translation-storage.ts',
        'AND key = ? AND value = ?', 'AND key = ? AND ? IS NOT NULL'],
    ['administrator role gate','packages/backend/src/compat/routes/translation-storage.ts',
        "if (!role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(role))",'if (!role)'],
];
const originals=new Map(faults.map(([,file])=>[file,readFileSync(repoRoot+file,'utf8')]));
const artifact=file=>repoRoot+file.replace('/src/','/dist/').replace(/\.ts$/,'.js');
const originalArtifacts=new Map([...originals.keys()].map(file=>[file,readFileSync(artifact(file))]));
// Compile only the changed source module against the already-built baseline. Full workspace
// typecheck/build remain separate required gates, not claimed for each isolated mutation.
function compile(file,source){const output=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}});assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0,'fault module compiles');writeFileSync(artifact(file),output.outputText);}

const hash=value=>createHash('sha256').update(value).digest('hex');
function gate(){const r=spawnSync(process.execPath,[repoRoot+'packages/backend/test/translation-storage.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
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
console.log('translation storage mutation7/7; all source hashes restored');
