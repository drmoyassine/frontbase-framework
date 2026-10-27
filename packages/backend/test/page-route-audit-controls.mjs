// Route source faults in memory, with actual built audit and original baselines.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import ts from 'typescript';
const sourceUrl=new URL('../src/compat/routes/page-route-audit.ts',import.meta.url);
const original=await readFile(sourceUrl,'utf8');let serial=0;
async function load(source) {
    let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    js=js.replace('../route-namespace-audit.js',new URL('../dist/compat/route-namespace-audit.js',import.meta.url).href);
    js=js.replace('../capture-route-inventory.js',new URL('../dist/compat/capture-route-inventory.js',import.meta.url).href);
    return import('data:text/javascript;base64,'+Buffer.from(js+`\n// ${serial++}`).toString('base64'));
}
async function evidence(api) {
    let role='owner',reads=[];const app=new Hono();app.use('*',async(c,next)=>{c.set('tenant','alpha');c.set('principal',{user:{id:'test',role},tenant:'alpha'});return next();});
    api.registerPageRouteAudit(app,{query:async(sql,params)=>{reads.push(params);return [];},exec:async()=>{throw new Error('No writes');}});
    let r=await app.request('/api/project/page-route-audit/');assert.equal(r.status,200);
    assert.equal(r.headers.get('cache-control'),'no-store','[detector:cache]');
    assert.ok(reads.length>0&&reads.every(params=>params[0]==='alpha'),'[detector:owner]');
    role='editor';reads=[];r=await app.request('/api/project/page-route-audit/');assert.equal(r.status,403,'[detector:role]');assert.equal(reads.length,0,'[detector:role]');
    role='owner';r=await app.request('/api/project/page-route-audit/?tenant=beta');assert.equal(r.status,422,'[detector:input]');
}
for(const [name,from,to] of [
    ['role', "if (!['owner'", "if (false && !['owner'"],
    ['owner', "auditRouteNamespace(runner, c.get('tenant'),", "auditRouteNamespace(runner, 'beta',"],
    ['input', 'if (new URL(c.req.url).search ||', 'if (false ||'],
    ['cache', "c.header('Cache-Control', 'no-store')", "c.header('Cache-Control', 'public, max-age=3600')"],
]) {
    assert.equal(original.split(from).length-1,1);await evidence(await load(original));
    await assert.rejects(async()=>evidence(await load(original.replace(from,to))),error=>error.message.includes(`[detector:${name}]`));
    await evidence(await load(original));console.log(`detected - ${name}; original route baseline restored in memory`);
}
assert.equal(await readFile(sourceUrl,'utf8'),original);console.log('4/4 independent page-route-audit route faults detected; repository bytes unchanged.');
