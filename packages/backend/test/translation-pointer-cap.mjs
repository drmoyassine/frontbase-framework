import assert from 'node:assert/strict';
import {allowanceFixture,now} from './translation-allowance-fixture.mjs';
import {emptyDirectoryConfiguration,defaultTemplateSettings} from '@frontbase/edge-core/directory/configuration';
import {createCompatApp} from '../dist/compat/app.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {publicationHash} from '../dist/compat/site-publication-store.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
import {readHomepagePointer} from '../dist/compat/translation-homepage.js';
import {TranslationGenerationStore} from '../dist/compat/translation-generation.js';
import {renderLanguageSwitcher} from '../../edge-core/dist/ssr/components/landing/languageSwitcher.js';
// The 16-pointer write-time fence (MG-2 / backlog item 2): the 17th concurrent (locale,path)
// publication pointer must refuse at publish (and prepare) time with locale_pointer_cap_exceeded,
// because the serve-time registry guard (publishedHomepageLocales >16 → anonymous throw → 503 for
// every anonymous non-homepage page) and the switcher's language_links_invalid cannot be survived.
// Serve keeps its guard unchanged; this suite pins both layers through the REAL stores and routes.
const f=await allowanceFixture(),tenant='alpha',homeId='00000000-0000-4000-8000-000000000020';
const config=emptyDirectoryConfiguration();config.site={name:'Study site',destination:'USA',origin:'https://site.test',locale:'en'};config.datasourceId='content';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table=role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='path';}
config.collections.institution.fields.cityId='city';config.collections.program.fields.institutionId='institution';
const layout=text=>({root:{directoryLanding:{version:1,settings:defaultTemplateSettings()}},content:[{id:'heading',type:'Heading',props:{text}}]});
const staticPages=()=>[{pageId:homeId,title:'Home',description:'Study abroad',originalPath:'/',layout:layout('Explore institutions')},{pageId:'00000000-0000-4000-8000-000000000021',title:'Privacy',description:'Source policy',originalPath:'/privacy/',layout:layout('Privacy policy')},{pageId:'00000000-0000-4000-8000-000000000022',title:'About',description:'About the programs',originalPath:'/about/',layout:layout('About our programs')}];
const pages=new PagesStore(f.db,tenant);await pages.create({name:'Homepage',slug:'home',is_homepage:true,layout_data:layout('Explore institutions')},homeId,now);
const store=new SitePublicationManifestStore(f.db,tenant),header={configurationRevision:1,configuration:config,templates:[],staticPages:staticPages(),redirects:[]};
const baseHash=await store.prepare(header,{cities:[],institutions:[],programs:[],articles:[]},now),reviews=new SitePublicationReviewStore(f.db,tenant);
await reviews.approve({hash:baseHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Fixture reviewed'},'reviewer',now);
await reviews.activate(baseHash,null,now);
const LOCALES=['ar','fr','es','de','pt','it'];
assert.ok(await new TranslationGenerationStore(f.db,tenant).save({...f.configuration,targetLocales:LOCALES},1,now),'generation CAS save succeeds at revision 1');
let auth=true,role='owner',owner=tenant;
const app=await createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch,resolvePrincipal:async()=>({user:auth?{id:'editor',role}:null,tenant:owner})});
const root='/api/project/translation-batches/homepage/';
async function call(path,body,status=200){const r=await app.request('https://site.test'+root+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,status,await r.clone().text());const value=await r.json();assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|serviceKey|data\.example/);return value;}
const html=async path=>{const r=await renderReviewedSitePublication(f.db,tenant,new Request('https://site.test'+path));return {status:r?.status,text:await r?.text()};};
const prepared=[];let localesView;
try{
 // 17 distinct (locale,path) combos are prepared UP FRONT (prepare-time counting only refuses
 // beyond-cap prepares, so every release must exist before any pointer is activated).
 const combos=[...LOCALES.map(locale=>({locale,path:'/privacy/'})),...LOCALES.map(locale=>({locale,path:'/about/'})),...LOCALES.map(locale=>({locale,path:'/'}))];
 for(const combo of combos.slice(0,17)){
  const pathParam=combo.path==='/'?'':'&path='+encodeURIComponent(combo.path);
  const review=await call('review/?locale='+combo.locale+pathParam);
  const field=review.fields.find(item=>item.label==='Page title');
  await call('save/',{locale:combo.locale,token:review.token,...(combo.path==='/'?{}:{path:combo.path}),entries:[{id:field.id,token:field.token,text:combo.locale.toUpperCase()+' '+field.source}]});
  const release=await call('prepare/',{locale:combo.locale,token:review.token,approveTranslations:true,...(combo.path==='/'?{}:{path:combo.path}),policy:{missing:'source-fallback',outdated:'source-fallback'}});
  assert.equal(release.expected,null);prepared.push({combo,hash:release.hash});
 }
 // (b) activation #16 succeeds: sixteen concurrent pointers are legal and serve normally.
 for(const item of prepared.slice(0,16)){const published=await call('publish/',{hash:item.hash,expected:null,approveTranslations:true});assert.equal(published.generation,1);}
 localesView=await call('locales/');assert.equal(localesView.locales.length,16);assert.equal(localesView.overCap,undefined);
 assert.equal((await html('/ar/privacy/')).status,200,'sixteen pointers serve anonymously without a 503');
 assert.equal((await html('/')).status,200,'the source homepage serves at the cap');
 // (a) activation #17 refuses BEFORE any CAS write with the stable code plus cap and count.
 const seventeenth=await app.request('https://site.test'+root+'publish/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hash:prepared[16].hash,expected:null,approveTranslations:true})});
 assert.equal(seventeenth.status,409);const refusal=await seventeenth.json();
 assert.equal(refusal.code,'locale_pointer_cap_exceeded');assert.equal(refusal.cap,16);assert.equal(refusal.count,17);
 assert.equal(await readHomepagePointer(f.db,tenant,prepared[16].combo.locale,prepared[16].combo.path),null,'the refused pointer wrote nothing');
 assert.equal((await call('locales/')).locales.length,16,'the refusal left the registry untouched');
 await call('publish/',{hash:prepared[16].hash,expected:null,approveTranslations:true},409);
 // Prepare-time beyond-cap detection: preparing an 18th pointer while sixteen are active refuses
 // at prepare, before the immutable release is written, with the same code and quantities.
 const eighteenth=combos[17],eighteenthReview=await call('review/?locale='+eighteenth.locale);
 const eighteenthField=eighteenthReview.fields.find(item=>item.label==='Page title');
 await call('save/',{locale:eighteenth.locale,token:eighteenthReview.token,path:eighteenth.path,entries:[{id:eighteenthField.id,token:eighteenthField.token,text:eighteenth.locale.toUpperCase()+' '+eighteenthField.source}]});
 const eighteenthRefusal=await call('prepare/',{locale:eighteenth.locale,token:eighteenthReview.token,approveTranslations:true,path:eighteenth.path,policy:{missing:'source-fallback',outdated:'source-fallback'}},409);
 assert.equal(eighteenthRefusal.code,'locale_pointer_cap_exceeded');assert.equal(eighteenthRefusal.cap,16);assert.equal(eighteenthRefusal.count,17);
 assert.equal((await call('versions/?locale=it&path=%2F')).items.length,0,'the refused preparation wrote no release');
 // Replace-in-place at the cap stays possible: re-publishing an already-active (locale,path)
 // advances its generation without growing the registry — the recovery path the fence keeps open.
 const arCurrent=localesView.locales.find(item=>item.locale==='ar'&&item.path==='/privacy/');
 const arReview=await call('review/?locale=ar&path=%2Fprivacy%2F');
 const arPrepared=await call('prepare/',{locale:'ar',token:arReview.token,approveTranslations:true,path:'/privacy/',policy:{missing:'source-fallback',outdated:'source-fallback'}});
 const republished=await call('publish/',{hash:arPrepared.hash,expected:{hash:arCurrent.hash,generation:arCurrent.generation},approveTranslations:true});
 assert.equal(republished.generation,2);assert.equal((await call('locales/')).locales.length,16);
 // Legacy over-cap state (out-of-band write): the serve guard is unchanged — anonymous pages 503
 // site-wide while the source homepage falls through — and the switcher keeps its own 16-link
 // refusal as defense-in-depth. The console-facing locales list now reports the over-cap code.
 const seventeenthKey=prepared[16].combo.path==='/'?'translation_homepage:active:v1:'+prepared[16].combo.locale:'translation_surface:active:v1:'+await publicationHash({kind:'page',path:prepared[16].combo.path})+':'+prepared[16].combo.locale;
 await f.db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[tenant,seventeenthKey,JSON.stringify({hash:prepared[16].hash,generation:1}),now]);
 assert.equal((await html('/privacy/')).status,503,'the serve-time registry guard still 503s a legacy over-cap state');
 assert.equal((await html('/ar/privacy/')).status,503);
 assert.equal((await html('/')).status,200,'the source homepage still falls through the locale walk');
 const codes=['en','ar','fr','es','de','pt','it','nl','sv','pl','tr','ru','ja','zh','ko','da','fi'];
 assert.throws(()=>renderLanguageSwitcher(codes.map((code,i)=>({code,label:code,href:'/'+code+'/',current:i===0}))),/language_links_invalid/,'the edge-core switcher keeps its 16-link refusal');
 renderLanguageSwitcher(codes.slice(0,16).map((code,i)=>({code,label:code,href:'/'+code+'/',current:i===0})));
 const overCapView=await call('locales/');
 assert.equal(overCapView.locales.length,17);assert.deepEqual(overCapView.overCap,{code:'locale_pointer_cap_exceeded',cap:16,count:17});
 // In-console recovery: deactivating one pointer drops back under the cap and serving recovers.
 await call('deactivate/',{locale:prepared[16].combo.locale,...(prepared[16].combo.path==='/'?{}:{path:prepared[16].combo.path}),expected:{hash:prepared[16].hash,generation:1}});
 assert.equal((await html('/privacy/')).status,200);
 const recovered=await call('locales/');assert.equal(recovered.locales.length,16);assert.equal(recovered.overCap,undefined);
 console.log('translation-pointer-cap: 16 publish green, 17th publish and prepare refuse with locale_pointer_cap_exceeded(cap 16, count 17), replace-in-place allowed, legacy over-cap serve guard + locales overCap + recovery pinned PASS');
}catch(error){throw error;}finally{try{f.close();}catch{}}
