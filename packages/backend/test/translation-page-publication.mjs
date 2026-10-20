import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {allowanceFixture,now} from './translation-allowance-fixture.mjs';
import {emptyDirectoryConfiguration,defaultTemplateSettings} from '@frontbase/edge-core/directory/configuration';
import {createCompatApp} from '../dist/compat/app.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {SitePublicationStore} from '../dist/compat/site-publication-store.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
import {MenusSnapshotStore} from '../dist/compat/menus-snapshot.js';
const f=await allowanceFixture(),tenant='alpha',pageId='00000000-0000-4000-8000-000000000020',aboutPageId='00000000-0000-4000-8000-000000000022';
const config=emptyDirectoryConfiguration();config.site={name:'Study site',destination:'USA',origin:'https://site.test',locale:'en'};config.datasourceId='content';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table=role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='path';}config.collections.institution.fields.cityId='city';config.collections.program.fields.institutionId='institution';
// App menus: one snapshot referenced by several pages. Managed regions render through the same
// engine, so translations must be shared units, never per-page copies.
const menusStore=new MenusSnapshotStore(f.db,tenant),publicAudience={authentication:'everyone',contactTypes:[],permissionLevels:[]};
const navItem=(id,label)=>({id,label,href:'/explore/',audience:publicAudience,children:[]});
const menusDocument={schemaVersion:1,revision:1,menus:[
 {id:'menu-header',name:'Header',slot:'header',enabled:true,priority:0,audience:publicAudience,placement:{all:true,pageIds:[],excludePageIds:[],paths:[],excludePaths:[]},
  items:[navItem('mi-programs','Programs'),navItem('mi-institutions','Institutions'),{...navItem('mi-apply','Apply now'),tone:'primary'}],
  design:{brand:'Study site',brandHref:'/',logoUrl:'',background:'#ffffff',foreground:'#172033',maxWidth:1200,sticky:false,copyright:''}},
 {id:'menu-footer',name:'Footer',slot:'footer',enabled:true,priority:0,audience:publicAudience,placement:{all:true,pageIds:[],excludePageIds:[],paths:[],excludePaths:[]},
  items:[{id:'col-explore',label:'Explore',href:'/explore/',audience:publicAudience,children:[{id:'link-guide',label:'Programs guide',href:'/explore/?type=program',audience:publicAudience,children:[]}]}],
  design:{brand:'Study site',brandHref:'/',logoUrl:'',background:'#172033',foreground:'#ffffff',maxWidth:1200,sticky:false,copyright:'All rights reserved.'}}]};
const menusHash=await menusStore.prepare(menusDocument,now);
const layout={root:{directoryLanding:{version:1,settings:defaultTemplateSettings()},appMenus:{schemaVersion:1,hash:menusHash,pageId}},content:[
 {id:'hero',type:'Container',props:{templateHero:{version:1}}},
 {id:'search',type:'Container',props:{templateSearch:{version:1}}},
 {id:'heading',type:'Heading',props:{text:'Explore institutions'}}]};
const appMenusLayout=text=>({root:{directoryLanding:{version:1,settings:defaultTemplateSettings()},appMenus:{schemaVersion:1,hash:menusHash,pageId:aboutPageId}},content:[{id:'heading',type:'Heading',props:{text}}]});
const privacyLayout=text=>({root:{directoryLanding:{version:1,settings:defaultTemplateSettings()}},content:[{id:'nav',type:'Navbar',props:{logo:{text:'Study site',link:'/'},menuItems:[{id:'institutions',label:'Institutions',navType:'link',target:'/explore/'}],primaryButton:{enabled:false},secondaryButton:{enabled:false},showDarkModeToggle:true}},
 {id:'heading',type:'Heading',props:{text}},
 {id:'foot',type:'Footer',props:{logoText:'Study site',copyright:'All rights reserved.',columns:[{title:'Explore',links:[{text:'Programs',href:'/explore/?type=program'}]}]}}]});
