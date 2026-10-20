import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {repoRoot} from '../../../scripts/mutation-lib.mjs';
import ts from 'typescript';
const batch='packages/backend/src/compat/translation-batches.ts',route='packages/backend/src/compat/routes/translation-batches.ts',allowance='packages/backend/src/compat/translation-allowance.ts';
const inputs='packages/backend/src/compat/translation-inputs.ts';
const faults=[
 ['administrator gate',route,"!['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(user.role)",'false'],
 ['explicit execution gate',route,'if (!executionEnabled)','if (false)'],
 ['content transmission consent',route,'approveContentTransmission: z.literal(true)','approveContentTransmission: z.boolean().optional()'],
 ['owned source lookup',batch,'host.pagesFor(tenant).get(selection.pageId)',"host.pagesFor(selection.pageId === 'foreign' ? 'beta' : tenant).get(selection.pageId)"],
 ['bound subtree refusal',batch,'if (!found || blocked) throw Error();','if (!found) throw Error();'],
 ['immutable review seal',batch,'await digest(value.review) !== value.reviewHash','false'],
 ['source pin',batch,'if ((await extract(host, db, tenant, item.selection, batch.review.pin)).pageHash !== item.pageHash) return false;','if (false) return false;'],
 ['post-result draft fence',allowance,'if (!await guard()) {\n                const unitId','if (false) {\n                const unitId'],
 ['last-call batch permit',allowance,'&& (!permit || await permit())',''],
 ['batch progress CAS',batch,"AND value = ?',\n        [JSON.stringify(next)","AND ? IS NOT NULL',\n        [JSON.stringify(next)"],
 ['initial allocation cancellation checkpoint',allowance,"WHERE ? = '' OR EXISTS","WHERE ? != '' OR EXISTS"],
 ['replacement cancellation checkpoint',allowance,"AND (? = '' OR EXISTS","AND (? != '' OR EXISTS"],
 ['changed-source result withheld',batch,"current && job?.status === 'completed'","job?.status === 'completed'"],
 ['owned page discovery',batch,'WHERE tenant_slug = ? AND deleted_at IS NULL AND id > ?','WHERE ? IS NOT NULL AND deleted_at IS NULL AND id > ?'],
 ['owned saved history',batch,'WHERE tenant_slug = ? AND key > ? AND key < ?','WHERE ? IS NOT NULL AND key > ? AND key < ?'],
 ['fresh recovered review',batch,'if (!await stillCurrent(host, db, tenant, b)) throw Error();','void 0;'],
 ['owned menu extraction',inputs,'loaded?.document ?? await new MenusStore(db, tenant).get()',"loaded?.document ?? await new MenusStore(db, 'alpha').get()"],
 ['selected-field projection',inputs,".select(parts.map(part => part.column).join(',') + ',' + selection.field)",".select('*')"],
 ['unique record key',inputs,'if (error || !Array.isArray(data) || data.length !== 1) throw Error();','if (error || !Array.isArray(data) || data.length < 1) throw Error();'],
 ['returned record identity',inputs,'if (String(value) !== String(part.value)) throw Error();','void 0;'],
 ['unique logical input',batch,'if (items.some(item => item.intent.unitId === unitId)) throw Error();','void 0;'],
 ['live connection pin',inputs,'destination: connection.destination','destination: null'],
 ['menu configuration pin',inputs,'translationInputHash({ revision: document.revision, menu })','translationInputHash({ revision: 0, menu: menu.id })'],
 ['dynamic/markup refusal',inputs,'/[{}<>]|@\\{/.test(value)','false'],
 ['owned source catalog',inputs,"WHERE tenant_slug = ? AND kind = 'supabase' AND id > ?","WHERE ? IS NOT NULL AND kind = 'supabase' AND id > ?"],
];
const originals=new Map(faults.map(([,file])=>[file,readFileSync(repoRoot+file,'utf8')]));
const artifact=file=>repoRoot+file.replace('/src/','/dist/').replace(/\.ts$/,'.js');
const artifacts=new Map([...originals.keys()].map(file=>[file,readFileSync(artifact(file))]));
const digest=value=>createHash('sha256').update(value).digest('hex');
function run(){const r=spawnSync(process.execPath,[repoRoot+'packages/backend/test/translation-batches.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
function green(){const r=run();assert.equal(r.status,0,r.stdout+r.stderr);}
green();
try{
 for(const [name,file,before,after] of faults){
  const raw=originals.get(file),normal=raw.replaceAll('\r\n','\n');
  // The host execution gate deliberately appears on both start and continue; the owned-source lookup
  // and bound-subtree refusal fences appear in BOTH page extractors (Default and Block Version).
  assert.equal(normal.split(before).length,['explicit execution gate','menu configuration pin','owned source lookup','bound subtree refusal'].includes(name)?3:2,name+' anchor');
  try{
   const changed=normal.replaceAll(before,after);writeFileSync(repoRoot+file,changed);
   const output=ts.transpileModule(changed,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}});
   assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0);writeFileSync(artifact(file),output.outputText);
   const r=run();assert.equal(r.status,1,name+' must fail');assert.match(r.stderr,/AssertionError/,name+' must fail behaviorally');assert.doesNotMatch(r.stderr,/SQLITE_ERROR|SQLITE_RANGE|wrong number of|bind.*parameter/i);
  }finally{writeFileSync(repoRoot+file,raw);writeFileSync(artifact(file),artifacts.get(file));}
  green();console.log('RED / restored GREEN: '+name);
 }
}finally{
 for(const [file,raw] of originals){writeFileSync(repoRoot+file,raw);writeFileSync(artifact(file),artifacts.get(file));}
 green();for(const [file,raw] of originals){assert.equal(digest(readFileSync(repoRoot+file)),digest(raw));assert.equal(digest(readFileSync(artifact(file))),digest(artifacts.get(file)));}
}
console.log('translation batch mutation25/25; exact source/artifact hashes restored');
