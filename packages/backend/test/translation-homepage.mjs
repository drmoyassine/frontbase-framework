import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {homepageDisplayFields} from '@frontbase/edge-core/localization';
assert.deepEqual(homepageDisplayFields({content:[{id:'bound',type:'Image',props:{alt:'{{ record.coverAlt | default: record.title }}',ariaLabel:'{{ record.title }}'}},{id:'static',type:'Image',props:{alt:'Campus'}}]}).map(f=>f.text),['Campus'],'binding expressions are references, never translation messages');
import {allowanceFixture,now} from './translation-allowance-fixture.mjs';
import {emptyDirectoryConfiguration,defaultTemplateSettings} from '@frontbase/edge-core/directory/configuration';
import {createCompatApp} from '../dist/compat/app.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
const f=await allowanceFixture(),tenant='alpha',pageId='00000000-0000-4000-8000-000000000020';
const config=emptyDirectoryConfiguration();config.site={name:'Study site',destination:'USA',origin:'https://site.test',locale:'en'};config.datasourceId='content';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table=role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='path';}config.collections.institution.fields.cityId='city';config.collections.program.fields.institutionId='institution';
const layout={root:{directoryLanding:{version:1,settings:defaultTemplateSettings()}},content:[{id:'nav',type:'Navbar',props:{logo:{text:'Study site',link:'/'},menuItems:[{id:'institutions',label:'Institutions',navType:'link',target:'/explore/'}],primaryButton:{enabled:false},secondaryButton:{enabled:false},showDarkModeToggle:true}},
 {id:'hero',type:'Container',props:{templateHero:{version:1}}},
 {id:'search',type:'Container',props:{templateSearch:{version:1}}},
 {id:'heading',type:'Heading',props:{text:'Explore institutions'}},
 {id:'foot',type:'Footer',props:{logoText:'Study site',copyright:'All rights reserved.',columns:[{title:'Explore',links:[{text:'Programs',href:'/explore/?type=program'}]}]}}]};