const pages=new PagesStore(f.db,tenant);await pages.create({name:'Homepage',slug:'home',is_homepage:true,layout_data:layout},pageId,now);
const staticPages=(privacyText='Privacy policy')=>[{pageId,title:'Home',description:'Study abroad',originalPath:'/',layout},{pageId:'00000000-0000-4000-8000-000000000021',title:'Privacy',description:'Source policy',originalPath:'/privacy/',layout:privacyLayout(privacyText)},{pageId:aboutPageId,title:'About',description:'About the programs',originalPath:'/about/',layout:appMenusLayout('About our programs')}];
const store=new SitePublicationManifestStore(f.db,tenant),header={configurationRevision:1,configuration:config,templates:[],staticPages:staticPages(),redirects:[]};
const baseHash=await store.prepare(header,{cities:[],institutions:[],programs:[],articles:[]},now),reviews=new SitePublicationReviewStore(f.db,tenant);
await reviews.approve({hash:baseHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Fixture reviewed'},'reviewer',now);
await reviews.activate(baseHash,null,now);
let auth=true,role='owner',owner=tenant;
const app=await createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch,resolvePrincipal:async()=>({user:auth?{id:'editor',role}:null,tenant:owner})});
const root='/api/project/translation-batches/homepage/';
async function call(path,body,status=200){const r=await app.request('https://site.test'+root+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,status,await r.clone().text());const value=await r.json();assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|serviceKey|data\.example/);return value;}
const html=async path=>{const r=await renderReviewedSitePublication(f.db,tenant,new Request('https://site.test'+path));return {status:r?.status,headers:r?.headers,text:await r?.text()};};
const saveAll=(review,path='/',filter=()=>true)=>Promise.all([...Array(Math.ceil(review.fields.filter(filter).length/16)).keys()].map(i=>call('save/',{locale:'ar',token:review.token,path,entries:review.fields.filter(filter).slice(i*16,(i+1)*16).map(field=>({id:field.id,token:field.token,text:'عربي '+field.source}))})));
try{
 // Per-page review addresses the privacy page, not the homepage.
 const review=await call('review/?locale=ar&path=/privacy/');assert.equal(review.path,'/privacy/');assert.ok(review.fields.some(field=>field.source==='Privacy policy'));assert.ok(!review.fields.some(field=>field.source==='Explore institutions'));
 assert.equal(review.fields.find(field=>field.label==='Page title').source,'Privacy');
 await call('review/?locale=ar&path=privacy',undefined,422);
 // Block policy stays the default: an incomplete page refuses to prepare.
 await call('prepare/',{locale:'ar',token:review.token,approveTranslations:true,path:'/privacy/'},409);
 // Partial drafts under an explicit missing:source-fallback policy prepare a partial release.
 await saveAll(review,'/privacy/',field=>field.id===review.fields.find(item=>item.label==='Page title').id||field.source==='Privacy policy');
 await call('save/',{locale:'ar',token:review.token,entries:[{id:review.fields[0].id,token:review.fields[0].token,text:'x'}]},409);
 const prepared=await call('prepare/',{locale:'ar',token:review.token,approveTranslations:true,path:'/privacy/',policy:{missing:'source-fallback',outdated:'source-fallback'}});
 assert.equal((await html('/ar/privacy/')).status,404,'prepare must not publish');
 const preview=await app.request('https://site.test'+prepared.previewUrl);assert.equal(preview.status,200);const previewText=await preview.text();assert.match(previewText,/عربي Privacy/);assert.match(previewText,/Privacy policy/,'untranslated units preview as source');
 auth=false;assert.equal((await app.request('https://site.test'+prepared.previewUrl)).status,401,'prepared previews stay administrator-only');auth=true;
 // Drafts are never anonymous; publish is CAS-guarded.
 await call('publish/',{hash:prepared.hash,expected:{hash:'a'.repeat(64),generation:0},approveTranslations:true},409);
 const published=await call('publish/',{hash:prepared.hash,expected:prepared.expected,approveTranslations:true});assert.equal(published.generation,1);
 const page=await html('/ar/privacy/');assert.equal(page.status,200);assert.equal(page.headers.get('Content-Language'),'ar');
 assert.equal((await html('/ar/privacy/?x=1')).status,400,'localized static paths refuse query parameters like their source');
 const doc=new JSDOM(page.text).window.document;
 assert.equal(doc.documentElement.lang,'ar');assert.equal(doc.documentElement.dir,'rtl');
 assert.ok(page.text.includes('عربي Privacy policy'),'translated unit renders');assert.ok(page.text.includes('عربي Privacy'),'translated meta title renders');
 assert.equal(doc.querySelector('link[rel="canonical"]').getAttribute('href'),'https://site.test/ar/privacy/','translated page owns its localized canonical');
 assert.equal(doc.querySelector('link[hreflang="en"]').getAttribute('href'),'https://site.test/privacy/');assert.equal(doc.querySelector('link[hreflang="ar"]').getAttribute('href'),'https://site.test/ar/privacy/');
 const srcDoc=new JSDOM((await html('/privacy/')).text).window.document;
 assert.equal(srcDoc.querySelector('link[hreflang="ar"]').getAttribute('href'),'https://site.test/ar/privacy/','the source path advertises its released locale reciprocally');
 assert.ok(page.text.includes('All rights reserved.'),'untranslated footer stays source under the per-unit policy');
 // A source change must not invalidate the whole release: changed units fall back to fresh source,
 // unrelated approved text keeps serving.
 const nextHash=await store.prepare({...header,staticPages:staticPages('Renamed privacy policy')},{cities:[],institutions:[],programs:[],articles:[]},now);
 await reviews.approve({hash:nextHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Changed fixture reviewed'},'reviewer',now);
 await reviews.activate(nextHash,(await new SitePublicationStore(f.db,tenant).activeVersion()).pointer,now);
 const drifted=await html('/ar/privacy/');assert.equal(drifted.status,200,'per-unit releases survive source drift');
 assert.ok(drifted.text.includes('Renamed privacy policy'),'changed unit falls back to fresh source');assert.ok(!drifted.text.includes('عربي Privacy policy'),'no stale Arabic for a changed unit');
 assert.ok(drifted.text.includes('عربي Privacy'),'unchanged approved text keeps serving');
 // Fresh review, re-translate with v2 text, publish v2, then roll back to v1 by hash.
 const review2=await call('review/?locale=ar&path=/privacy/');
 // The stale v1 heading head is outdated after the drift; only the explicit outdated:source-fallback
 // policy lets preparation carry it (it stays out of the catalog until re-saved).
 await call('prepare/',{locale:'ar',token:review2.token,approveTranslations:true,path:'/privacy/',policy:{missing:'source-fallback',outdated:'source-fallback'}});
 const titleField=review2.fields.find(item=>item.label==='Page title');
 const headingField=review2.fields.find(item=>item.source==='Renamed privacy policy');
 await call('save/',{locale:'ar',token:review2.token,path:'/privacy/',entries:[{id:headingField.id,token:headingField.token,text:'عربي Renamed privacy policy'},{id:titleField.id,token:titleField.token,text:'الخصوصية المحدثة'}]});
 const prepared2=await call('prepare/',{locale:'ar',token:review2.token,approveTranslations:true,path:'/privacy/',policy:{missing:'source-fallback',outdated:'source-fallback'}});
 assert.ok(prepared2.hash!==prepared.hash);
 const published2=await call('publish/',{hash:prepared2.hash,expected:{hash:published.hash,generation:1},approveTranslations:true});assert.equal(published2.generation,2);
 const v2=await html('/ar/privacy/');assert.ok(v2.text.includes('عربي Renamed privacy policy'));assert.ok(v2.text.includes('الخصوصية المحدثة'));
 const rolledBack=await call('publish/',{hash:prepared.hash,expected:{hash:published2.hash,generation:2},approveTranslations:true});assert.equal(rolledBack.generation,3);
 const v1=await html('/ar/privacy/');assert.ok(!v1.text.includes('عربي Renamed privacy policy'),'rollback removes v2 text');assert.ok(v1.text.includes('عربي Privacy'),'rollback restores v1 title');assert.ok(!v1.text.includes('الخصوصية المحدثة'));
 // Publishing the same generation again conflicts; deactivation is a guarded delete.
 await call('publish/',{hash:prepared.hash,expected:{hash:published2.hash,generation:2},approveTranslations:true},409);
 await call('deactivate/',{locale:'ar',path:'/privacy/',expected:{hash:'a'.repeat(64),generation:9}},409);
 const locales1=await call('locales/');assert.ok(locales1.locales.some(item=>item.locale==='ar'&&item.path==='/privacy/'&&item.perUnit===true&&item.generation===3));
 const off=await call('deactivate/',{locale:'ar',path:'/privacy/',expected:{hash:rolledBack.hash,generation:3}});assert.equal(off.deactivated,true);
 await call('deactivate/',{locale:'ar',path:'/privacy/',expected:{hash:rolledBack.hash,generation:3}},409);
 assert.equal((await html('/ar/privacy/')).status,404,'deactivation removes the locale path until another release offers the locale');
 assert.ok(!(await call('locales/')).locales.some(item=>item.path==='/privacy/'));
 // App menus are shared surfaces: the review exposes snapshot units with shared identity, and a
 // draft saved through one page's session is the same translated unit in another page's review.
 const aboutReview=await call('review/?locale=ar&path=/about/');
 const aboutPrograms=aboutReview.fields.find(field=>field.source==='Programs');
 assert.ok(aboutPrograms&&aboutPrograms.label==='Menu Header','managed menu labels review under the menu identity');
 assert.ok(aboutReview.fields.some(field=>field.source==='About our programs'));
 assert.ok(!aboutReview.fields.some(field=>field.source==='Privacy policy'),'reviews stay per page');
 const aboutHeading=aboutReview.fields.find(field=>field.source==='About our programs');
 await call('save/',{locale:'ar',token:aboutReview.token,path:'/about/',entries:[{id:aboutPrograms.id,token:aboutPrograms.token,text:'عربي Programs'},{id:aboutHeading.id,token:aboutHeading.token,text:'عربي About our programs'}]});
 const homePreview=await call('review/?locale=ar');
 const homePrograms=homePreview.fields.find(field=>field.source==='Programs'&&field.label==='Menu Header');
 assert.ok(homePrograms&&homePrograms.id===aboutPrograms.id&&homePrograms.translation==='عربي Programs'&&homePrograms.state==='draft','a menu draft saved on one page is the same shared unit on another');
 for(const source of ['Programs','Programs guide','Apply now','All rights reserved.'])assert.equal(homePreview.fields.filter(field=>field.source===source&&String(field.label).startsWith('Menu ')).length,1,'shared menu units appear exactly once: '+source);
 // Publication pages and prepared-version listings drive the console picker and rollback UI.
 const pageList=await call('pages/');assert.ok(pageList.pages.some(page=>page.path==='/'));assert.ok(pageList.pages.some(page=>page.path==='/privacy/'));assert.ok(pageList.pages.some(page=>page.path==='/about/'));
 const history=await call('versions/?locale=ar&path=/privacy/');assert.ok(history.items.length>=2,'prepared releases stay listed after deactivation');
 assert.ok(history.items.some(item=>item.hash===rolledBack.hash&&item.perUnit===true));
 assert.ok(!JSON.stringify(history).includes('عربي'),'the version listing carries metadata, never catalog text');
 // The homepage surface publishes through the same engine and both releases coexist per path.
 const homeReview=await call('review/?locale=ar');await saveAll(homeReview);
 const homePrepared=await call('prepare/',{locale:'ar',token:homeReview.token,approveTranslations:true});assert.equal(homePrepared.expected,null,'homepage pointer namespace unchanged');
 await call('publish/',{hash:homePrepared.hash,expected:homePrepared.expected,approveTranslations:true});
 const home=await html('/ar/');assert.equal(home.status,200);assert.ok(home.text.includes('عربي Explore institutions'));
 assert.ok(home.text.includes('عربي Programs'),'published menu units render in the managed navigation');assert.ok(home.text.includes('عربي Apply now'),'managed button labels translate');assert.ok(home.text.includes('عربي Programs guide'),'managed footer links translate');
 assert.ok((await call('locales/')).locales.length>=1);
 // With only the homepage release active, a nested path keeps the approved shared shell and a source body.
 const shell=await html('/ar/privacy/');assert.equal(shell.status,200);assert.ok(shell.text.includes('Renamed privacy policy'),'deactivated page serves source body');assert.ok(!shell.text.includes('عربي Privacy policy'));
 assert.ok(shell.text.includes('hreflang="ar"'),'homepage release still offers the locale shell');
 // The homepage release alone carries the shared menu units: another app-menus page keeps a source
 // body but inherits the translated menu shell without its own release.
 const aboutShell=await html('/ar/about/');assert.equal(aboutShell.status,200);
 assert.ok(aboutShell.text.includes('عربي Programs'),'shared menu units translate the shell of another app-menus page');
 assert.ok(aboutShell.text.includes('About our programs'),'the page body stays source until the page publishes');
 // A page release carries its body plus the same shared menu units, in its own path namespace.
 const aboutPrepared=await call('prepare/',{locale:'ar',token:aboutReview.token,approveTranslations:true,path:'/about/',policy:{missing:'source-fallback',outdated:'source-fallback'}});
 assert.equal(aboutPrepared.expected,null,'page releases start their own generation namespace');
 const aboutPublished=await call('publish/',{hash:aboutPrepared.hash,expected:aboutPrepared.expected,approveTranslations:true});assert.equal(aboutPublished.generation,1);
 const aboutPage=await html('/ar/about/');assert.ok(aboutPage.text.includes('عربي About our programs'));assert.ok(aboutPage.text.includes('عربي Programs'));
 assert.ok((await call('locales/')).locales.some(item=>item.locale==='ar'&&item.path==='/about/'));
 assert.ok((await call('versions/?locale=ar&path=/about/')).items.length>=1);
 // Fences: auth, role, tenant, and cross-surface session isolation.
 auth=false;await call('review/?locale=ar&path=/privacy/',undefined,401);await call('deactivate/',{locale:'ar',expected:null},401);await call('pages/',undefined,401);await call('versions/?locale=ar&path=/privacy/',undefined,401);auth=true;
 role='viewer';await call('review/?locale=ar&path=/privacy/',undefined,403);role='owner';
 owner='beta';await call('review/?locale=ar&path=/privacy/',undefined,422);owner=tenant;
 await call('save/',{locale:'ar',token:homeReview.token,path:'/privacy/',entries:[{id:homeReview.fields[0].id,token:homeReview.fields[0].token,text:'x'}]},409);
 await call('save/',{locale:'ar',token:aboutReview.token,path:'/',entries:[{id:aboutPrograms.id,token:aboutPrograms.token,text:'x'}]},409);
 await call('publish/',{hash:'b'.repeat(64),expected:null,approveTranslations:true},409);
 // An app-menus page must not also declare legacy navigation regions.
 const conflictPages=staticPages().map(page=>page.originalPath==='/about/'?{...page,layout:{...page.layout,content:[...page.layout.content,{id:'nav',type:'Navbar',props:{logo:{text:'Study site',link:'/'},menuItems:[{id:'institutions',label:'Institutions',navType:'link',target:'/explore/'}],primaryButton:{enabled:false},secondaryButton:{enabled:false},showDarkModeToggle:true}}]}}:page);
 const conflictHash=await store.prepare({...header,staticPages:conflictPages},{cities:[],institutions:[],programs:[],articles:[]},now);
 await reviews.approve({hash:conflictHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Conflict fixture reviewed'},'reviewer',now);
 await reviews.activate(conflictHash,(await new SitePublicationStore(f.db,tenant).activeVersion()).pointer,now);
 await call('review/?locale=ar&path=/about/',undefined,422);
 console.log('translation-page-publication: per-page review/prepare policy/publish CAS/per-unit drift fallback/rollback/deactivation/shared app-menu units and fences PASS');
}catch(error){throw error;}finally{try{f.close();}catch{}}
