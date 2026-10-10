import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { createDirectoryQueries } from '@frontbase/compiler/queries/directory';
import * as api from '../dist/compat/catalog-route-inventory.js';

export const db = sqliteRunner('file:' + join(tmpdir(), `frontbase-catalog-inventory-${crypto.randomUUID()}.db`).replaceAll('\\', '/'));
await db.exec('CREATE TABLE cities (id INTEGER, country INTEGER)');
await db.exec('CREATE TABLE institutions (id INTEGER, country INTEGER, city INTEGER, path TEXT, title TEXT, body TEXT, provider_id TEXT)');
await db.exec('CREATE TABLE programs (id INTEGER, country INTEGER, institution INTEGER, path TEXT, title TEXT, body TEXT, provider_id TEXT)');
await db.exec('CREATE TABLE articles (id INTEGER, country INTEGER, path TEXT, kind TEXT, origin TEXT, body TEXT)');
await db.exec('INSERT INTO cities VALUES (1,22),(2,99)');
for (const [id,country,city,path] of [[1,22,1,'https://site.example/college/'],[2,22,2,'/wrong-city/'],[3,22,999,null],[4,99,1,'/foreign/']])
    await db.exec('INSERT INTO institutions VALUES (?,?,?,?,?,?,?)',[id,country,city,path,'Private title','PRIVATE_BODY','PRIVATE_PROVIDER']);
for (const [id,country,parent,path] of [[1,22,1,'/old-parent/program/'],[2,22,4,'/foreign-parent/'],[3,22,2,'/wrong-city-program/'],[4,22,999,'/orphan/'],[5,22,1,'/caf%C3%A9/'],[6,22,1,'/café/'],[7,22,1,'https://foreign.example/path/'],[8,22,1,'/a/../normalized/'],[9,22,1,'https://site.example/a/../normalized/'],[10,99,1,'/foreign-program/']])
    await db.exec('INSERT INTO programs VALUES (?,?,?,?,?,?,?)',[id,country,parent,path,'Private title','PRIVATE_BODY','PRIVATE_PROVIDER']);
for (const [id,country,kind,origin] of [[1,22,'article','https://site.example'],[2,99,'article','https://site.example'],[3,22,'page','https://site.example'],[4,22,'article','https://foreign.example']])
    await db.exec('INSERT INTO articles VALUES (?,?,?,?,?,?)',[id,country,'/blog/article/',kind,origin,'PRIVATE_BODY']);
