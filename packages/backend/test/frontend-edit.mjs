import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {createCompatApp} from '../dist/compat/app.js';
import {FrontendCopyStore,projectFrontendCopy,copyFields,copyDisplayLayout} from '../dist/compat/frontend-copy.js';
import {withFrontendEditor,FRONTEND_EDITOR_SCRIPT} from '../dist/compat/frontend-editor.js';
import {JSDOM,VirtualConsole} from 'jsdom';
import {sameEditorOrigin} from '../dist/compat/routes/frontend-edit.js';
const now='2026-10-22T20:00:00Z';let count=0;
async function test(name,run){await run();console.log('ok - '+name);count++;}
async function fixture(){const db=sqliteRunner(':memory:');await migrateUp(db);const pages=new PagesStore(db,'alpha');const layout={root:{},content:[{id:'hero',type:'Heading',props:{text:'Study in USA'}},{id:'intro',type:'Text',props:{content:'Find your next step'}}]};const page=await pages.create({name:'Home',slug:'home',layout_data:layout},crypto.randomUUID(),now);await pages.update(page.id,{isHomepage:true},now);await pages.publish(page.id,'local',now);let role='owner',tenant='alpha',authed=true;const app=await createCompatApp({makeRunner:async()=>db,resolvePrincipal:async()=>({user:authed?{id:'admin',role}:null,tenant}),sessionSecret:'synthetic-editor-only',now:()=>now});return{db,pages,layout,page,app,setRole:v=>role=v,setOwner:v=>tenant=v,setAuthed:v=>authed=v};}
const inventory=async f=>{const res=await f.app.request('/api/frontend-edit/inventory/?path=%2F');assert.equal(res.status,200,await res.clone().text());return res.json();};
const save=(f,state,entries,headers={})=>f.app.request('/api/frontend-edit/save/',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost','X-Frontbase-Editor':'1',...headers},body:JSON.stringify({path:'/',token:state.token,operationId:crypto.randomUUID(),entries})});
await test('rows without a stable record key never receive positional edit authority',async()=>{const layout=copyDisplayLayout({root:{},content:[{id:'list',type:'Repeater',props:{binding:{dataSourceId:'data',tableName:'rows',columnOrder:['title']},initialRows:[{title:'Same title'},{title:'Same title'}]}}]});assert.equal((await copyFields('page',layout,'en',null)).filter(field=>field.path.includes('initialRows')).length,0);});
await test('proxy origin checks preserve exact authority without trusting forwarded headers',async()=>{assert.equal(sameEditorOrigin(new Request('http://site.example/api/frontend-edit/save/',{headers:{Origin:'https://site.example'}})),true);for(const Origin of ['https://evil.example','https://site.example:444','https://site.example/path','null'])assert.equal(sameEditorOrigin(new Request('http://site.example/api/frontend-edit/save/',{headers:{Origin,'X-Forwarded-Host':'evil.example','X-Forwarded-Proto':'https'}})),false);assert.equal(sameEditorOrigin(new Request('https://site.example/api/frontend-edit/save/',{headers:{Origin:'http://site.example'}})),false);});
await test('field inventory performs no write; explicit page batch commits both text fields together',async()=>{const f=await fixture(),state=await inventory(f);assert.equal((await new FrontendCopyStore(f.db,'alpha').read()).hash,null);const entries=state.fields.filter(x=>['hero','intro'].includes(x.blockId)).map(x=>({id:x.id,text:'Updated '+x.text}));assert.equal((await save(f,state,entries)).status,200);const projected=await projectFrontendCopy(f.db,'alpha',f.page.id,f.layout,'en');assert.equal(projected.layout.content[0].props.text,'Updated Study in USA');assert.equal(projected.layout.content[1].props.content,'Updated Find your next step');assert.deepEqual(JSON.parse((await f.pages.get(f.page.id)).layout_data),f.layout);assert.equal((await f.app.request('/api/pages/'+f.page.id+'/')).status,200);const builder=await(await f.app.request('/api/pages/'+f.page.id+'/')).json();assert.equal(builder.data.layoutData.content[0].props.text,'Updated Study in USA');});
await test('stale tabs, missing fields, forged paths and markup cannot change active copy',async()=>{const f=await fixture(),state=await inventory(f),id=state.fields[0].id;for(const text of ['<script>alert(1)</script>','{{record.secret}}','@{user.password}',''])assert.equal((await save(f,state,[{id,text}])).status,409);assert.equal((await save(f,state,[{id:'a'.repeat(64),text:'forged'}])).status,409);assert.equal((await save(f,state,[{id,text:'First'}])).status,200);const before=await new FrontendCopyStore(f.db,'alpha').read();assert.equal((await save(f,state,[{id,text:'Stale'}])).status,409);assert.deepEqual(await new FrontendCopyStore(f.db,'alpha').read(),before);for(const path of ['https://evil.example/','//evil.example/','/api/auth/me/','/frontbase-admin/'])assert.notEqual((await f.app.request('/api/frontend-edit/inventory/?path='+encodeURIComponent(path))).status,200);});
await test('anonymous/member/cross-tenant and cross-origin saves fail closed; bootstrap has no inventory',async()=>{const f=await fixture(),state=await inventory(f),entries=[{id:state.fields[0].id,text:'No'}];for(const role of ['member','viewer','editor']){f.setRole(role);assert.equal((await save(f,state,entries)).status,403);}f.setRole('owner');for(const headers of [{Origin:'https://evil.example'},{'X-Frontbase-Editor':''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await save(f,state,entries,headers)).status,403);f.setOwner('beta');assert.equal((await save(f,state,entries)).status,409);f.setOwner('alpha');f.setAuthed(false);assert.equal((await save(f,state,entries)).status,401);assert.deepEqual(await(await f.app.request('/api/frontend-edit/capability/')).json(),{enabled:false});assert.equal((await f.app.request('/api/frontend-edit/script.js')).status,200);assert.ok(!FRONTEND_EDITOR_SCRIPT.includes(f.page.id));assert.equal((await new FrontendCopyStore(f.db,'alpha').read()).hash,null);});
await test('source drift invalidates only the changed field; locales remain independent',async()=>{const f=await fixture(),display=copyDisplayLayout(f.layout),en=await copyFields(f.page.id,display,'en',null),ar=await copyFields(f.page.id,display,'ar',null),store=new FrontendCopyStore(f.db,'alpha');const a=await store.save(null,[{id:en[0].id,source:en[0].source,locale:'en',text:'New title'},{id:ar[0].id,source:ar[0].source,locale:'ar',text:'عنوان عربي'}],crypto.randomUUID(),'admin',now);assert.equal((await projectFrontendCopy(f.db,'alpha',f.page.id,f.layout,'ar')).layout.content[0].props.text,'عنوان عربي');const changed=structuredClone(f.layout);changed.content[0].props.text='Changed upstream';assert.equal((await projectFrontendCopy(f.db,'alpha',f.page.id,changed,'en')).layout.content[0].props.text,'Changed upstream');assert.equal((await new FrontendCopyStore(f.db,'beta').read()).hash,null);assert.equal((await store.read()).hash,a.hash);});
await test('competing page batches have exactly one winner and immutable recoverable receipt',async()=>{const f=await fixture(),state=await inventory(f),id=state.fields[0].id;const results=await Promise.all([save(f,state,[{id,text:'One'}]),save(f,state,[{id,text:'Two'}])]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const current=await new FrontendCopyStore(f.db,'alpha').read();assert.equal(current.catalog.entries.length,1);assert.ok(['One','Two'].includes(current.catalog.entries[0].text));const rows=await f.db.query("SELECT key FROM settings WHERE tenant_slug=? AND key LIKE ?",['alpha','frontend_copy:version:v1:%']);assert.ok(rows.length>=1);});
await test('existing pointer CAS admits one concurrent replacement without last-writer-wins',async()=>{const f=await fixture(),store=new FrontendCopyStore(f.db,'alpha'),fields=await copyFields(f.page.id,copyDisplayLayout(f.layout),'en',null),entry={id:fields[0].id,locale:'en',source:fields[0].source,text:'Initial'};const first=await store.save(null,[entry],crypto.randomUUID(),'admin',now);const results=await Promise.allSettled(['A','B'].map(text=>store.save(first.hash,[{...entry,text}],crypto.randomUUID(),'admin',now)));assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);});
await test('host injection excludes administration, API, errors, HEAD and non-HTML',async()=>{for(const[path,status,type,method]of [['/frontbase-admin/',200,'text/html','GET'],['/api/x',200,'text/html','GET'],['/',503,'text/html','GET'],['/',200,'application/json','GET'],['/',200,'text/html','HEAD']]){const res=await withFrontendEditor(new Response('<body>x</body>',{status,headers:{'Content-Type':type}}),new Request('https://site.example'+path,{method}));assert.ok(!(await res.text()).includes('frontend-edit/script'));}const res=await withFrontendEditor(new Response('<body>x</body>',{headers:{'Content-Type':'text/html'}}),new Request('https://site.example/'));assert.ok((await res.text()).includes('/api/frontend-edit/script.js'));assert.equal(res.headers.get('cache-control'),'no-store');});
await test('actual browser controller stages/re-edits/reverts/cancels before one explicit page save',async()=>{
 const f=await fixture(),dom=new JSDOM('<html lang="en"><body><h1 id="hero">Study in USA</h1><p id="intro">Find your next step</p></body></html>',{url:'http://localhost/',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const {window:w}=dom;let writes=0,finished=false;
 Object.defineProperty(w.crypto,'randomUUID',{value:()=>crypto.randomUUID()});
 w.fetch=async(path,init={})=>{const isWrite=init.method==='POST';if(isWrite)writes++;const response=await f.app.request(new URL(path,w.location.href).href,{...init,headers:{...init.headers,...(isWrite?{Origin:w.location.origin}:{})}});if(isWrite)finished=true;return response;};
 w.localStorage.setItem('frontbase:frontend-edit-dock','open');
 await w.eval(FRONTEND_EDITOR_SCRIPT);const d=w.document,click=label=>{const b=[...d.querySelectorAll('[data-frontbase-editor] button')].find(b=>b.getAttribute('aria-label')===label);assert.ok(b,label);b.click();};
 const first=d.querySelector('#hero [data-fb-copy]'),second=d.querySelector('#intro [data-fb-copy]');assert.ok(first);assert.ok(second);
 let pageClickActions=0;d.addEventListener('click',()=>pageClickActions++,true);
 first.click();assert.equal(pageClickActions,0,'editor intercepts configured document click actions');first.textContent='First edit';click('Done');assert.equal(writes,0);assert.ok(first.hasAttribute('data-dirty'));
 first.click();first.textContent='Re-edited';click('Done');assert.equal(first.textContent,'Re-edited');assert.equal(writes,0);click('Undo last edit');assert.equal(first.textContent,'First edit');
 second.click();second.textContent='Second edit';click('Done');first.click();click('Revert this change');assert.equal(first.textContent,'Study in USA');assert.equal(second.textContent,'Second edit');assert.equal(writes,0);
 click('Cancel Changes');assert.equal(second.textContent,'Find your next step');assert.equal((await new FrontendCopyStore(f.db,'alpha').read()).hash,null);
 first.click();first.textContent='Keyboard edit';first.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(first.textContent,'Study in USA');
 first.click();first.textContent='Saved title';click('Done');second.click();second.textContent='Saved paragraph';click('Save Changes');
 for(let i=0;i<100&&!finished;i++)await new Promise(r=>setTimeout(r,5));assert.equal(finished,true);assert.equal(writes,1);
 const projected=await projectFrontendCopy(f.db,'alpha',f.page.id,f.layout,'en');assert.equal(projected.layout.content[0].props.text,'Saved title');assert.equal(projected.layout.content[1].props.content,'Saved paragraph');dom.window.close();
});
await test('responsive menu copies share one staged field while independent equal labels stay ambiguous',async()=>{
 const fields=[{id:'a',blockId:'managed-menu-header',path:['label'],text:'Programs',label:'Navigation'},{id:'b',blockId:'managed-menu-ambiguous',path:['one'],text:'Same',label:'First'},{id:'c',blockId:'managed-menu-ambiguous',path:['two'],text:'Same',label:'Second'}];
 const dom=new JSDOM('<html lang="en"><body><header id="managed-menu-header"><a href="/programs">Programs</a><a href="/programs">Programs</a></header><div id="managed-menu-ambiguous"><a href="/a">Same</a><a href="/b">Same</a></div></body></html>',{url:'https://site.example/',runScripts:'outside-only'});
 dom.window.localStorage.setItem('frontbase:frontend-edit-dock','open');
 dom.window.fetch=async path=>Response.json(String(path).includes('capability')?{enabled:true}:{fields,token:'x'});await dom.window.eval(FRONTEND_EDITOR_SCRIPT);
 const spans=dom.window.document.querySelectorAll('[data-fb-copy="a"]');assert.equal(spans.length,2);assert.equal(dom.window.document.querySelectorAll('#managed-menu-ambiguous [data-fb-copy]').length,0);spans[0].click();spans[0].textContent='Courses';[...dom.window.document.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='Done').click();assert.equal(spans[1].textContent,'Courses');assert.match(dom.window.document.querySelector('[data-edit-status]').textContent,/1 unsaved/);dom.window.close();
});

await test('the pencil gates editing, preserves pending edits and restores ordinary interaction when minimized',async()=>{
 const page=(path,preference,allowed=true)=>{
  const dom=new JSDOM('<html lang="ar" dir="rtl"><body><header id="managed-menu-header"><a href="#elsewhere">عنوان</a></header></body></html>',{url:'https://site.example'+path,runScripts:'outside-only'});
  const w=dom.window,requests=[];
  if(preference)w.localStorage.setItem('frontbase:frontend-edit-dock',preference);
  w.fetch=async path=>{requests.push(path);return Response.json(path.includes('capability')?{enabled:allowed}:{pageId:'page-1',locale:'ar',fields:[{id:'title',blockId:'managed-menu-header',path:['text'],text:'عنوان',label:'Title'}]});};
  return {w,requests};
 };
 const first=page('/',null),w=first.w,d=w.document;
 await w.eval(FRONTEND_EDITOR_SCRIPT);
 const toggle=d.querySelector('[data-pencil]');
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 assert.equal(first.requests.length,1);
 assert.equal(d.querySelector('[data-fb-copy]'),null);
 toggle.click();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(toggle.getAttribute('aria-expanded'),'true');
 assert.equal(d.querySelector('[data-frontbase-editor]').dir,'rtl');
 assert.deepEqual([...d.querySelectorAll('[data-frontbase-editor] a')].map(a=>[a.pathname,a.search]),[
  ['/frontbase-admin/builder/page-1',''],['/frontbase-admin/builder/page-1','?panel=version-history']
 ]);
 const edit=d.querySelector('[data-fb-copy]');edit.click();edit.textContent='تعديل';edit.dispatchEvent(new w.Event('input',{bubbles:true}));
 const context=d.querySelector('[data-frontbase-edit-context]');
 assert.match(context.textContent,/الترويسة المشتركة/);
 assert.equal(context.hidden,false);
 assert.equal(edit.getAttribute('aria-describedby'),context.id);
 assert.equal(d.querySelector('[data-frontbase-editor]').contains(context),false);
 toggle.click();
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 assert.ok(toggle.hasAttribute('data-dirty'));
 assert.equal(d.querySelector('[data-fb-copy], [contenteditable]'),null);
 assert.equal(context.hidden,true);
 assert.equal(d.querySelector('header').textContent,'عنوان');
 let ordinaryClicks=0;d.querySelector('header a').addEventListener('click',event=>{ordinaryClicks++;event.preventDefault();});
 edit.click();assert.equal(ordinaryClicks,1);
 toggle.click();
 assert.equal(toggle.getAttribute('aria-expanded'),'true');
 assert.equal(d.querySelector('[data-fb-copy]').textContent,'تعديل');
 assert.equal(first.requests.length,2,'reopening without navigation uses the same inventory');
 [...d.querySelectorAll('[data-frontbase-editor] button')].find(button=>button.getAttribute('aria-label')==='عرض كزائر').click();
 const second=page('/another/',w.localStorage.getItem('frontbase:frontend-edit-dock'));w.close();
 await second.w.eval(FRONTEND_EDITOR_SCRIPT);assert.equal(second.requests.length,1);
 const nextToggle=second.w.document.querySelector('[data-pencil]');assert.equal(nextToggle.getAttribute('aria-expanded'),'false');
 nextToggle.click();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(nextToggle.getAttribute('aria-expanded'),'true');
 assert.equal(second.requests.length,2);assert.ok(second.requests[1].includes(encodeURIComponent('/another/')));
 second.w.close();
 const visitor=page('/',null,false);await visitor.w.eval(FRONTEND_EDITOR_SCRIPT);
 assert.equal(visitor.w.document.querySelector('[data-frontbase-editor]'),null);visitor.w.close();
});
await test('Edit record targets the detail heading and follows an explicitly selected related record',async()=>{
 const dom=new JSDOM('<html lang="en"><body><h1 id="program">Advertising</h1><p id="institution">Washington State University</p></body></html>',{url:'https://site.example/program/',runScripts:'outside-only'});
 const w=dom.window,d=w.document;
 w.localStorage.setItem('frontbase:frontend-edit-dock','open');
 w.fetch=async path=>Response.json(path.includes('capability')?{enabled:true}:{locale:'en',fields:[
  {id:'program',blockId:'program',text:'Advertising',recordScope:'programs'},
  {id:'institution',blockId:'institution',text:'Washington State University',recordScope:'institutions'}
 ].map(field=>({...field,path:['text'],recordKey:'same-id',label:'Title',destination:'record'}))});
 await w.eval(FRONTEND_EDITOR_SCRIPT);
 const shortcut=[...d.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='Edit record');
 assert.equal(shortcut.hidden,false);
 shortcut.click();const program=d.querySelector('#program [contenteditable]');assert.ok(program);
 program.getClientRects=()=>[{top:180,left:24,right:174,bottom:204}];
 w.dispatchEvent(new w.Event('scroll'));
 const context=d.querySelector('[data-frontbase-edit-context]');
 assert.equal(context.textContent,'English · Record content');
 assert.equal(context.style.top,'178px');assert.equal(context.style.left,'24px');
 d.querySelector('#institution [data-fb-copy]').click();
 shortcut.click();assert.ok(d.querySelector('#institution [contenteditable]'));
 w.close();
});
console.log(count+' frontend editing groups passed');
