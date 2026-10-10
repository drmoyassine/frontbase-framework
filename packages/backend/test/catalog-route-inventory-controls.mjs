import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { collect, query, principal } from './catalog-route-inventory.mjs';
const url=new URL('../src/compat/catalog-route-inventory.ts',import.meta.url),original=await readFile(url,'utf8');let serial=0;
async function load(source) {
    let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    for(const specifier of ['@frontbase/edge-core/directory/configuration','@frontbase/compiler/queries/directory'])js=js.replace(specifier,import.meta.resolve(specifier));
    return import('data:text/javascript;base64,'+Buffer.from(js+`\n// ${serial++}`).toString('base64'));
}
async function evidence(api,kind) {
    assert.equal((await collect(api)).records.length,13);
    const tag=`[catalog-detector:${kind}]`;
    if(kind==='principal')return assert.rejects(()=>collect(api,query,{tenant:'beta',user:principal.user}),/principal_required/,tag);
    if(kind==='scope')return assert.rejects(()=>collect(api,async(sql,p)=>(await query(sql,p)).map(r=>({...r,scopeValue:99}))),/scope_mismatch/,tag);
    if(kind==='overflow')return assert.rejects(()=>collect(api,async()=>Array.from({length:1001},(_,i)=>({id:i+1,scopeValue:22,scopedParent:true,originalPath:'/x/',contentRole:'article',sourceOrigin:'https://site.example'}))),/overflow/,tag);
    if(kind==='identity')return assert.rejects(()=>collect(api,async(sql,p)=>{const r=await query(sql,p);return [...r,r[0]];}),/identity_invalid/,tag);
    if(kind==='relationship')return assert.rejects(()=>collect(api,async(sql,p)=>(await query(sql,p)).map(r=>({...r,scopedParent:'false'}))),/relationship_invalid/,tag);
    const records=(await collect(api)).records;
    if(kind==='orphans')return assert.ok(records.find(r=>r.source==='program'&&r.id==='4').problems.includes('missing_scoped_parent'),tag);
    if(kind==='absolute')return assert.equal(records.find(r=>r.source==='program'&&r.id==='9').path,null,tag);
    if(kind==='serialization')return assert.ok(records.find(r=>r.source==='program'&&r.id==='6').problems.includes('browser_path_changes'),tag);
    throw new Error('unknown control');
}
for(const [kind,from,to] of [
    ['principal', 'principal.tenant !== owner', 'false'],
    ['scope', 'row.scopeValue !== m.scope.value', 'false'],
    ['overflow', 'records.length + rows.length > 1000', 'false'],
    ['identity', 'ids.has(String(row.id))', 'false'],
    ['relationship', '![true, false, 0, 1].includes(row.scopedParent as boolean | number)', 'false'],
    ['orphans', 'if (!row.scopedParent)', 'if (false)'],
    ['absolute', "(String(row.originalPath).startsWith('/') || row.originalPath === c.site.origin + candidate)", 'true'],
    ['serialization', "new URL(path, 'https://inventory.invalid').pathname !== path", 'false'],
]) {
    assert.equal(original.split(from).length-1,1);
    await evidence(await load(original),kind);
    await assert.rejects(async()=>evidence(await load(original.replace(from,to)),kind),e=>e.message.includes(`[catalog-detector:${kind}]`));
    await evidence(await load(original),kind);console.log(`detected catalog ${kind}; baseline restored in memory`);
}
assert.equal(await readFile(url,'utf8'),original);console.log('8/8 independent catalog faults detected; repository source unchanged');
