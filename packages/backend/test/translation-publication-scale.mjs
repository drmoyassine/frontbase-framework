import assert from 'node:assert/strict';
import {allowanceFixture,now} from './translation-allowance-fixture.mjs';
import {emptyDirectoryConfiguration,defaultTemplateSettings} from '@frontbase/edge-core/directory/configuration';
import {createCompatApp} from '../dist/compat/app.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {publicationHash} from '../dist/compat/site-publication-store.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
import {sitemapLocaleEntries} from '../dist/compat/translation-homepage-serving.js';
import {readHomepagePointer} from '../dist/compat/translation-homepage.js';
import {TranslationGenerationStore} from '../dist/compat/translation-generation.js';
// Scalable publication registry (owner directive 2026-10-22): there is NO aggregate quota — the
// former global 16-pointer cap counted page–language publications rather than languages, raced on
// count-then-insert, and let one corrupt release 503 every unrelated page. This suite pins the
// replacement through the REAL stores and routes: more than 16 Arabic pages all serve at once,
// several languages scope per path (switcher/hreflang), concurrent activations of distinct
// pointers all commit while the same-pointer race admits exactly one winner (per-pointer CAS),
// the administrative listing paginates and isolates a corrupt release to its own page, and the
// sitemap walk stays bounded and per-path.
const f=await allowanceFixture(),tenant='alpha',homeId='00000000-0000-4000-8000-000000000020';
const config=emptyDirectoryConfiguration();config.site={name:'Study site',destination:'USA',origin:'https://site.test',locale:'en'};config.datasourceId='content';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table=role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='path';}
config.collections.institution.fields.cityId='city';config.collections.program.fields.institutionId='institution';
const SUBPAGES=17,pageId=i=>'00000000-0000-4000-8000-'+String(0x100+i).padStart(12,'0');
const layout=text=>({root:{directoryLanding:{version:1,settings:defaultTemplateSettings()}},content:[{id:'heading',type:'Heading',props:{text}}]});
const subPath=i=>'/p'+String(i+1).padStart(2,'0')+'/';
const staticPages=[{pageId:homeId,title:'Home',description:'Study abroad',originalPath:'/',layout:layout('Explore institutions')},
    ...Array.from({length:SUBPAGES},(_,i)=>({pageId:pageId(i),title:'Page '+(i+1),description:'About page '+(i+1),originalPath:subPath(i),layout:layout('Page '+(i+1)+' body')}))];
