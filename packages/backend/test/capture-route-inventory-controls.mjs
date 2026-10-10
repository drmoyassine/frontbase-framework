import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Hono } from 'hono';
import { db, hash } from './capture-route-inventory.mjs';
const url=new URL('../src/compat/capture-route-inventory.ts',import.meta.url),original=await readFile(url,'utf8');let serial=0;
async function load(source) {
    let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    js=js.replace('@frontbase/edge-core/directory/publication',import.meta.resolve('@frontbase/edge-core/directory/publication'))
        .replace('./site-publication-store.js',new URL('../dist/compat/site-publication-store.js',import.meta.url).href);
    return import('data:text/javascript;base64,'+Buffer.from(js+`\n// ${serial++}`).toString('base64'));
}
async function evidence(api,kind) {
    assert.equal((await api.captureRouteInventory(db,'alpha')).identity.hash,hash);
    const runner={query:async(sql,params)=>{
        const rows=await db.query(sql,params);
        if(kind==='owner')return rows.map(r=>({...r,tenant_slug:'beta'}));
        if(params[1]===`site_publication:v1:${hash}`){
            if(kind==='hash')return rows.map(r=>({...r,value:r.value.replace('Muhlenberg College','Tampered')}));
            if(kind==='size')return rows.map(r=>({...r,value:r.value+' '.repeat(1024*1024)}));
        }
        return rows;
    }};
    await assert.rejects(()=>api.captureRouteInventory(runner,'alpha'),undefined,`[capture-detector:${kind}]`);
}
for(const [kind,from,to] of [
    ['owner', "rows[0]!.tenant_slug !== owner", 'false'],
    ['hash', 'await publicationHash(artifact) !== pointer.hash', 'false'],
    ['size', "(rows[0]!.value as string).length > max\n            || new TextEncoder().encode(rows[0]!.value as string).byteLength > max", 'false'],
]) {
    assert.equal(original.split(from).length-1,1);
    await evidence(await load(original),kind);
    await assert.rejects(async()=>evidence(await load(original.replace(from,to)),kind),e=>e.message.includes(`[capture-detector:${kind}]`));
    await evidence(await load(original),kind);console.log(`detected capture ${kind}; original baseline restored in memory`);
}
assert.equal(await readFile(url,'utf8'),original);console.log('3/3 independent capture faults detected; repository source unchanged');
const routeUrl=new URL('../src/compat/routes/page-route-audit.ts',import.meta.url),routeOriginal=await readFile(routeUrl,'utf8');
async function driftEvidence(source) {
    let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    for(const name of ['route-namespace-audit','capture-route-inventory'])js=js.replace(`../${name}.js`,new URL(`../dist/compat/${name}.js`,import.meta.url).href);
    const api=await import('data:text/javascript;base64,'+Buffer.from(js+`\n// ${serial++}`).toString('base64'));
    let reads=0;const runner={query:async(sql,params)=>{
        const rows=await db.query(sql,params);
        return params?.[1]==='site_publication:active:v1'&&++reads===2?rows.map(r=>({...r,value:JSON.stringify({...JSON.parse(r.value),generation:2})})):rows;
    }};
    const app=new Hono();app.use('*',async(c,next)=>{c.set('tenant','alpha');c.set('principal',{user:{id:'test',role:'owner'},tenant:'alpha'});return next();});api.registerPageRouteAudit(app,runner);
    const response=await app.request('/api/project/page-route-audit/');assert.equal(response.status,503,'[capture-detector:drift]');assert.equal((await response.json()).code,'namespace_changed','[capture-detector:drift]');
}
const predicate='JSON.stringify(capture.identity) !== JSON.stringify(after.identity)';assert.equal(routeOriginal.split(predicate).length-1,1);
await driftEvidence(routeOriginal);await assert.rejects(()=>driftEvidence(routeOriginal.replace(predicate,'false')),e=>e.message.includes('[capture-detector:drift]'));await driftEvidence(routeOriginal);
assert.equal(await readFile(routeUrl,'utf8'),routeOriginal);console.log('1/1 independent capture-pointer drift fault detected; repository source unchanged');