const pages=new PagesStore(f.db,tenant);await pages.create({name:'Homepage',slug:'home',is_homepage:true,layout_data:layout},pageId,now);
const store=new SitePublicationManifestStore(f.db,tenant),header={configurationRevision:1,configuration:config,templates:[],staticPages:[{pageId,title:'Home',description:'Study abroad',originalPath:'/',layout},{pageId:'00000000-0000-4000-8000-000000000021',title:'Privacy',description:'Source policy',originalPath:'/privacy/',layout}],redirects:[{from:'/old-privacy/',to:'/privacy/'}]};
const baseHash=await store.prepare(header,{cities:[],institutions:[],programs:[],articles:[]},now),reviews=new SitePublicationReviewStore(f.db,tenant);
await reviews.approve({hash:baseHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Fixture homepage reviewed'},'reviewer',now);
await reviews.activate(baseHash,null,now);
let auth=true,role='owner',owner=tenant;
const app=await createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch,resolvePrincipal:async()=>({user:auth?{id:'editor',role}:null,tenant:owner})});
const root='/api/project/translation-batches/homepage/';
async function call(path,body,status=200){const r=await app.request('https://site.test'+root+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,status,await r.clone().text());const value=await r.json();assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|serviceKey|data\.example/);return value;}
const html=async path=>{const r=await renderReviewedSitePublication(f.db,tenant,new Request('https://site.test'+path));return {status:r?.status,headers:r?.headers,text:await r?.text()};};
try{
 await call('review/?locale=fr',undefined,422);let review=await call('review/?locale=ar');assert.equal(review.complete,false);assert.ok(review.fields.some(f=>f.source==='Explore your next chapter'));assert.ok(review.fields.some(f=>f.source==='What would you like to study?'));assert.ok(review.fields.some(f=>f.source==='Institutions'));assert.equal((await html('/ar/')).status,404);assert.equal(new JSDOM((await html('/')).text).window.document.querySelector('[data-fb-locale]'),null);
 await call('prepare/',{locale:'ar',token:review.token,approveTranslations:true},409);
 const original=(await pages.get(pageId)).layout_data;
 for(let i=0;i<review.fields.length;i+=16)await call('save/',{locale:'ar',token:review.token,entries:review.fields.slice(i,i+16).map(field=>({id:field.id,token:field.token,text:'عربي '+field.source}))});
 const stale=review;review=await call('review/?locale=ar');assert.equal(review.complete,true);assert.equal((await pages.get(pageId)).layout_data,original);assert.equal(f.aiCalls(),0);
 await call('save/',{locale:'ar',token:stale.token,entries:[{id:stale.fields[0].id,token:stale.fields[0].token,text:'stale'}]},409);
 await call('prepare/',{locale:'ar',token:review.token,approveTranslations:false},409);const prepared=await call('prepare/',{locale:'ar',token:review.token,approveTranslations:true});assert.equal((await html('/ar/')).status,404,'prepare must not publish');
 const preview=await app.request('https://site.test'+prepared.previewUrl);assert.equal(preview.status,200);assert.match(await preview.text(),/عربي/);
 await call('publish/',{hash:prepared.hash,expected:prepared.expected,approveTranslations:false},409);await call('publish/',{hash:prepared.hash,expected:prepared.expected,approveTranslations:true});
 const source=await html('/'),arabic=await html('/ar/');assert.equal(arabic.status,200);assert.equal(arabic.headers.get('Content-Language'),'ar');const doc=new JSDOM(arabic.text).window.document;assert.equal(doc.documentElement.lang,'ar');assert.equal(doc.documentElement.dir,'rtl');assert.ok(doc.querySelector('a[href="/"][hreflang="en"]'));assert.ok(doc.querySelector('a[href="/ar/"][aria-current="page"]'));assert.match(doc.querySelector('h1').textContent,/عربي/);assert.ok(source.text.includes('Explore institutions'));assert.ok(source.text.includes('hreflang="ar"'));assert.ok(!source.text.includes('عربي Explore institutions'));
 assert.equal(doc.querySelector('meta[property="og:locale"]')?.getAttribute('content'),'ar','og:locale follows the released content locale');assert.equal(doc.querySelector('meta[property="og:locale:alternate"]')?.getAttribute('content'),'en');
 const nested=await html('/ar/privacy/');assert.equal(nested.status,200);const nestedDoc=new JSDOM(nested.text).window.document;assert.ok(nestedDoc.querySelector('[data-fb-language-picker] summary'));assert.equal(nestedDoc.querySelector('a[hreflang="en"]').getAttribute('href'),'/privacy/');assert.equal(nestedDoc.querySelector('a[hreflang="ar"]').getAttribute('href'),'/ar/privacy/');assert.equal(nestedDoc.querySelector('a[href*="explore"]').getAttribute('href'),'/ar/explore/');assert.equal(nestedDoc.querySelector('form[role="search"]').getAttribute('action'),'/ar/explore/');assert.equal(nestedDoc.querySelector('link[rel="canonical"]').getAttribute('href'),'https://site.test/privacy/');assert.equal(nestedDoc.querySelector('link[hreflang="ar"]'),null,'source fallback is not a translated SEO equivalent');assert.ok(nested.text.includes('Explore institutions'),'untranslated body stays source');assert.equal(nestedDoc.querySelector('meta[property="og:locale"]')?.getAttribute('content'),'en','fallback og:locale follows the CONTENT language, not the URL prefix');assert.equal(nestedDoc.querySelector('meta[property="og:locale:alternate"]'),null,'a source-content fallback claims no locale alternate, like its absent hreflang link');
assert.equal(nested.headers.get('Content-Language'),'en','fallback serves keep the source content language');assert.equal(nestedDoc.documentElement.lang,'en');assert.equal(nestedDoc.documentElement.dir,'ltr');
 const alias=await html('/ar/old-privacy/');assert.equal(alias.status,301);assert.equal(alias.headers.get('location'),'/ar/privacy/');assert.equal((await html('/ar/no-such-page/')).status,404);
 const sitemap=await html('/sitemap.xml');assert.ok(sitemap.text.includes('/ar/'));
 assert.equal((await html('/ar/?unknown=1')).status,400);assert.equal((await html('/fr/')).status,404);
 await call('publish/',{hash:prepared.hash,expected:null,approveTranslations:true},409);
 auth=false;await call('review/?locale=ar',undefined,401);auth=true;role='viewer';await call('review/?locale=ar',undefined,403);role='owner';owner='beta';await call('review/?locale=ar',undefined,422);await call('publish/',{hash:prepared.hash,expected:null,approveTranslations:true},409);owner=tenant;
 // A second locale publishing only /privacy/ stays out of every other page's registry:
 // hreflang clusters and switchers are per-path, and /fr/ itself serves as an honest
 // source-locale fallback while no French homepage release exists. (Placed after the
 // pointer-CAS asserts: the generation-config save changes the session configHash, which
 // would otherwise mask the CAS behind prepared_locale_changed.)
 await f.generation.save({...f.configuration,targetLocales:['ar','fr']},1,now);
 const frReview=await call('review/?locale=fr&path=/privacy/');
 for(let i=0;i<frReview.fields.length;i+=16)await call('save/',{locale:'fr',token:frReview.token,path:'/privacy/',entries:frReview.fields.slice(i,i+16).map(field=>({id:field.id,token:field.token,text:'français '+field.source}))});
 const frComplete=await call('review/?locale=fr&path=/privacy/');assert.equal(frComplete.complete,true);
 const frPrepared=await call('prepare/',{locale:'fr',token:frComplete.token,approveTranslations:true,path:'/privacy/'});
 await call('publish/',{hash:frPrepared.hash,expected:frPrepared.expected,approveTranslations:true});
 const sitemapAfterFr=await html('/sitemap.xml');assert.ok(sitemapAfterFr.text.includes('<loc>https://site.test/fr/privacy/</loc>'),'each fresh released path joins the sitemap');assert.ok(sitemapAfterFr.text.includes('<loc>https://site.test/ar/</loc>'));assert.ok(!sitemapAfterFr.text.includes('<loc>https://site.test/fr/</loc>'),'locales without a homepage release stay out of the sitemap homepage');assert.ok(!sitemapAfterFr.text.includes('/ar/privacy/'),'locales without the path stay out of its sitemap entry');
 const frenchPage=await html('/fr/privacy/');assert.equal(frenchPage.status,200);assert.equal(frenchPage.headers.get('Content-Language'),'fr');
 const frDoc=new JSDOM(frenchPage.text).window.document;assert.equal(frDoc.documentElement.lang,'fr');assert.equal(frDoc.documentElement.dir,'ltr');
 assert.equal(frDoc.querySelector('link[rel="canonical"]').getAttribute('href'),'https://site.test/fr/privacy/');
 assert.equal(frDoc.querySelector('link[hreflang="en"]').getAttribute('href'),'https://site.test/privacy/');
 assert.equal(frDoc.querySelector('meta[property="og:title"]')?.getAttribute('content'),'français Privacy','released og metadata follows the localized page');assert.equal(frDoc.querySelector('meta[property="og:url"]')?.getAttribute('content'),'https://site.test/fr/privacy/');assert.equal(frDoc.querySelector('meta[property="og:site_name"]')?.getAttribute('content'),'Study site');assert.equal(frDoc.querySelector('meta[property="og:type"]')?.getAttribute('content'),'website','source document keys survive the og merge');
 assert.equal(frDoc.querySelector('link[hreflang="ar"]'),null,'locales without this path stay out of its cluster');
 const srcPrivacy=new JSDOM((await html('/privacy/')).text).window.document;
 assert.equal(srcPrivacy.querySelector('link[hreflang="fr"]').getAttribute('href'),'https://site.test/fr/privacy/','the source path advertises released locales reciprocally');
 const arAfterFr=new JSDOM((await html('/ar/')).text).window.document;assert.equal(arAfterFr.querySelector('link[hreflang="fr"]'),null,'the ar homepage cluster stays per-path');
 assert.ok(!source.text.includes('hreflang="fr"'),'the source homepage cluster stays per-path');
 const frenchHome=await html('/fr/');assert.equal(frenchHome.status,200);assert.equal(frenchHome.headers.get('Content-Language'),'en','fallback homepage keeps the source content language');
 const frHomeDoc=new JSDOM(frenchHome.text).window.document;assert.equal(frHomeDoc.documentElement.lang,'en');assert.equal(frHomeDoc.querySelector('link[hreflang="fr"]'),null,'a fallback homepage claims no locale equivalent');
 assert.equal((await html('/fr/?x=1')).status,400,'the localized homepage refuses query parameters like the source');
 const nextHash=await store.prepare({...header,redirects:[],staticPages:[{...header.staticPages[0],title:'Changed source'}]},{cities:[],institutions:[],programs:[],articles:[]},now);await reviews.approve({hash:nextHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Changed fixture reviewed'},'reviewer',now);const {SitePublicationStore}=await import('../dist/compat/site-publication-store.js');await reviews.activate(nextHash,(await new SitePublicationStore(f.db,tenant).activeVersion()).pointer,now);
 assert.equal((await html('/ar/')).status,503,'source change must not expose untranslated locale fallback');assert.equal((await html('/')).status,200,'English remains available');assert.equal(new JSDOM((await html('/')).text).window.document.querySelector('[data-fb-locale]'),null);
 const staleSitemap=await html('/sitemap.xml');assert.ok(!staleSitemap.text.includes('/ar/')&&!staleSitemap.text.includes('/fr/'),'stale locale releases leave the sitemap when the site re-publishes');
 // Route reservation: the translation router owns every /{locale}/… URL, so site admission refuses
 // source paths or redirect endpoints under a LIVE locale prefix, and a locale whose prefix the
 // active publication still claims refuses to prepare at all.
 const reservedHeader={...header,staticPages:[...header.staticPages,
   {pageId:'00000000-0000-4000-8000-000000000022',title:'AR legal',description:'',originalPath:'/ar/legal/',layout},
   {pageId:'00000000-0000-4000-8000-000000000023',title:'DE legal',description:'',originalPath:'/de/legal/',layout}],
   redirects:[...header.redirects,{from:'/dealias/',to:'/de/legal/'},{from:'/de/old/',to:'/privacy/'}]};
 await assert.rejects(store.prepare(reservedHeader,{cities:[],institutions:[],programs:[],articles:[]},now),/publication_locale_route_reserved/,'a live locale reserves its prefix against new site admissions');
 const deHash=await store.prepare({...reservedHeader,staticPages:reservedHeader.staticPages.filter(page=>page.originalPath!=='/ar/legal/')},{cities:[],institutions:[],programs:[],articles:[]},now);
 await reviews.approve({hash:deHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Reserved-route fixture reviewed'},'reviewer',now);
 await reviews.activate(deHash,(await new SitePublicationStore(f.db,tenant).activeVersion()).pointer,now);
 assert.equal((await html('/de/legal/')).status,200,'a source page under an unclaimed locale prefix still serves');
 assert.ok(await f.generation.save({...f.configuration,targetLocales:['ar','fr','de']},2,now),'de joins the configured targets');
 const deReview=await call('review/?locale=de');
 for(let i=0;i<deReview.fields.length;i+=16)await call('save/',{locale:'de',token:deReview.token,entries:deReview.fields.slice(i,i+16).map(field=>({id:field.id,token:field.token,text:'gelb '+field.source}))});
 const deComplete=await call('review/?locale=de');assert.equal(deComplete.complete,true);
 await call('prepare/',{locale:'de',token:deComplete.token,approveTranslations:true},409);
 console.log('translation-homepage: complete coverage, external drafts, reviewed preview/activation, source/CAS/tenant fences, SSR RTL/switcher/SEO and source resilience PASS');
}finally{f.close();}