const pages=new PagesStore(f.db,tenant);await pages.create({name:'Homepage',slug:'home',is_homepage:true,layout_data:layout('Explore institutions')},homeId,now);
for(let i=0;i<SUBPAGES;i++)await pages.create({name:'Page '+(i+1),slug:'p'+(i+1),is_homepage:false,layout_data:layout('Page '+(i+1)+' body')},pageId(i),now);
const store=new SitePublicationManifestStore(f.db,tenant),header={configurationRevision:1,configuration:config,templates:[],staticPages,redirects:[]};
const baseHash=await store.prepare(header,{cities:[],institutions:[],programs:[],articles:[]},now),reviews=new SitePublicationReviewStore(f.db,tenant);
await reviews.approve({hash:baseHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Fixture reviewed'},'reviewer',now);
await reviews.activate(baseHash,null,now);
assert.ok(await new TranslationGenerationStore(f.db,tenant).save({...f.configuration,targetLocales:['ar','fr','es','de']},1,now),'generation CAS save succeeds at revision 1');
let auth=true,role='owner',owner=tenant;
const app=await createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch,resolvePrincipal:async()=>({user:auth?{id:'editor',role}:null,tenant:owner})});
const root='/api/project/translation-batches/homepage/';
async function call(path,body,status=200){const r=await app.request('https://site.test'+root+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,status,await r.clone().text());const value=await r.json();assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|serviceKey|data\.example/);return value;}
const html=async path=>{const r=await renderReviewedSitePublication(f.db,tenant,new Request('https://site.test'+path));return {status:r?.status,text:await r?.text()};};
const publishEndpoint=(hash,expected=null)=>app.request('https://site.test'+root+'publish/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hash,expected,approveTranslations:true})});
/** review → save the page title → prepare (per-unit policy, the release every real page uses). */
async function prepareRelease(locale,path,label){
    const pathParam=path==='/'?'':'&path='+encodeURIComponent(path);
    const review=await call('review/?locale='+locale+pathParam);
    const field=review.fields.find(item=>item.label==='Page title');
    await call('save/',{locale,token:review.token,...(path==='/'?{}:{path}),entries:[{id:field.id,token:field.token,text:label}]});
    return (await call('prepare/',{locale,token:review.token,approveTranslations:true,...(path==='/'?{}:{path}),policy:{missing:'source-fallback',outdated:'source-fallback'}})).hash;
}
try{
 // (1) SCALE: more than 16 Arabic page-language publications, all serving anonymously at once.
 const arTargets=['/',...Array.from({length:SUBPAGES},(_,i)=>subPath(i))],arHashes={};
 for(const p of arTargets){arHashes[p]=await prepareRelease('ar',p,'AR '+p);const published=await call('publish/',{hash:arHashes[p],expected:null,approveTranslations:true});assert.equal(published.generation,1);}
 for(const p of arTargets){const view=await html('/ar'===p?'/ar/':'/ar'+p);assert.equal(view.status,200,'Arabic page serves at publication '+(arTargets.indexOf(p)+1)+' of '+arTargets.length);assert.ok(view.text.includes('AR '+p),'projected Arabic title renders for '+p);}
 const full=await call('locales/');assert.equal(full.total,arTargets.length);assert.equal(full.version,1);
 assert.ok(full.total>16,'the registry exceeds the retired 16-pointer cap without any refusal');
 for(const row of full.locales){assert.equal(row.available,true);assert.match(row.hash,/^[a-f0-9]{64}$/);assert.ok(Number.isInteger(row.generation)&&row.generation>=1);assert.ok(row.reviewedAt);}
 // (2) PAGINATION: the administrative listing walks in bounded pages, union complete, no duplicates.
 const seen=new Set();let offset=0,guard=0;
 while(offset<full.total){const pageView=await call('locales/?limit=7&offset='+offset);
     assert.equal(pageView.limit,7);assert.equal(pageView.offset,offset);
     for(const row of pageView.locales){const key=row.locale+'\u0000'+row.path;assert.ok(!seen.has(key),'pagination must not repeat a row');seen.add(key);}
     offset+=pageView.locales.length;assert.ok(++guard<=10,'pagination walk did not terminate');}
 assert.equal(seen.size,full.total,'the paginated union covers every pointer');
 assert.equal((await call('locales/?limit=7&offset='+full.total)).locales.length,0,'offset beyond total is empty');
 // (3) SEVERAL LANGUAGES, SCOPED PER PATH: switchers and hreflang never leak other pages' locales.
 for(const [locale,path,label] of [['fr',subPath(1),'FR P02'],['es',subPath(1),'ES P02'],['de','/','DE HOME'],['de',subPath(2),'DE P03']]){
     const hash=await prepareRelease(locale,path,label);await call('publish/',{hash,expected:null,approveTranslations:true});}
 const arPrivacy=await html('/ar'+subPath(1));assert.equal(arPrivacy.status,200);
 assert.ok(arPrivacy.text.includes('/fr'+subPath(1))&&arPrivacy.text.includes('/es'+subPath(1)),'the page switcher carries its own languages');
 assert.ok(!arPrivacy.text.includes('/de'+subPath(1)),'a homepage-only de release must not claim this page switcher');
 const arAbout=await html('/ar'+subPath(2));assert.equal(arAbout.status,200);
 assert.ok(arAbout.text.includes('/de'+subPath(2)),'the page carries its own de release');
 assert.ok(!arAbout.text.includes('/fr'+subPath(2)),'another page\'s fr must not claim this switcher');
 const sourcePrivacy=await html(subPath(1));assert.equal(sourcePrivacy.status,200);
 assert.ok(/hreflang="ar"/.test(sourcePrivacy.text)&&/hreflang="fr"/.test(sourcePrivacy.text)&&/hreflang="es"/.test(sourcePrivacy.text),'the source page advertises its released locales');
 assert.ok(!/hreflang="de"/.test(sourcePrivacy.text),'hreflang stays per-path (de publishes the homepage, not this page)');
 const shell=await html('/de'+subPath(1));assert.equal(shell.status,200,'the homepage shell-fallback still serves de prefix pages');
 // (4) CONCURRENCY: distinct pointers commit simultaneously; the same-pointer race admits one.
 const combos=[['fr',subPath(2)],['es',subPath(2)],['fr',subPath(0)],['es',subPath(0)]],raceHashes={};
 for(const [l,p] of combos)raceHashes[l+p]=await prepareRelease(l,p,l.toUpperCase()+' '+p);
 const distinct=await Promise.all(combos.map(([l,p])=>publishEndpoint(raceHashes[l+p])));
 for(const r of distinct)assert.equal(r.status,200,'concurrent publications of distinct pointers all commit');
 assert.deepEqual(await readHomepagePointer(f.db,tenant,'fr',subPath(2)),{hash:raceHashes['fr'+subPath(2)],generation:1});
 const frHomeA=await prepareRelease('fr','/','FR HOME A'),frHomeB=await prepareRelease('fr','/','FR HOME B');
 assert.notEqual(frHomeA,frHomeB,'two prepares of one combo are distinct immutable releases');
 const sameRace=await Promise.all([frHomeA,frHomeB].map(hash=>publishEndpoint(hash)));
 assert.deepEqual(sameRace.map(r=>r.status).sort(),[200,409],'the same-pointer race admits exactly one winner');
 const pointer=await readHomepagePointer(f.db,tenant,'fr','/');
 assert.equal(pointer.generation,1);assert.ok([frHomeA,frHomeB].includes(pointer.hash));
 assert.equal((await call('locales/')).locales.filter(row=>row.locale==='fr'&&row.path==='/').length,1,'the loser release owns no pointer');
 // (5) DEACTIVATE + prefix tightening: a deactivated page-language stops claiming its prefix.
 const esP01=(await call('locales/')).locales.find(row=>row.locale==='es'&&row.path===subPath(0));
 assert.equal((await html('/es'+subPath(0))).status,200);
 await call('deactivate/',{locale:'es',path:subPath(0),expected:{hash:esP01.hash,generation:esP01.generation}});
 assert.equal((await html('/es'+subPath(0))).status,404,'without a claiming release the prefixed URL no longer serves the page');
 assert.equal((await html('/fr'+subPath(0))).status,200,'the sibling locale keeps serving');
 // (6) CORRUPT ISOLATION: one unreadable release 503s its own page alone; listing + sitemap flag it.
 const broken=arTargets.at(-1);
 await f.db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?',['{"broken":',tenant,'translation_surface:version:v1:'+arHashes[broken]]);
 assert.equal((await html('/ar'+broken)).status,503,'the corrupt requested release 503s its own page (strict fence)');
 assert.equal((await html('/ar'+subPath(SUBPAGES-2))).status,200,'the sibling Arabic page survives the corruption');
 assert.equal((await html(subPath(1))).status,200,'an unrelated source page survives the corruption');
 assert.equal((await html('/ar/')).status,200,'the localized homepage survives the corruption');
 const flagged=await call('locales/');
 assert.equal(flagged.locales.filter(row=>row.available===false).length,1,'exactly one listing row is flagged unavailable');
 const brokenRow=flagged.locales.find(row=>row.available===false);
 assert.equal(brokenRow.locale,'ar');
 assert.equal(brokenRow.path,null,'a corrupt release cannot be traced to its path from the key\'s one-way surface hash alone');
 assert.equal(brokenRow.hash,arHashes[broken],'the intact pointer still carries the release identity for forensics');
 assert.equal(brokenRow.generation,1);
 assert.equal(flagged.total,arTargets.length+8,'corruption never removes the pointer from the registry (one pointer was deactivated in step 5)');
 const entries=await sitemapLocaleEntries(f.db,tenant,new Request('https://site.test/'),{hash:baseHash});
 assert.ok(entries.some(e=>e.locale==='ar'&&e.path===subPath(SUBPAGES-2)),'the sitemap walk covers surviving releases');
 assert.ok(!entries.some(e=>e.path===broken),'the corrupt release acquires no sitemap entry');
 assert.ok(entries.some(e=>e.locale==='de'&&e.path==='/')&&!entries.some(e=>e.locale==='de'&&e.path===subPath(1)),'the sitemap stays per-path');
 console.log('translation-publication-scale: '+arTargets.length+' Arabic pages serve at once, paginated listing complete, per-path switchers/hreflang scoped, distinct-pointer concurrency + same-pointer CAS race pinned, deactivation tightens its prefix, corrupt release isolated (503 own page, flagged row, sitemap excluded) PASS');
}catch(error){throw error;}finally{try{f.close();}catch{}}