export const config=emptyDirectoryConfiguration();config.site={name:'Test',destination:'Test',origin:'https://site.example',locale:'en'};config.datasourceId='owned';
for(const role of ['institution','program','city','article']) {
    const m=config.collections[role];m.table=role==='city'?'cities':role+'s';m.scope={field:'country',value:22};m.fields.id='id';m.fields.title=role==='city'?'id':'title';
    if(role!=='city')m.fields.originalPath='path';
}
config.collections.institution.fields.cityId='city';config.collections.program.fields.institutionId='institution';
Object.assign(config.collections.article.fields,{contentRole:'kind',sourceOrigin:'origin',body:'body',title:'id'});
export const principal={tenant:'alpha',user:{id:'reviewer'}};
export const query=(sql,p)=>db.query(sql,p);
export const collect=(module=api,runner=query,ctx=principal,input=config,dialect='sqlite')=>module.catalogRouteInventory(input,'alpha',ctx,dialect,runner);
const result=await collect();assert.equal(result.records.length,13);assert.equal(result.coverage,'configured-source-catalog');assert.equal(result.stableSnapshotVerified,false);assert.equal(result.publicationAvailable,false);
assert.deepEqual(result.configuredRoles,['institution','program','article']);
const record=(source,id)=>result.records.find(r=>r.source===source&&r.id===String(id));
assert.deepEqual(record('institution',1),{source:'institution',id:'1',path:'/college/',problems:[]});
assert.deepEqual(record('institution',3).problems,['missing_original_path','missing_scoped_parent']);
for(const id of [2,3,4])assert.ok(record('program',id).problems.includes('missing_scoped_parent'));
assert.deepEqual(record('program',5).problems,[]);assert.equal(record('program',5).path,'/caf%C3%A9/');
assert.deepEqual(record('program',6).problems,['browser_path_changes']);assert.equal(record('program',6).path,'/café/');
for(const id of [7,8,9]){assert.equal(record('program',id).path,null);assert.deepEqual(record('program',id).problems,['invalid_original_path']);}
assert.deepEqual(result.records.filter(r=>r.source==='article').map(r=>r.id),['1']);
assert.ok(!JSON.stringify(result).includes('PRIVATE_'));assert.ok(!JSON.stringify(result).includes('Private title'));assert.ok(!JSON.stringify(result).includes('foreign.example'));
// Ordinary preview omits these orphans; inventory must retain them.
const registry=createDirectoryQueries(config,'alpha','sqlite',query);
assert.deepEqual((await registry['directory.institution.list'].execute({},principal)).map(r=>r.id),[1]);
assert.deepEqual(result.records.filter(r=>r.source==='institution').map(r=>r.id),['1','2','3']);
await assert.rejects(()=>collect(api,query,{tenant:'beta',user:{id:'reviewer'}}),/principal_required/);
await assert.rejects(()=>collect(api,query,{tenant:'alpha',user:null}),/principal_required/);
await assert.rejects(()=>collect(api,async(sql,p)=>(await query(sql,p)).map(r=>({...r,scopeValue:99}))),/scope_mismatch/);
await assert.rejects(()=>collect(api,async(sql,p)=>(await query(sql,p)).map(r=>({...r,sourceOrigin:'https://foreign.example'}))),/scope_mismatch/);
await assert.rejects(()=>collect(api,async(sql,p)=>(await query(sql,p)).map(r=>({...r,id:'secret\nID'}))),/identity_invalid/);
await assert.rejects(()=>collect(api,async(sql,p)=>{const r=await query(sql,p);return [...r,r[0]];}),/identity_invalid/);
await assert.rejects(()=>collect(api,async(sql,p)=>Array.from({length:1001},(_,i)=>({id:i+1,scopeValue:22,scopedParent:true,originalPath:'/x/'}))),/overflow/);
let n=0;await assert.rejects(()=>collect(api,async()=>Array.from({length:++n===1?600:401},(_,i)=>({id:i+1,scopeValue:22,scopedParent:true,originalPath:'/x/'}))),/overflow/);
await assert.rejects(()=>collect(api,async(sql,p)=>(await query(sql,p)).map(r=>({...r,scopedParent:'false'}))),/relationship_invalid/);
const unmapped=structuredClone(config);unmapped.collections.article=emptyDirectoryConfiguration().collections.article;
assert.deepEqual((await collect(api,query,principal,unmapped)).configuredRoles,['institution','program']);
let calls=0;const broken=structuredClone(config);broken.collections.institution.table='institutions; DROP TABLE programs';
await assert.rejects(()=>collect(api,async()=>{calls++;return[];},principal,broken));assert.equal(calls,0);
await collect(api,async(sql,p)=>{
    assert.ok(!/SELECT \*|PRIVATE_|"body"|"title"|"provider_id"/.test(sql));
    assert.ok(sql.includes('LIMIT $'));assert.equal(p.at(-1),1001);assert.ok(p.includes(22));assert.ok(!sql.includes('= 22'));
    const placeholders=[...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));assert.deepEqual(placeholders,Array.from({length:p.length},(_,i)=>i+1));return[];
},principal,config,'postgres');
console.log('catalog inventory: SQLite orphan retention, explicit path dispositions, fixed scopes/articles, owner/identity/bounds, no content leakage and PostgreSQL placeholders passed; no live provider proof');
