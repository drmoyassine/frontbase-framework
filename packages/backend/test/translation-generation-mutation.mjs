import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { repoRoot } from '../../../scripts/mutation-lib.mjs';
import ts from 'typescript';
const faults=[
 ['AI admin role gate','packages/backend/src/compat/routes/translation-generation.ts',"if (!role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(role))",'if (!role)'],
 ['AI account capability','packages/backend/src/compat/translation-generation.ts',"!isTranslationAIProvider(account.provider)","false"],
 ['OpenRouter fixed origin','packages/backend/src/compat/translation-generation.ts',"'https://openrouter.ai/api/v1'","'https://api.openai.com/v1'"],
 ['OpenRouter token cap wire field','packages/edge-infra/src/ai-http.ts','max_tokens: input.maxOutputTokens','max_tokens: 1'],
 ['OpenRouter free pricing','packages/edge-infra/src/ai-http.ts','prompt: 0, completion: 0, request: 0','prompt: 1, completion: 1, request: 1'],
 ['OpenRouter data policy','packages/edge-infra/src/ai-http.ts',"data_collection: 'deny'","data_collection: 'allow'"],
 ['OpenRouter fallback policy','packages/edge-infra/src/ai-http.ts','allow_fallbacks: false','allow_fallbacks: true'],
 ['OpenRouter required parameters','packages/edge-infra/src/ai-http.ts','require_parameters: true','require_parameters: false'],
 ['OpenRouter free variant detection','packages/edge-infra/src/ai-http.ts',"input.model.endsWith(':free')",'false'],
 ['Model discovery origin','packages/backend/src/compat/translation-models.ts',"'https://openrouter.ai/api/v1/models?output_modalities=text'","'https://api.openai.com/v1/models'"],
 ['Model discovery declared bound','packages/backend/src/compat/translation-models.ts',"Number(response.headers.get('content-length')) > 8 * 1024 * 1024",'false'],
 ['Model discovery streaming bound','packages/backend/src/compat/translation-models.ts','size > 8 * 1024 * 1024','false'],
 ['Model discovery text output','packages/backend/src/compat/translation-models.ts',"!row.architecture.output_modalities.includes('text')",'false'],
 ['AI account ownership','packages/backend/src/compat/translation-generation.ts','const store = host.accountsFor(tenant)',"const store = host.accountsFor('alpha')"],
 ['AI atomic settings CAS','packages/backend/src/compat/translation-generation.ts','AND key = ? AND value = ?','AND key = ? AND ? IS NOT NULL'],
 ['AI target-language authorization','packages/backend/src/compat/translation-generation.ts','!config.targetLocales.includes(targetLocale)','false'],
 ['AI placeholder preservation','packages/backend/src/compat/translation-generation.ts','if (validatePlainRevision(source.unit, result.text))','if (false)'],
 ['AI completion rejection','packages/edge-infra/src/ai-http.ts',"choice?.finish_reason !== 'stop'",'false'],
 ['AI output token cap','packages/edge-infra/src/ai-http.ts','!bounded(input.maxOutputTokens, 16384)','false'],
];
const originals=new Map(faults.map(([,file])=>[file,readFileSync(repoRoot+file,'utf8')]));
const artifact=file=>repoRoot+file.replace('/src/','/dist/').replace(/\.ts$/,'.js');
const originalArtifacts=new Map([...originals.keys()].map(file=>[file,readFileSync(artifact(file))]));
// Compile only the changed source module against the already-built baseline. Full workspace
// typecheck/build remain separate required gates, not claimed for each isolated mutation.
function compile(file,source){const output=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}});assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0,'fault module compiles');writeFileSync(artifact(file),output.outputText);}

const hash=value=>createHash('sha256').update(value).digest('hex');
function gate(){
 let stdout='',stderr='';
 for(const file of ['packages/edge-infra/test/ai-http.mjs','packages/backend/test/translation-generation.mjs','packages/backend/test/translation-models.mjs']){
  const r=spawnSync(process.execPath,[repoRoot+file],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);stdout+=r.stdout;stderr+=r.stderr;if(r.status!==0)return {...r,stdout,stderr};
 }
 return {status:0,stdout,stderr};
}
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
console.log('translation AI mutation19/19; all source/artifact hashes restored');
