import assert from 'node:assert/strict';
import {renderPage} from '@frontbase/edge-core';
import {projectDirectoryRecords,projectDirectoryBrowsing} from '@frontbase/edge-core/directory/configuration';
import {compilePreparedBrowsing,componentRecorder} from '../operator-dist/prerender-browsing-compiler.mjs';
const {deliverPrerender,prerenderKey}=await import(process.env.FRONTBASE_BROWSING_TEST_MODULE??new URL('../operator-dist/prerender-delivery.mjs',import.meta.url).href);
const origin='https://fixture.invalid',siteHash='a'.repeat(64),base='/__frontbase_prerender/'+siteHash+'/';
for(const locale of ['en','ar']){
 const path=locale==='ar'?'/ar/explore/':'/explore/';
 const rows=Array.from({length:7},(_,i)=>({id:i+1,title:(locale==='ar'?'برنامج ':'Program ')+String(i+1),originalPath:'/program-'+(i+1)+'/'}));
 const layout={root:{},content:[{id:'programs',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.program.list',params:{}},directoryControls:{version:1,tabs:true,search:true,pagination:true,recordCount:true,sorting:true,filters:true,paginationPosition:'bottom'}},children:[{id:'card',type:'Container',props:{},children:[{id:'title',type:'Heading',props:{recordBindings:{text:'title'}}},{id:'link',type:'Link',props:{text:'View',recordBindings:{href:'originalPath'}}}]}]}]};
 const ctx={page:{id:'test',title:'Test',url:path,slug:path,description:'',published:true,createdAt:'',updatedAt:'',image:'',type:'page',custom:{}},user:null,visitor:{},url:{},system:{env:'test'},cookies:{},local:{},session:{},app:{},records:[]};
 let dependent=false,withoutControls=false;
 const render=async urlPath=>{
  const url=new URL(urlPath,origin),q=url.searchParams.get('q')??'',match=url.searchParams.get('match')??'contains',sort=url.searchParams.get('sort')??'title-asc',page=Number(url.searchParams.get('page')??1);
  const filtered=rows.filter(row=>!q||(match==='equals'?row.title===q:match==='startsWith'?row.title.startsWith(q):row.title.includes(q))).sort((a,b)=>(a.title<b.title?-1:1)*(sort==='title-desc'?-1:1));
  const selected=filtered.slice((page-1)*2,page*2);
  let projected=projectDirectoryRecords(layout,new Map([['programs',selected]]),{locale});
  projected=projectDirectoryBrowsing(projected,[{path,locale,collection:'program',q,page,pageSize:2,total:filtered.length,sort,match,hasNext:page*2<filtered.length,searchEnabled:true}]);
  const browsingState=[{path,locale,collection:'program',q,page,pageSize:2,total:filtered.length,sort,match,hasNext:page*2<filtered.length,searchEnabled:true}];
  if(withoutControls){const prune=nodes=>nodes.filter(node=>!node.props?.directoryBrowsing).map(node=>({...node,...(node.children?{children:prune(node.children)}:{})}));projected.content=prune(projected.content);}
  projected.content.unshift({id:'nav',type:'Navbar',props:{variant:'simple',languageSwitcher:['en','ar'].map(code=>({code,label:code,href:(code==='ar'?'/ar':'')+'/explore/'+url.search,current:code===locale}))}});
  for(let i=0;i<5;i++)projected.content.push({id:'hidden-controls-'+i,type:'Container',visibilityCondition:'1 == 2',props:{directoryBrowsing:{version:1,tabs:false,search:false,pagination:true},directoryBrowsingState:browsingState}});
  if(dependent)projected.content.push({id:'unsafe',type:'Text',props:{text:'{{ url.q }}'}});
  const observed=componentRecorder(),html=`<html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}"><body>${await renderPage(projected,{...ctx,url:Object.fromEntries(url.searchParams)},observed.observe)}</body></html>`;
  return {html,browsingState,components:observed.components,proof:{version:1,path:urlPath,origin,siteHash,owner:'tenant-a',bodyHash:await prerenderKey(html),checks:[{sql:'SELECT value FROM settings WHERE tenant_slug=? AND key=?',params:['tenant-a','source'],signature:'c'.repeat(64)}],headers:[['content-type','text/html'],['x-site-version',siteHash],['content-language',locale]]}};
 };
 const fragments=new Map(),plan=await compilePreparedBrowsing({path,collection:'program'},render,async(hash,html)=>{fragments.set(hash,html);});
 assert.equal(plan.index.length,7);assert.equal(fragments.size,7);
 const dynamic='dynamic-'+await prerenderKey(path+'?type=program')+'.json';let valid=true,checks=0,fragmentReads=0;
 const assets={fetch:async req=>{const file=new URL(req.url).pathname.slice(base.length);if(file==='complete.json')return Response.json({version:1,origin,hash:siteHash,routes:1});if(file===dynamic)return Response.json(plan);if(fragments.has(file.slice(0,-5))){fragmentReads++;return new Response(fragments.get(file.slice(0,-5)));}return new Response('',{status:404});}};
 const db={query:async()=>{checks++;return [{valid}];}};
 const request=s=>new Request(origin+path+'?type=program&'+s);
 let response=await deliverPrerender(request('page=2'),assets,()=>db,siteHash),html=await response.text();
 assert.equal(response.status,200);assert.equal(response.headers.get('x-frontbase-render'),'compiled-browsing');assert.ok(html.includes(rows[2].title));assert.ok(!html.includes(rows[0].title));assert.equal(fragmentReads,2);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size,'cards retain unique IDs across pages');
 assert.ok(html.includes('href="/ar/explore/?type=program&amp;page=2"'),'language switching retains the active query');
 response=await deliverPrerender(request('q='+encodeURIComponent(rows[5].title)+'&match=equals'),assets,()=>db,siteHash);html=await response.text();assert.ok(html.includes(rows[5].title));assert.ok(!html.includes(rows[0].title));
 response=await deliverPrerender(request('q='+encodeURIComponent('<script>alert(1)</script>')),assets,()=>db,siteHash);html=await response.text();assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('&lt;script&gt;'));
 for(const params of ['page=0','page=2&page=3','q='+('x'.repeat(101)),'sort=unsafe','other=x'])assert.equal((await deliverPrerender(request(params),assets,()=>db,siteHash)).status,400);
 valid=false;const before=fragmentReads;assert.equal((await deliverPrerender(request('page=2'),assets,()=>db,siteHash)).status,503);assert.equal(fragmentReads,before,'stale proof cannot load cards');assert.ok(checks>=4);
 valid=true;
 const originalHref=plan.switchers[0].links[0].href;plan.switchers[0].links[0].href='https://other.invalid/';assert.equal((await deliverPrerender(request('page=2'),assets,()=>db,siteHash)).status,503);plan.switchers[0].links[0].href=originalHref;
 plan.switchers[0].links[0].href=originalHref+'?unexpected=1';assert.equal((await deliverPrerender(request('page=2'),assets,()=>db,siteHash)).status,503);plan.switchers[0].links[0].href=originalHref;
 for(const [field,value] of [['origin','https://other.invalid'],['siteHash','d'.repeat(64)],['path','/other/']]){const previous=plan.proof[field];plan.proof[field]=value;assert.equal((await deliverPrerender(request('page=2'),assets,()=>db,siteHash)).status,503);plan.proof[field]=previous;}
 const fragment=plan.index[0].fragment;plan.index[0].fragment='../../outside';assert.equal((await deliverPrerender(request('page=2'),assets,()=>db,siteHash)).status,503);plan.index[0].fragment=fragment;
 withoutControls=true;const noControls=await compilePreparedBrowsing({path,collection:"program"},render,async()=>{});assert.equal(noControls.controls.length,0);assert.equal(noControls.index.length,7);withoutControls=false;
 dependent=true;await assert.rejects(()=>compilePreparedBrowsing({path,collection:'program'},render,async()=>{}),/Query-dependent/);
 console.log('Compiled browsing passed: '+locale+' filtering, pagination, unique IDs, escaped inputs, freshness and unsupported layout refusal');
}
