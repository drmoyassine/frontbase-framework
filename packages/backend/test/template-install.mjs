import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {createCompatApp} from '../dist/compat/app.js';
import {PagesStore} from '../dist/compat/pages-store.js';
const {TemplateInstallStore}=await import(process.env.FRONTBASE_INSTALL_MODULE??'../dist/compat/template-install-store.js');
import {emptyDirectoryConfiguration,directoryLayoutQueries} from '@frontbase/edge-core/directory/configuration';
import {validateDirectoryLayout} from '../dist/compat/directory-configuration.js';
import {renderPage} from '@frontbase/edge-core';
import {applyBlockVersion, selectBlockVersion} from '@frontbase/edge-core/block-versions';
import {publicationBindingDiagnostics} from '../dist/compat/publication-binding-diagnostics.js';
import {resolveAppMenuLayout} from '../dist/compat/menus-runtime.js';
import {MenusStore} from '../dist/compat/menus-store.js';
import {projectSharedDirectoryPreview,projectDirectoryRecords,projectTemplatePresentation} from '@frontbase/edge-core/directory/configuration';
import {pagesWorkspace} from '../dist/compat/pages-workspace.js';
import {upgradeBookingCourseCards,upgradeBookingDetail} from '@frontbase/edge-core/directory/starter';
const db=sqliteRunner(':memory:');await migrateUp(db);const now='2026-11-01T12:00:00Z';
let tenant='alpha',role='owner',authenticated=true;
const app=await createCompatApp({makeRunner:async()=>db,resolvePrincipal:async()=>({user:authenticated?{id:'owner',role}:null,tenant}),sessionSecret:'template-installer-test'});
const input={templateId:'booking-for-x',configuration:emptyDirectoryConfiguration()};
const call=(mode,body,headers={'content-type':'application/json'})=>app.request('/api/project/templates/'+mode+'/',{method:mode==='status'||mode==='catalog'?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
const seed=new PagesStore(db,'alpha');await seed.ensureHomepage(now);const initial=JSON.stringify(await db.query('SELECT * FROM compat_pages'));
let response=await call('review',input);assert.equal(response.status,200,await response.clone().text());const review=await response.json();assert.equal(review.pages.length,6);assert.equal(review.replacesWelcome,true);assert.equal(JSON.stringify(await db.query('SELECT * FROM compat_pages')),initial,'Review creates nothing');assert.equal((await db.query("SELECT * FROM settings WHERE key LIKE 'template_install:%'")).length,0);
role='viewer';assert.equal((await call('install',{...input,reviewHash:review.reviewHash,operationId:crypto.randomUUID()})).status,403);assert.equal((await call('status')).status,403);role='owner';authenticated=false;assert.equal((await call('catalog')).status,401);authenticated=true;
assert.equal((await call('review',{...input,owner:'beta'})).status,422);assert.equal((await call('review',input,{})).status,415);assert.equal((await call('review',{...input,configuration:{...input.configuration,datasourceId:'foreign'}})).status,409);
const operationId=crypto.randomUUID();response=await call('install',{...input,reviewHash:review.reviewHash,operationId});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).installation.status,'installed');
let pages=await seed.list();assert.equal(pages.length,6);assert.equal(pages.filter(p=>p.is_homepage).length,1);assert(pages.every(p=>p.is_published===0));assert((await db.query('SELECT last_write_operation FROM compat_pages WHERE tenant_slug=?',['alpha'])).every(p=>p.last_write_operation===operationId));
for(const page of pages){const layout=JSON.parse(page.layout_data);assert(layout.content.length);assert.equal(await validateDirectoryLayout(layout,'alpha',db),null);directoryLayoutQueries(layout);assert(!JSON.stringify(layout).includes('PRIVATE_'));}
assert.equal((await new MenusStore(db,'alpha').get()).menus.length,2,'normal Header/Footer menu drafts');
const explore=JSON.parse(pages.find(p=>p.name==='Explore').layout_data);
assert.deepEqual(directoryLayoutQueries(explore),[],'Explore uses standard Repeater bindings');
const repeaters=explore.content.filter(node=>node.type==='Repeater');
assert.equal(repeaters.length,1);
const [repeater]=repeaters;
assert.equal(selectBlockVersion(repeater,()=>undefined),'default');
assert.equal(selectBlockVersion(repeater,(scope,key)=>scope==='url'&&key==='type'?'program':undefined),'programs');
for(const versionId of ['default','programs']){
 const selected=applyBlockVersion(repeater,versionId);
 assert.equal(selected.props.binding.componentId,repeater.id);
 assert.equal(selected.props.binding.dataSourceId,'','fresh installation does not select a datasource');
 assert.equal(selected.props.controls.search,true);
}
assert.ok(Object.hasOwn(repeater.versions[0].overrides.props,'binding'),'Programs owns an independent binding');
const [course] = applyBlockVersion(repeater,'programs').children;
assert.equal(course.props._layerName,'Course card');
assert.equal(course.children.find(node=>node.type==='Link').props.href,'{{ record.originalPath }}');
const [,identity] = course.children.find(node=>node.props._layerName==='Institution and location').children;
assert.deepEqual(identity.children.at(-1).children.map(node=>node.props.text),['{{ record.location }}','{{ record.country }}']);
assert.equal(course.children.at(-1).children.at(-1).props.splitValues,true);
const programsVersion = applyBlockVersion(repeater,'programs');
const programsWithRows = {...programsVersion,versions:undefined,props:{...programsVersion.props,initialRows:[
 {id:'record-one',title:'Media course',originalPath:'/sample-program/',location:'Fixture City',country:'Fixture Country',intakes:['May','August']},
]}};
const programsHtml = await renderPage({root:{},content:[programsWithRows]},
 {user:{},page:{title:'Explore'},app:{},visitor:{},url:{},system:{},cookies:{},local:{},session:{}});
