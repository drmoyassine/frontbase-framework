import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {allowanceFixture,now} from './translation-allowance-fixture.mjs';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {createCompatApp} from '../dist/compat/app.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
import {projectFrontendCopy,copyFields,copyDisplayLayout,FrontendCopyStore,projectFrontendCopyRows} from '../dist/compat/frontend-copy.js';
const f=await allowanceFixture(),owner='alpha',pageId=crypto.randomUUID();
try{
 assert.ok(await f.generation.save({...f.configuration,targetLocales:['ar','fr']},1,now));
 const config=emptyDirectoryConfiguration();config.site={name:'Study site',destination:'USA',origin:'https://site.test',locale:'en'};config.datasourceId='content';
 for(const role of ['institution','program','city']){const m=config.collections[role];m.table=role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='path';}config.collections.institution.fields.cityId='city';config.collections.program.fields.institutionId='institution';
 const layout={root:{},content:[{id:'heading',type:'Heading',props:{level:1,text:'Explore institutions'}},{id:'intro',type:'Text',props:{content:'Find a place to study'}},{id:'record-list',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.institution.list',params:{}}},children:[{id:'record-title',type:'Heading',props:{text:'',recordBindings:{text:'title'}}}]},{id:'nav',type:'Navbar',props:{logo:{text:'Study site',link:'/'},menuItems:[],primaryButton:{enabled:false},secondaryButton:{enabled:false}}}]};
 await new PagesStore(f.db,owner).create({name:'Home',slug:'home',layout_data:layout},pageId,now);
 const store=new SitePublicationManifestStore(f.db,owner),hash=await store.prepare({configurationRevision:1,configuration:config,templates:['directory','institution'].map((role,index)=>({pageId:'00000000-0000-4000-8000-00000000000'+index,role,title:role,description:'',layout:{root:{siteConfiguration:{version:1,role}},content:[{id:role,type:role==='directory'?'Repeater':'Container',props:{directoryQuery:{version:1,queryId:role==='directory'?'directory.institution.list':'directory.institution.detail',params:role==='directory'?{}:{path:'/campus/'}}}}]}})),staticPages:[{pageId,title:'Home',description:'Study options',originalPath:'/',layout}]},{cities:[{id:9,title:'Boston'}],institutions:[{id:1,title:'Campus',originalPath:'/campus/',cityId:9,summary:'',cover:null,coverAlt:'',logo:null,body:null}],programs:[],articles:[]},now),review=new SitePublicationReviewStore(f.db,owner);
 await review.approve({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Reviewed synthetic copy test'},'admin',now);await review.activate(hash,null,now);
 const app=await createCompatApp({makeRunner:()=>f.db,resolvePrincipal:async()=>({user:{id:'admin',role:'owner'},tenant:owner}),sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch});
 async function call(path,body){const response=await app.request('https://site.test'+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://site.test','X-Frontbase-Editor':'1'},body:JSON.stringify(body)}:{})});assert.equal(response.status,200,await response.clone().text());return response.json();}
 const root='/api/project/translation-batches/homepage/';
 let translated=await call(root+'review/?locale=ar');
 for(let i=0;i<translated.fields.length;i+=16)await call(root+'save/',{locale:'ar',token:translated.token,entries:translated.fields.slice(i,i+16).map(field=>({id:field.id,token:field.token,text:'عربي '+field.source}))});
 translated=await call(root+'review/?locale=ar');const prepared=await call(root+'prepare/',{locale:'ar',token:translated.token,approveTranslations:true});await call(root+'publish/',{hash:prepared.hash,expected:prepared.expected,approveTranslations:true});
 const draftReview=await call(root+'review/?locale=ar'),untouched=draftReview.fields.find(field=>field.source==='Find a place to study');await call(root+'save/',{locale:'ar',token:draftReview.token,entries:[{id:untouched.id,token:untouched.token,text:'UNREVIEWED INTRO'}]});
 const en=await call('/api/frontend-edit/inventory/?path=%2F'),ar=await call('/api/frontend-edit/inventory/?path=%2Far%2F');assert.equal(en.locale,'en');assert.equal(ar.locale,'ar');assert.match(ar.fields.find(field=>field.blockId==='heading').text,/عربي/);
 const edit=(state,path,text)=>({path,token:state.token,operationId:crypto.randomUUID(),entries:[{id:state.fields.find(field=>field.blockId==='heading').id,text}]});
 await call('/api/frontend-edit/save/',edit(ar,'/ar/','عنوان عربي معدل'));
 let response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/ar/'));assert.equal(response.status,200);assert.ok(response.headers.get('X-Translation-Version'));let doc=new JSDOM(await response.text()).window.document;assert.equal(doc.querySelector('h1').textContent,'عنوان عربي معدل');assert.ok(!doc.body.textContent.includes('UNREVIEWED INTRO'));assert.equal((await call(root+'review/?locale=ar')).fields.find(field=>field.source==='Explore institutions').translation,'عربي Explore institutions');assert.equal(doc.documentElement.dir,'rtl');assert.equal(doc.querySelector('a[hreflang="en"]').getAttribute('href'),'/');
 response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/'));assert.equal(new JSDOM(await response.text()).window.document.querySelector('h1').textContent,'Explore institutions');
 const latestEn=await call('/api/frontend-edit/inventory/?path=%2F');await call('/api/frontend-edit/save/',edit(latestEn,'/','Edited English heading'));
 response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/'));assert.equal(new JSDOM(await response.text()).window.document.querySelector('h1').textContent,'Edited English heading');
 response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/ar/'));assert.equal(new JSDOM(await response.text()).window.document.querySelector('h1').textContent,'عنوان عربي معدل');
 // A third configured active language uses the same adapter, not an Arabic-only branch.
 const recordInventory=await call('/api/frontend-edit/inventory/?path=%2Far%2F'),recordField=recordInventory.fields.find(field=>field.destination==='record-translation'&&field.text.includes('Campus'));
 assert.ok(recordField,'record translation has explicit routing');
 await call('/api/frontend-edit/save/',{path:'/ar/',token:recordInventory.token,operationId:crypto.randomUUID(),entries:[{id:recordField.id,text:'جامعة معدلة'}]});
 assert.equal((await call(root+'review/?locale=ar')).fields.find(field=>field.source==='Campus').translation,'جامعة معدلة','record edit reaches translation persistence');
 response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/ar/'));assert.ok((await response.text()).includes('جامعة معدلة'));
 response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/ar/'));assert.ok(!(await response.text()).includes('UNREVIEWED INTRO'),'unrelated translation drafts remain unpublished');
 response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/'));assert.ok((await response.text()).includes('Campus'),'source record copy stays English');
 let french=await call(root+'review/?locale=fr');for(let offset=0;offset<french.fields.length;offset+=16)await call(root+'save/',{locale:'fr',token:french.token,entries:french.fields.slice(offset,offset+16).map(field=>({id:field.id,token:field.token,text:'Français '+field.source}))});
 french=await call(root+'review/?locale=fr');const frenchPrepared=await call(root+'prepare/',{locale:'fr',token:french.token,approveTranslations:true});await call(root+'publish/',{hash:frenchPrepared.hash,expected:frenchPrepared.expected,approveTranslations:true});
 const fr=await call('/api/frontend-edit/inventory/?path=%2Ffr%2F');assert.equal(fr.locale,'fr');await call('/api/frontend-edit/save/',edit(fr,'/fr/','Titre modifié'));response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/fr/'));doc=new JSDOM(await response.text()).window.document;assert.equal(doc.querySelector('h1').textContent,'Titre modifié');assert.equal(doc.documentElement.lang,'fr');assert.equal(doc.documentElement.dir,'ltr');
 response=await renderReviewedSitePublication(f.db,owner,new Request('https://site.test/ar/'));assert.equal(new JSDOM(await response.text()).window.document.querySelector('h1').textContent,'عنوان عربي معدل');
 // Shared menu identity and row-key identity survive page/position changes.
 const shared={root:{},content:[{id:'managed-menu-123',type:'Navbar',props:{menuItems:[{id:'item-1',label:'Institutions',target:'/explore/'}]}}]};
 const fields=await copyFields('page-one',copyDisplayLayout(shared),'en',null),field=fields.find(field=>field.text==='Institutions'),copyStore=new FrontendCopyStore(f.db,owner),prior=await copyStore.read();
 await copyStore.save(prior.hash,[{id:field.id,source:field.source,locale:'en',text:'Browse institutions'}],crypto.randomUUID(),'admin',now);
 assert.equal((await projectFrontendCopy(f.db,owner,'page-two',shared,'en')).layout.content[0].props.menuItems[0].label,'Browse institutions');
 const binding={dataSourceId:'source',tableName:'institutions',columnOrder:['title']},rows=[{id:20,title:'Twenty'},{id:10,title:'Ten'}],list={root:{},content:[{id:'repeater',type:'Repeater',props:{binding,initialRows:rows}}]};
 const rowFields=await copyFields('one',copyDisplayLayout(list),'en',null),row=rowFields.find(field=>field.text==='Ten'),current=await copyStore.read();await copyStore.save(current.hash,[{id:row.id,source:row.source,locale:'en',text:'Ten edited'}],crypto.randomUUID(),'admin',now);
 const paged=await projectFrontendCopyRows(f.db,owner,binding,[rows[1]],'en');assert.equal(paged[0].title,'Ten edited');assert.equal((await projectFrontendCopyRows(f.db,owner,binding,[{id:10,title:'Ten changed'}],'en'))[0].title,'Ten changed');
 assert.equal(f.aiCalls(),0);console.log('frontend-edit-locales: real Arabic release, independent English/Arabic save+public reload, RTL/navigation, shared menus, keyed/hydrated records and source drift PASS');
}finally{f.close();}
