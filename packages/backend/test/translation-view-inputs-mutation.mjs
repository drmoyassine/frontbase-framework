import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {repoRoot} from '../../../scripts/mutation-lib.mjs';
import ts from 'typescript';
const inputs='packages/backend/src/compat/translation-inputs.ts',http='packages/backend/src/compat/saved-view-http.ts',batch='packages/backend/src/compat/translation-batches.ts';
const faults=[
 ['owned view metadata',inputs,'WHERE tenant_slug = ? AND datasource_id = ? AND id > ?','WHERE ? IS NOT NULL AND datasource_id = ? AND id > ?'],
 ['owned view definition',inputs,'store = host.syncFor(tenant)',"store = host.syncFor('alpha')"],
 ['membership predicate dispatch',inputs,'if (view.predicate) query = query.or(view.predicate);','void 0;'],
 ['membership refusal',inputs,'member.data.length !== 1','member.data.length > 1'],
 ['membership projection consistency',inputs,'if (checked[selection.keyColumn] !== key || checked[selection.field] !== text) throw new TranslationInputChanged();','void 0;'],
 ['view checkpoint',inputs,'...(view ? { view: view.checkpoint } : {})','...{}'],
 ['visible selected fields',inputs,"if (!view.visible_columns?.includes(selection.keyColumn) || !view.visible_columns.includes(selection.field)) throw Error();",'void 0;'],
 ['legacy SQL refusal',inputs,"if (view.target_table.startsWith('fb_live_') &&",'if (false &&'],
 ['post-read definition guard',inputs,'if (await translationInputHash(await store.getView(selection.viewId)) !== await translationInputHash(view)) throw Error();','void 0;'],
 ['AND/OR preservation',http,"rule.logic + '(' + rule.conditions.map(compile).join(',') + ')'","'and(' + rule.conditions.map(compile).join(',') + ')'"],
 ['quoted literal escaping',http,"value.replace(/\\\\/g, '\\\\\\\\').replace(/\"/g, '\\\\\"')",'value'],
 ['unsupported pattern refusal',http,"|| text.includes('*')",'|| false'],
 ['transport uncertainty',inputs,'if (member.error || !Array.isArray(member.data)) throw Error();','if (member.error || !Array.isArray(member.data)) throw new TranslationInputChanged();'],
 ['narrow deterministic invalidation',batch,'error instanceof TranslationInputChanged','true'],
];
const originals=new Map(faults.map(([,file])=>[file,readFileSync(repoRoot+file)]));
const artifact=file=>repoRoot+file.replace('/src/','/dist/').replace(/\.ts$/,'.js');
const artifacts=new Map([...originals.keys()].map(file=>[file,readFileSync(artifact(file))]));
const digest=value=>createHash('sha256').update(value).digest('hex');
function run(){const r=spawnSync(process.execPath,[repoRoot+'packages/backend/test/translation-view-inputs.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
function green(){const r=run();assert.equal(r.status,0,r.stdout+r.stderr);}
green();
try{
 for(const [name,file,before,after] of faults){const raw=originals.get(file),normal=raw.toString().replaceAll('\r\n','\n');assert.equal(normal.split(before).length,2,name+' anchor');
  try{const changed=normal.replace(before,after);writeFileSync(repoRoot+file,changed);const output=ts.transpileModule(changed,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}});assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0);writeFileSync(artifact(file),output.outputText);
   const r=run();assert.equal(r.status,1,name+' must fail');assert.match(r.stderr,/AssertionError/,name+' must fail behaviorally');assert.doesNotMatch(r.stderr,/SQLITE_ERROR|SQLITE_RANGE|wrong number of|bind.*parameter/i);
  }finally{writeFileSync(repoRoot+file,raw);writeFileSync(artifact(file),artifacts.get(file));}
  green();console.log('RED / restored GREEN: '+name);
 }
}finally{for(const [file,raw] of originals){writeFileSync(repoRoot+file,raw);writeFileSync(artifact(file),artifacts.get(file));}green();for(const [file,raw] of originals){assert.equal(digest(readFileSync(repoRoot+file)),digest(raw));assert.equal(digest(readFileSync(artifact(file))),digest(artifacts.get(file)));}}
console.log('translation saved-view mutation14/14; exact source/artifact hashes restored');
