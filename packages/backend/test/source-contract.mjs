import assert from 'node:assert/strict';
import {emptyDirectoryConfiguration,sourceBindings,directorySource,publicationSource,sourceBindingsMatch,encodeSourceConfiguration,readSourceConfiguration} from '@frontbase/edge-core/directory/configuration';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {SiteConfigurationStore} from '../dist/compat/site-configuration-store.js';
const c=emptyDirectoryConfiguration();c.datasourceId='owned';c.site.name='Arabic العربية';c.collections.program.table='programs';c.collections.program.fields.title='name';c.collections.program.scope={field:'site_id',value:0};
const frozen=JSON.stringify(c),encoded=encodeSourceConfiguration(c,3);
assert.equal(encoded.schemaVersion,2);assert.ok(!('configuration' in encoded));assert.ok(!('collections' in encoded));assert.equal(encoded.sourceBindings.bindings.program.filter.value,0);
assert.deepEqual(readSourceConfiguration(encoded),{schemaVersion:1,revision:3,configuration:c});assert.equal(JSON.stringify(c),frozen);assert.equal(directorySource(c,'program').fieldMapping.title,'name');
const pinned={configuration:c,sourceBindings:sourceBindings(c)};assert.equal(publicationSource(pinned,'program').tableName,'programs');assert.equal(sourceBindingsMatch(c,pinned.sourceBindings),true);
const changed=structuredClone(c);changed.collections.program.table='different';assert.equal(sourceBindingsMatch(changed,pinned.sourceBindings),false);assert.equal(publicationSource({...pinned,configuration:changed},'program').tableName,'programs');
for(const mutate of [x=>x.sourceBindings.bindings.program.filter.value=null,x=>x.sourceBindings.bindings.program.tableName='programs;DROP',x=>x.sourceBindings.secret='PRIVATE',x=>delete x.sourceBindings.bindings.city]){const bad=structuredClone(encoded);mutate(bad);assert.throws(()=>readSourceConfiguration(bad));}
const db=sqliteRunner(':memory:');await migrateUp(db);const raw=JSON.stringify({schemaVersion:1,revision:3,configuration:c});
await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',['owner','site_configuration:v1',raw,'2026-11-02T00:00:00Z']);
const store=new SiteConfigurationStore(db,'owner');assert.deepEqual(await store.get(),{schemaVersion:1,revision:3,configuration:c});assert.equal((await db.query('SELECT value FROM settings WHERE tenant_slug=?',['owner']))[0].value,raw,'legacy read must not rewrite bytes');
const next=await store.save(c,3,'later');assert.equal(next.revision,4);const persisted=JSON.parse((await db.query('SELECT value FROM settings WHERE tenant_slug=?',['owner']))[0].value);assert.equal(persisted.schemaVersion,2);assert.equal(persisted.sourceBindings.bindings.program.filter.value,0);assert.ok(!persisted.configuration);assert.deepEqual(await store.get(),next);assert.equal(await store.save(c,3,'stale'),null);assert.equal(await new SiteConfigurationStore(db,'foreign').get(),null);
// Production runtime code must never reintroduce direct legacy collection-map reads.
const {readFileSync,readdirSync}=await import('node:fs');const {fileURLToPath}=await import('node:url');
const roots=['../src/compat/','../../compiler/src/','../../edge-core/src/directory/'];
function scan(path){for(const entry of readdirSync(path,{withFileTypes:true})){const name=path+'/'+entry.name;if(entry.isDirectory())scan(name);else if(entry.name.endsWith('.ts')&&entry.name!=='source-contract.ts')assert.ok(!/\.collections(?:\[|\.)/.test(readFileSync(name,'utf8')),'Legacy map read outside adapter: '+name);}}
for(const root of roots)scan(fileURLToPath(new URL(root,import.meta.url)));
console.log('source contract: PASS (lossless v1/v2, zero scope, canonical writes, pinned lineage, strict rejection, tenant/CAS and no legacy runtime reads)');

// Real source writes from both immutable capture formats keep the captured destination,
// even when the current authoring source has subsequently changed.
const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join,dirname,basename}=await import('node:path');const {pathToFileURL}=await import('node:url');
const {SitePublicationManifestStore}=await import('../dist/compat/site-publication-manifest.js');const {SitePublicationStore}=await import('../dist/compat/site-publication-store.js');const {SitePublicationReviewStore}=await import('../dist/compat/site-publication-review-store.js');const {publicationHash}=await import('../dist/compat/publication-hash.js');const {stableStringify}=await import('@frontbase/compiler');const {prepareFrontendRecordEdit}=await import('../dist/compat/frontend-records.js');
const dir=await mkdtemp(join(tmpdir(),'source-contract-')),url=pathToFileURL(join(dir,'content.db')).href,content=sqliteRunner(url);
try{
 await content.exec('CREATE TABLE programs(id INTEGER PRIMARY KEY,name TEXT)');await content.exec("INSERT INTO programs VALUES(1,'Program')");
 const configuration=emptyDirectoryConfiguration();configuration.datasourceId='owned';configuration.site={name:'Site',origin:'https://site.test',locale:'en'};
 for(const role of ['city','institution','program']){const m=configuration.collections[role];m.table=role==='city'?'cities':role==='institution'?'institutions':'programs';m.scope={field:'site_id',value:0};Object.assign(m.fields,{id:'id',title:role==='program'?'name':'title'});if(role!=='city')m.fields.originalPath='path';}
 configuration.collections.institution.fields.cityId='city_id';configuration.collections.program.fields.institutionId='institution_id';
 const node=queryId=>({id:queryId,type:queryId.endsWith('.list')?'Repeater':'Container',props:{directoryQuery:{version:1,queryId,params:queryId.endsWith('.list')?{}:{path:'/sample/'}}}});
 const templates=['directory','institution','program'].map((role,i)=>({pageId:'00000000-0000-4000-8000-00000000000'+i,role,title:role,description:'',layout:{root:{siteConfiguration:{version:1,role}},content:role==='directory'?[node('directory.institution.list'),node('directory.program.list')]:[node('directory.'+role+'.detail')]}}));
 const records={cities:[{id:3,title:'City'}],institutions:[{id:2,title:'Institution',cityId:3,originalPath:'/institution/',summary:'',cover:null,coverAlt:'',logo:null}],programs:[{id:1,title:'Program',institutionId:2,originalPath:'/program/',summary:'',cover:null,coverAlt:'',logo:null}],articles:[]};
 const manifests=new SitePublicationManifestStore(db,'owner'),newHash=await manifests.prepare({configurationRevision:4,configuration,templates},records,'2026-11-02T00:00:00Z'),modern=await manifests.get(newHash),old=structuredClone(modern);delete old.sourceBindings;const oldHash=await publicationHash(old);await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',['owner','site_publication:manifest:v2:'+oldHash,stableStringify(old),'2026-11-02T00:00:00Z']);
 const host={syncFor:owner=>({getDatasource:async id=>owner==='owner'&&id==='owned'?{id,kind:'sqlite',config:{url}}:null}),accountConfigFor:async()=>null,externalFetch:async()=>{throw Error('unexpected network');}};
 const field={blockId:'card',path:['props','text'],text:'Program',fieldKey:'title',record:{connectionId:'frontbase:publication',collection:'programs',key:[{column:'id',value:1}]}};
 const identities=[];const review=new SitePublicationReviewStore(db,'owner');
 const changedCurrent=structuredClone(c);changedCurrent.collections.program.table='unrelated_current_source';assert.ok(await store.save(changedCurrent,4,'later'));
 for(const hash of [newHash,oldHash]){
  await review.approve({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Source compatibility fixture'},'admin','2026-11-02T00:00:00Z');const active=await new SitePublicationStore(db,'owner').activeVersion();await review.activate(hash,active?.pointer??null,'2026-11-02T00:00:00Z');
  const prepared=await prepareFrontendRecordEdit(host,db,'owner',field,'Edited program');identities.push(prepared.identity);await prepared.commit();assert.equal((await content.query('SELECT name FROM programs WHERE id=1'))[0].name,'Edited program');await content.exec("UPDATE programs SET name='Program' WHERE id=1");
 }
 assert.deepEqual(identities[0],identities[1]);assert.equal((await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['owner','site_publication:manifest:v2:'+oldHash]))[0].value,stableStringify(old));
 console.log('captured source writes: PASS (old/new capture, identical write identity, changed authoring target ignored, old bytes preserved)');
}finally{await content.close?.();await db.close?.();assert.equal(dirname(dir),tmpdir());assert.ok(basename(dir).startsWith('source-contract-'));await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