assert.match(programsHtml,/href="\/sample-program\/"[^>]*>Media course/);
assert.match(programsHtml,/>Fixture City<.*>Fixture Country</s);
assert.match(programsHtml,/>May<.*>August</s);
const olderExplore=structuredClone(explore);
const olderRepeater=olderExplore.content.find(node=>node.type==='Repeater');
olderRepeater.versions[0].overrides.children[0].children=['Image','Heading','Paragraph','Link']
 .map(type=>({id:'old-'+type,type,props:{}}));
const upgradedExplore=upgradeBookingCourseCards(olderExplore);
const upgradedRepeater=upgradedExplore.content.find(node=>node.type==='Repeater');
assert.deepEqual(upgradedRepeater.children,olderRepeater.children);
assert.deepEqual(upgradedRepeater.versions[0].overrides.props,olderRepeater.versions[0].overrides.props);
assert.equal(upgradedRepeater.versions[0].overrides.children[0].props._layerName,'Course card');
assert.equal(upgradeBookingCourseCards(upgradedExplore),undefined);
const issues=await publicationBindingDiagnostics([{pageId:'explore',layout:explore}],async()=>{throw Error('unbound drafts need no datasource requests');});
assert.deepEqual(issues.map(issue=>[issue.elementId,issue.versionId,issue.code]),[[repeater.id,'default','binding_invalid'],[repeater.id,'programs','binding_invalid']]);
const paletteEndpoint='/api/project/booking-palette/';
const palette={preset:'navy',colors:{primary:'#254136',text:'#18202a',surface:'#eef4fa'}};
const savePalette=value=>app.request(paletteEndpoint,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({palette:value})});
assert.equal((await (await app.request(paletteEndpoint)).json()).palette,null);
assert.equal((await savePalette({preset:'navy',colors:{primary:'#ffffff'}})).status,400);
role='viewer';assert.equal((await savePalette(palette)).status,403);role='owner';
assert.equal((await savePalette(palette)).status,200);
tenant='beta';assert.equal((await (await app.request(paletteEndpoint)).json()).palette,null);tenant='alpha';
for(const locale of ['en','ar'])for(const page of pages){const authored=JSON.parse(page.layout_data),config=emptyDirectoryConfiguration();config.site={name:locale==='ar'?'دليل الدراسة':'Study directory',origin:'https://fixture.test',locale};
 authored.content[0].styles={...authored.content[0].styles,color:'#235578'};
 const rows=new Map(directoryLayoutQueries(authored).map(q=>[q.id,[{id:'record-one',title:locale==='ar'?'برنامج دراسي':'Sample program',summary:'Editable record summary',body:[{kind:'paragraph',runs:[{text:'Editable article body العربية'}]}],byline:'Author',publishedAt:'2026-11-01',originalPath:'/sample-program/',cover:null,coverAlt:''}]]));
 const bound=projectTemplatePresentation(projectDirectoryRecords(projectSharedDirectoryPreview(authored,config),rows,{locale}),config),withMenus=await resolveAppMenuLayout(db,'alpha',bound,'/',null,config.site.name,page.id);
 assert.equal(withMenus.root.containerStyles.values['--fb-template-primary'],palette.colors.primary);
 assert.equal(withMenus.content.find(node=>node.type==='Navbar').styles.values.backgroundColor,palette.colors.primary);
 assert.equal(withMenus.content.find(node=>node.type==='Footer').styles.values.backgroundColor,palette.colors.surface);
 assert.equal(withMenus.content.find(node=>node.id===authored.content[0].id)?.styles.color,'#235578');
 const html=await renderPage(withMenus,{user:{},page:{title:page.name},app:{name:config.site.name},visitor:{},url:{},system:{},cookies:{},local:{},session:{}});assert(html.includes('Explore')||html.includes('Institutions'));assert(html.includes(config.site.name));assert(!html.includes('PRIVATE_'));assert(!html.includes('/privacy-policy/'));
}
assert.equal((await savePalette(null)).status,200);
console.log('PASS six saved templates: existing shared menus, editable bindings and English/Arabic record projection through the real renderer');
for (const role of ['institution','program']) {
 const prefix='bfx-'+role+'-';
 const oldFields=[
  {id:prefix+'3',type:'Image',props:{recordBindings:{src:'cover',hideWhenEmpty:true}}},
  {id:prefix+'4',type:'Heading',props:{text:'Custom title',level:'1',recordBindings:{text:'title'}},styles:{color:'#0b4012'}},
  {id:prefix+'5',type:'Paragraph',props:{recordBindings:{text:'body'}}},
 ];
 const extra={id:'owner-content',type:'Text',props:{text:'Never overwrite this block'}};
 const old={root:{bookingForX:{version:1,role},siteConfiguration:{version:1,role},custom:true},
  content:[{id:prefix+'1',type:'Container',props:{directoryQuery:{version:1,queryId:'directory.'+role+'.detail',params:{path:'/original-preview/'}}},
      children:[{id:prefix+'2',type:'Container',props:{},children:oldFields}]},extra]};
 const unchanged=JSON.stringify(old);
 const upgraded=upgradeBookingDetail(old);
 assert.equal(JSON.stringify(old),unchanged,'existing layout is not mutated');
 assert.equal(upgraded.root,old.root);
 assert.equal(upgraded.content[1],extra);
 assert.equal(directoryLayoutQueries(upgraded)[0].binding.params.path,'/original-preview/');
 const nodes=new Map();
 const walk=children=>children.forEach(node=>{nodes.set(node.id,node);walk(node.children??[]);});
 walk(upgraded.content);
 assert.equal(nodes.get(prefix+'4').styles.color,'#0b4012');
 assert.equal(nodes.get(prefix+'5').props.recordBindings.fallbackText,'summary');
 assert.equal(upgradeBookingDetail(upgraded),undefined,'repeated upgrade inserts nothing');
 const extended=structuredClone(old);
 extended.content[0].children[0].children.push(extra);
 assert.equal(upgradeBookingDetail(extended),undefined,'edited starter with extra content requires ordinary manual editing');
}
const workspace=await pagesWorkspace(db,'alpha');assert.equal(workspace.entries.length,6);assert.equal(workspace.entries.filter(e=>e.kind==='layout').length,3);assert(workspace.entries.every(e=>e.publicationStatus==='draft'));
await seed.ensureHomepage(now);assert.equal((await seed.list()).length,6,'boot never adds a seventh welcome');
response=await call('install',{...input,reviewHash:review.reviewHash,operationId});assert.equal(response.status,200,'exact repeat is status-only');assert.equal((await seed.list()).length,6);assert.equal((await call('install',{...input,reviewHash:'0'.repeat(64),operationId})).status,409,'changed request cannot reuse receipt');
const home=pages.find(p=>p.is_homepage);const layout=JSON.parse(home.layout_data);layout.content[0].props={...layout.content[0].props,_layerName:'Owner customization'};await seed.setLayout(home.id,layout,now);assert(JSON.parse((await seed.get(home.id)).layout_data).content[0].props._layerName);assert.equal((await call('review',input)).status,409,'installed template not overwritten');
// Changed/deleted/authored welcome and shared configuration are never adopted.
for(const owner of ['authored','deleted','versions']){const store=new PagesStore(db,owner);await store.ensureHomepage(now);const p=(await store.list())[0];if(owner==='authored')await store.update(p.id,{name:'My authored homepage'},now);if(owner==='deleted')await store.softDelete(p.id,now);if(owner==='versions')await store.snapshot(p.id,p.layout_data,p.content_hash,'Owner snapshot',now);await assert.rejects(()=>new TemplateInstallStore(db,owner).review(input));}
const stale=new TemplateInstallStore(db,'stale');const staleReview=await stale.review(input);await new PagesStore(db,'stale').create({name:'New page',slug:'changed'},crypto.randomUUID(),now);await assert.rejects(()=>stale.install(input,staleReview.reviewHash,crypto.randomUUID(),now));
// Failure inside atomic write rolls back config and every page; pending receipt fences any retry.
const broken={...db,atomicWrite:statements=>db.atomicWrite([...statements.slice(0,4),{sql:'INSERT INTO definitely_missing_table VALUES (1)'}])};const failed=new TemplateInstallStore(broken,'failure');const f=await failed.review(input),failedId=crypto.randomUUID();await assert.rejects(()=>failed.install(input,f.reviewHash,failedId,now));assert.equal((await new PagesStore(db,'failure').list()).length,0);assert.equal((await db.query("SELECT value FROM settings WHERE tenant_slug='failure' AND key='site_configuration:v1'")).length,0);assert.equal((await failed.status()).status,'uncertain');assert.equal((await failed.install(input,f.reviewHash,failedId,now)).status,'uncertain');await assert.rejects(()=>new PagesStore(db,'failure').create({name:'Cannot race',slug:'home'},crypto.randomUUID(),now));
// Lost response after commit uses the durable receipt, never repeats page writes.
let batches=0;const lost={...db,atomicWrite:async statements=>{batches++;await db.atomicWrite(statements);throw Error('response_lost');}};const l=new TemplateInstallStore(lost,'lost');const lr=await l.review(input),lid=crypto.randomUUID();await assert.rejects(()=>l.install(input,lr.reviewHash,lid,now));assert.equal((await l.status()).status,'installed');assert.equal((await l.install(input,lr.reviewHash,lid,now)).status,'installed');assert.equal(batches,1);await assert.rejects(()=>l.install({...input,configuration:{...input.configuration,datasourceId:'changed'}},lr.reviewHash,lid,now),'changed body cannot reuse receipt');await assert.rejects(()=>l.install(input,'0'.repeat(64),lid,now),'same operation cannot accept a changed review');
// Two independent absent reads arbitrate through the one-owner settings primary key.
let attempts=0;const counted={...db,atomicWrite:async statements=>{attempts++;return db.atomicWrite(statements);}};const a=new TemplateInstallStore(counted,'concurrent'),b=new TemplateInstallStore(counted,'concurrent');const ar=await a.review(input);const concurrent=await Promise.allSettled([a.install(input,ar.reviewHash,crypto.randomUUID(),now),b.install(input,ar.reviewHash,crypto.randomUUID(),now)]);assert(concurrent.some(r=>r.status==='fulfilled'));assert.equal((await new PagesStore(db,'concurrent').list()).length,6);assert.equal((await a.status()).status,'installed');assert.equal(attempts,1,'only the owner-slot winner runs a batch');
// A real write between pending claim and batch is caught INSIDE the atomic boundary.
const racedPages=new PagesStore(db,'raced');await racedPages.ensureHomepage(now);const racedHome=(await racedPages.list())[0];
const racedDb={...db,atomicWrite:async statements=>{await db.exec('UPDATE compat_pages SET name=? WHERE tenant_slug=? AND id=?',['Intervening author','raced',racedHome.id]);return db.atomicWrite(statements);}};
const raced=new TemplateInstallStore(racedDb,'raced'),rr=await raced.review(input);await assert.rejects(()=>raced.install(input,rr.reviewHash,crypto.randomUUID(),now));assert.equal((await racedPages.list()).length,1);assert.equal((await racedPages.get(racedHome.id)).name,'Intervening author','atomic guard preserves intervening edits');
assert.equal((await new TemplateInstallStore(db,'other-tenant').status()),null);await assert.rejects(()=>new TemplateInstallStore({query:db.query,exec:db.exec},'unsupported').review(input));
// New and legacy route writers cannot claim an installed normalized route.
await assert.rejects(()=>seed.create({name:'collision',slug:'/EXPLORE/'},crypto.randomUUID(),now));
console.log('PASS Booking for X: read-only review, role/tenant/body boundaries, six editable draft entries, no record copies, pristine-only welcome replacement, exact repeat, edited/deleted/history conflicts, stale review, full rollback, lost response, uncertain fence, concurrent install and route reservation');
db.close();
