import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration, editorialSaveRequestSchema } from '@frontbase/edge-core/directory/configuration';
import { editorialAdapter } from '../dist/compat/editorial-adapter.js';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { SiteConfigurationStore } from '../dist/compat/site-configuration-store.js';

const id='00000000-0000-4000-8000-000000000001', body=[{kind:'paragraph',runs:[{text:'Literal <script> {{ body }}'}]}];
const content={title:'Changed title',excerpt:'',body,language:'en',byline:'Public author',coverUrl:null,coverAlt:'',reviewState:'draft',reviewNote:''};
const config=emptyDirectoryConfiguration();config.site.origin='https://usa.test';config.datasourceId='owned';
const m=config.collections.article;m.table='editorial_documents';m.scope={field:'country_id',value:22};Object.assign(m.fields,{id:'id',title:'title',originalPath:'original_path',summary:'excerpt',body:'body_blocks',contentRole:'collection_role',sourceOrigin:'source_origin',byline:'public_byline',publishedAt:'published_gmt'});
const row={id,revision:1,original_path:'/blog/original/',title:'Original',excerpt:'',body_blocks:body,language:null,public_byline:'Public author',published_gmt:null,review_state:'draft',review_note:'',private_evidence:'PRIVATE_EVIDENCE'};
let calls=[];
const adapter=editorialAdapter(config,{query:async(sql,params)=>{calls.push({sql,params});return [row];},exec:async(sql,params)=>{calls.push({sql,params});return 1;}});
assert.equal((await adapter.read(id)).originalPath,'/blog/original/');assert.ok(!JSON.stringify(await adapter.read(id)).includes('PRIVATE_EVIDENCE'));
assert.equal(await adapter.save(id,1,{...content,coverUrl:'https://media.example.test/cover.jpg',coverAlt:'Campus'}),true);
export const statement=calls.at(-1);assert.match(statement.sql,/cover_url = \$14, cover_alt = \$15/);assert.deepEqual(statement.params.slice(13),['https://media.example.test/cover.jpg','Campus']);assert.match(statement.sql,/country_id = \$2 AND source_origin = \$3 AND collection_role = \$4 AND status = \$5/);assert.match(statement.sql,/AND revision = \$6/);assert.match(statement.sql,/AND EXISTS \(SELECT 1 FROM pg_catalog.pg_trigger/);assert.match(statement.sql,/t.tgenabled = 'O'/);assert.deepEqual(statement.params.slice(0,6),[id,22,'https://usa.test','article','draft',1]);assert.ok(!statement.sql.includes('Changed title'));assert.ok(!statement.sql.includes('original_path ='));
assert.equal(await editorialAdapter(config,{query:async()=>[],exec:async()=>0}).save(id,1,content),false);
await assert.rejects(()=>editorialAdapter(config,{query:async()=>[],exec:async()=>2}).save(id,1,content));
assert.throws(()=>editorialAdapter({...config,collections:{...config.collections,article:{...m,table:'articles; DROP TABLE anything'}}},{}));
assert.throws(()=>editorialAdapter({...config,collections:{...config.collections,article:{...m,fields:{...m.fields,body:'unsafe_html'}}}},{}));
const request={id,expectedConfigurationRevision:1,expectedDocumentRevision:1,content};
for(const changed of [{...request,path:'/changed/'},{...request,content:{...content,status:'published'}},{...request,content:{...content,body:[{kind:'html',runs:[{text:'evil'}]}]}},{...request,content:{...content,body:[{kind:'paragraph',runs:[{text:'x',href:'javascript:alert(1)'}]}]}},{...request,content:{...content,reviewState:'requested',language:null}},{...request,content:{...content,reviewState:'requested',reviewNote:''}},{...request,expectedDocumentRevision:0}]) assert.equal(editorialSaveRequestSchema.safeParse(changed).success,false);
assert.equal(editorialSaveRequestSchema.safeParse({...request,content:{...content,reviewState:'requested',reviewNote:'Factual and media review pending'}}).success,true);

const db=sqliteRunner('file:'+join(tmpdir(),`frontbase-editorial-${crypto.randomUUID()}.db`).replaceAll('\\','/'));await migrateUp(db);const now='2026-10-06T12:00:00Z';const cipher=await createSecretCipher('editorial-fixture-secret');
await db.exec('INSERT INTO datasources (id,tenant_slug,name,kind,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',['owned','alpha','Fixture','supabase',await cipher.encrypt(JSON.stringify({url:'https://fixture.supabase.co',serviceKey:'sb_secret_fixture'})),now,now]);
const store=new SiteConfigurationStore(db,'alpha');assert.equal((await store.save(config,0,now))?.revision,1);
let tenant='alpha',role='owner',authenticated=true,writeCount=1,fail=false,rpc=[];
const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(fail)throw new Error('PRIVATE_PROVIDER_ERROR');const input=JSON.parse(options.body);rpc.push({url,input});return new Response(JSON.stringify(String(url).endsWith('/execute_sql')?{rowCount:writeCount}:[{result:[row]}]),{headers:{'content-type':'application/json'}});};
try {
    const app=await createCompatApp({makeRunner:async()=>db,resolvePrincipal:async()=>({user:authenticated?{id:'owner',role}:null,tenant}),sessionSecret:'editorial-fixture-secret',now:()=>now});
    const call=(mode,input=request)=>app.request(`/api/project/site-configuration/editorial/${mode}/`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    const read=await call('read',{id,expectedConfigurationRevision:1});assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(await read.json()).includes('PRIVATE_EVIDENCE'));
    const saved=await call('save');assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{savedRevision:2,publicationAvailable:false});
    assert.match(rpc.at(-1).input.query_sql,/AND revision = 1/);
    writeCount=0;assert.equal((await call('save')).status,409);writeCount=1;
    const count=rpc.length;assert.equal((await call('save',{...request,expectedConfigurationRevision:2})).status,409);assert.equal(rpc.length,count);
    role='viewer';assert.equal((await call('save')).status,403);role='owner';authenticated=false;assert.equal((await call('save')).status,401);authenticated=true;
    tenant='beta';await new SiteConfigurationStore(db,'beta').save(config,0,now);assert.equal((await call('save')).status,403);tenant='alpha';
    assert.equal((await call('save',{...request,content:{...content,originalPath:'/evil/'}})).status,422);
    const oversized=await app.request('/api/project/site-configuration/editorial/save/',{method:'POST',body:' '.repeat(262145)});assert.equal(oversized.status,413);
    fail=true;const error=await call('save');assert.equal(error.status,502);assert.ok(!(await error.text()).includes('PRIVATE_PROVIDER_ERROR'));
} finally {globalThis.fetch=originalFetch;}
console.log('editorial: strict fields/body, immutable identity, fixed scope, CAS, result validation, owner/role/configuration, bounded requests and opaque failures passed');

for(const coverUrl of ['javascript:alert(1)','http://media.test/a.jpg','https://u:p@media.test/a.jpg','https://media.test/a.svg','https://media.test/a.jpg?X-Amz-Signature=x','https://media.test/a.jpg#x','https://media.test/%22a.jpg']) assert.equal(editorialSaveRequestSchema.safeParse({...request,content:{...content,coverUrl}}).success,false);
assert.equal(editorialSaveRequestSchema.safeParse({...request,content:{...content,coverUrl:'https://media.test/a.webp',coverAlt:'Campus'}}).success,true);
const omitted={...content};delete omitted.coverUrl;assert.equal(editorialSaveRequestSchema.safeParse({...request,content:omitted}).success,false);
