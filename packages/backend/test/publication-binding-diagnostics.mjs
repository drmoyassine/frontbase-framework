import assert from 'node:assert/strict';
import {publicationBindingDiagnostics} from '../dist/compat/publication-binding-diagnostics.js';
const binding={componentId:'list',dataSourceId:'owned',tableName:'programs',viewId:'view',pagination:{enabled:true,pageSize:12,page:0},sorting:{enabled:false},filtering:{searchEnabled:false,filters:{}},columnOverrides:{}};
const page={pageId:'page',layout:{content:[{id:'list',type:'Repeater',props:{binding},children:[{id:'title',type:'Text',props:{text:'{{ record.title }}'}}],versions:[{id:'mobile',name:'Mobile',overrides:{children:[{id:'fee',type:'Text',props:{text:'{{ record.deleted_fee }}'}}]}}]}]}};
const reads=[];const reader=async path=>{reads.push(path);return path.includes('/views/')?{datasource_id:'owned',target_table:'programs'}:{fields:[{path:'title'}]};};
let issues=await publicationBindingDiagnostics([page],reader);
assert.equal(issues.length,1);assert.equal(issues[0].elementId,'list');assert.equal(issues[0].versionId,'mobile');assert.equal(issues[0].code,'field_unavailable');assert.match(issues[0].message,/deleted_fee/);assert.equal(reads.length,2);
issues=await publicationBindingDiagnostics([page],async()=>{throw Error('PRIVATE_CREDENTIAL');});assert.ok(issues.every(i=>i.code==='view_unavailable'));assert.ok(!JSON.stringify(issues).includes('PRIVATE_CREDENTIAL'));
issues=await publicationBindingDiagnostics([page],async()=>({datasource_id:'another-tenant',target_table:'programs'}));assert.ok(issues.every(i=>i.code==='view_mismatch'));
const broken=structuredClone(page);broken.layout.content[0].props.binding={dataSourceId:'missing'};issues=await publicationBindingDiagnostics([broken],reader);assert.equal(issues[0].code,'binding_invalid');
const nested=structuredClone(page);nested.layout.content[0].children=[{id:'inner',type:'Repeater',props:{binding:{...binding,componentId:'inner'}},children:[{id:'x',type:'Text',props:{text:'{{ record.other }}'}}]}];nested.layout.content[0].versions=[];issues=await publicationBindingDiagnostics([nested],reader);assert.equal(issues.length,1);assert.equal(issues[0].elementId,'inner');
const related=structuredClone(page);related.layout.content[0].versions=[];related.layout.content[0].children[0].props.text='{{ record.institutions.city.name }}';
issues=await publicationBindingDiagnostics([related],async path=>path.includes('/views/')?{datasource_id:'owned',target_table:'programs'}:{fields:path.includes('relationship=')?[{path:'institutions.city.name'}]:[{path:'title'}]});assert.equal(issues.length,0);
issues=await publicationBindingDiagnostics([related],async path=>{if(path.includes('relationship='))throw Error('SECRET');return path.includes('/views/')?{datasource_id:'owned',target_table:'programs'}:{fields:[{path:'title'}]};});assert.equal(issues[0].code,'relationship_unavailable');assert.ok(!JSON.stringify(issues).includes('SECRET'));
const inherited=structuredClone(page);inherited.layout.content[0].versions=[];
issues=await publicationBindingDiagnostics([inherited],async path=>{if(path.includes('/views/'))return {datasource_id:'owned',target_table:'programs',source_schema:'catalog'};assert.ok(path.includes('schema=catalog'));return {fields:[{path:'title'}]};});assert.equal(issues.length,0);
issues=await publicationBindingDiagnostics([{pageId:'broken',layout:{content:null}}],reader);assert.equal(issues[0].code,'layout_invalid');
console.log('publication element diagnostics: PASS (versions, fields, nesting, ownership, caching, no leak)');

// Exercise the actual authenticated prepare route: unresolved metadata cannot write a capture.
const {sqliteRunner}=await import('@frontbase/edge-infra');
const {migrateUp}=await import('../dist/db/migrations.js');
const {createCompatApp}=await import('../dist/compat/app.js');
const {emptyDirectoryConfiguration}=await import('@frontbase/edge-core/directory/configuration');
const {SiteConfigurationStore}=await import('../dist/compat/site-configuration-store.js');
const {PagesStore}=await import('../dist/compat/pages-store.js');
const db=sqliteRunner(':memory:');await migrateUp(db);const now='2026-11-02T00:00:00Z',configuration=emptyDirectoryConfiguration();
configuration.site={...configuration.site,name:'Test',origin:'https://test.example'};configuration.datasourceId='owned';
for(const role of ['institution','program','city']){const mapping=configuration.collections[role];mapping.table=role;mapping.scope={field:'site_id',value:0};Object.assign(mapping.fields,{id:'id',title:'title'});if(role!=='city')mapping.fields.originalPath='url';}
configuration.collections.institution.fields.cityId='city_id';configuration.collections.program.fields.institutionId='institution_id';
await new SiteConfigurationStore(db,'owner').save(configuration,0,now);
const id='00000000-0000-4000-8000-000000000001';await new PagesStore(db,'owner').create({name:'Template',slug:'template',layout_data:page.layout},id,now);
let role='owner',tenant='owner';const app=await createCompatApp({makeRunner:async()=>db,resolvePrincipal:async()=>({user:{id:'admin',role},tenant}),sessionSecret:'diagnostic-test-secret',now:()=>now});
const input={expectedConfigurationRevision:1,pageIds:[id],institutionPaths:[],programPaths:[],articles:[]};
const request=()=>app.request('/api/project/site-configuration/publication/prepare/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
const before=JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key'));
let response=await request();assert.equal(response.status,422);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.code,'publication_elements_incomplete');assert.equal(body.elementIssues[0].pageId,id);assert.equal(body.elementIssues[0].code,'view_unavailable');assert.equal(JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key')),before);
role='viewer';assert.equal((await request()).status,403);role='owner';tenant='other';assert.equal((await request()).status,409);
console.log('publication element diagnostics API: PASS (private, tenant-bound, no capture writes)');
