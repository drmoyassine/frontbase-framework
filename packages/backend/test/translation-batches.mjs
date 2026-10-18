import assert from 'node:assert/strict';
import {allowanceFixture,now} from './translation-allowance-fixture.mjs';
import {createCompatApp} from '../dist/compat/app.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {deferred} from '../../translation/test/job-fixtures.mjs';

const root='/api/project/translation-batches/';
async function setup(enabled=true){
 const f=await allowanceFixture(),pages=new PagesStore(f.db,'alpha');
 const nodes=[{id:'heading',type:'Heading',props:{content:'Apply'}},{id:'text',type:'Text',props:{content:'Study abroad'}}];
 await pages.create({name:'Discovery',slug:'discovery',layout_data:{content:nodes,root:{}}},'page',now);
 await new PagesStore(f.db,'beta').create({name:'Foreign',slug:'foreign',layout_data:{content:nodes,root:{}}},'foreign',now);
 let role='owner',tenant='alpha',authenticated=true;
 const makeApp=()=>createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch,
  ...(enabled?{translationExecutionEnabled:true}:{}),resolvePrincipal:async()=>({user:authenticated?{id:'editor',role}:null,tenant})});
 let app=await makeApp();
 const request=(path='',method='GET',body)=>app.request(root+path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const selection=field=>({pageId:'page',blockId:field==='content'?'heading':'text',field:'content'});
 const input={targetLocale:'ar',selections:[selection('content')],limits:{maxRequests:1,maxConcurrent:1,maxMessageBytes:65536}};
 async function json(path,method,body,status=200){const r=await request(path,method,body);assert.equal(r.status,status,await r.clone().text());const result=await r.json();assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|data\.example\.test|serviceKey|api_key/);return result;}
 const plan=(body=input)=>json('plans/','POST',body,201);
 const action=(p,kind,extra={})=>json(p.id+'/'+kind+'/','POST',{reviewHash:p.reviewHash,...extra});
 const start=p=>action(p,'start',{approveContentTransmission:true});
 const step=p=>action(p,'continue');
 const status=p=>json(p.id+'/');
 const cancel=(p,extra={})=>action(p,'cancel',extra);
 return {...f,pages,nodes,input,request,json,plan,start,step,status,cancel,action,
  setRole:value=>{role=value},setTenant:value=>{tenant=value},setAuth:value=>{authenticated=value},restart:async()=>{app=await makeApp()},
  edit:content=>pages.update('page',{layoutData:{content,root:{}}},now)};
}
async function queued(f,p){await f.start(p);for(let i=0;i<p.items.length;i++)await f.step(p);assert.equal((await f.status(p)).state,'queued');}
async function closed(f,p,extra={}){let result;for(let i=0;i<5;i++){result=await f.cancel(p,extra);if(result.state==='closed')return result;}return result;}
{
 const f=await setup(),p=await f.plan();assert.equal(f.aiCalls(),0);assert.equal(p.items[0].text,'Apply');assert.equal(p.monetaryEstimate,null);
 assert.equal((await f.status(p)).state,'planned');
 assert.equal((await f.db.query('SELECT value FROM settings WHERE key=?',['translation_allowance:v1'])).length,0,'planning creates no allowance');
 assert.equal((await f.json()).executionAvailable,true);
 for(const actor of ['viewer','user']){f.setRole(actor);for(const [path,method,body] of [['','GET'],['plans/','POST',f.input],[p.id+'/','GET'],...['start','continue','cancel'].map(a=>[p.id+'/'+a+'/','POST',{reviewHash:p.reviewHash,approveContentTransmission:true}])])assert.equal((await f.request(path,method,body)).status,403);}
 f.setRole('owner');f.setAuth(false);assert.equal((await f.request()).status,401);assert.equal((await f.request('plans/','POST',f.input)).status,401);f.setAuth(true);
 f.setTenant('beta');assert.equal((await f.request(p.id+'/')).status,404);assert.equal((await f.request(p.id+'/start/','POST',{reviewHash:p.reviewHash,approveContentTransmission:true})).status,409);f.setTenant('alpha');
 for(const extra of [{},{approveContentTransmission:false},{approveContentTransmission:true,tenant:'beta'},{approveContentTransmission:true,reviewHash:'0'.repeat(64)}])assert.equal((await f.request(p.id+'/start/','POST',{reviewHash:p.reviewHash,...extra})).status,409);
 await f.start(p);await f.start(p);assert.equal(f.aiCalls(),0,'start only approves and allocates');await f.step(p);assert.equal(f.aiCalls(),0,'preparation does not dispatch');
 await f.restart();await Promise.all([f.step(p),f.step(p)]);assert.equal(f.aiCalls(),1,'concurrent continuations lease one request');
 const result=await f.status(p);assert.equal(result.items[0].state,'completed');assert.equal(result.items[0].result,'قدّم');assert.equal(result.items[0].accounting,'settled');
 await f.step(p);assert.equal((await f.status(p)).state,'done');await f.step(p);assert.equal(f.aiCalls(),1);assert.equal((await closed(f,p)).lifecycle.totals.consumedRequests,1);
 const next=await f.plan();await f.start(next);await closed(f,next);assert.equal(f.aiCalls(),1);f.close();
}
{
 const f=await setup(false),p=await f.plan();assert.equal((await f.json()).executionAvailable,false);
 for(const action of ['start','continue'])assert.equal((await f.request(p.id+'/'+action+'/','POST',{reviewHash:p.reviewHash,approveContentTransmission:true})).status,503);
 assert.equal((await f.cancel(p)).state,'closed');assert.equal(f.aiCalls(),0);f.close();
}
{
 const f=await setup();
 for(const input of [{...f.input,tenant:'beta'},{...f.input,selections:[{...f.input.selections[0],pageId:'foreign'}]}, {...f.input,selections:[...f.input.selections,...f.input.selections]}, {...f.input,targetLocale:'fr'}, {...f.input,limits:{...f.input.limits,maxRequests:5}}])assert.equal((await f.request('plans/','POST',input)).status,422);
 assert.equal((await f.request('plans/','POST',{...f.input,padding:'x'.repeat(17000)})).status,422);
 for(const node of [{id:'heading',type:'Heading',binding:{kind:'record'},props:{content:'Apply'}},{id:'heading',type:'Image',props:{content:'Apply'}},{id:'heading',type:'Heading',props:{content:'Hello {{name}}'}},{id:'heading',type:'Heading',props:{content:'<b>HTML</b>'}}, {id:'wrapper',type:'Repeater',props:{},children:[f.nodes[0]]}]){await f.edit([node]);assert.equal((await f.request('plans/','POST',f.input)).status,422);}
 await f.edit(f.nodes);const p=await f.plan();await f.edit([{...f.nodes[0],props:{content:'Changed'}}]);assert.equal((await f.request(p.id+'/start/','POST',{reviewHash:p.reviewHash,approveContentTransmission:true})).status,409);assert.equal(f.aiCalls(),0);f.close();
}
{
 const f=await setup(),p=await f.plan({...f.input,selections:[f.input.selections[0],{pageId:'page',blockId:'text',field:'content'}],limits:{...f.input.limits,maxRequests:2}});
 await f.start(p);await f.step(p);assert.equal((await f.status(p)).preparedItems,1);assert.equal(f.aiCalls(),0);await f.step(p);assert.equal((await f.status(p)).state,'queued');
 await f.step(p);assert.equal(f.aiCalls(),1);await f.step(p);assert.equal(f.aiCalls(),2);await f.step(p);assert.equal((await f.status(p)).state,'done');await closed(f,p);f.close();
}
{
 const f=await setup(),p=await f.plan();await queued(f,p);
 await f.generation.save({...f.configuration,model:'changed'},1,now);
 assert.equal((await f.request(p.id+'/continue/','POST',{reviewHash:p.reviewHash})).status,409);assert.equal(f.aiCalls(),0);await closed(f,p);f.close();
}
{
 const f=await setup(),p=await f.plan();await queued(f,p);f.setHook(()=>f.edit([{...f.nodes[0],props:{content:'Changed during AI'}}]));
 await f.step(p);const result=await f.status(p);assert.equal(f.aiCalls(),1);assert.equal(result.items[0].state,'cancelled');assert.equal(result.items[0].result,null);assert.equal(result.items[0].accounting,'settled');assert.equal(result.items[0].outdated,true);await closed(f,p);f.close();
}
for(const failure of ['throwAI','withoutUsage']){
 const f=await setup(),p=await f.plan();await queued(f,p);f[failure]();await f.step(p);assert.equal(f.aiCalls(),1);
 const result=await closed(f,p);assert.equal(result.state,'cancelling');assert.equal(result.lifecycle.totals.retainedUnknownRequests,1);
 const next=await f.plan();assert.equal((await f.request(next.id+'/start/','POST',{reviewHash:next.reviewHash,approveContentTransmission:true})).status,409);
 assert.equal((await closed(f,p,{unknownDisposition:'count-as-consumed'})).state,'closed');await f.start(next);await closed(f,next);assert.equal(f.aiCalls(),1);f.close();
}
{
 const f=await setup(),p=await f.plan();await queued(f,p);f.setDispatchHook(()=>f.edit([{...f.nodes[0],props:{content:'Changed before call'}}]));
 await f.step(p);assert.equal(f.aiCalls(),0,'final dispatch revalidates the source');await closed(f,p,{unknownDisposition:'count-as-consumed'});f.close();
}
{
 const f=await setup(),p=await f.plan();await queued(f,p);await f.step(p);await f.edit([{...f.nodes[0],props:{content:'New private source'}}]);
 assert.equal((await f.status(p)).items[0].result,null,'old draft is not exposed for changed source');assert.equal(f.aiCalls(),1);await closed(f,p);f.close();
}
{
 const f=await setup(),p=await f.plan();
 const key='translation_batch:v1:'+p.id,row=(await f.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha',key]))[0];
 const record=JSON.parse(row.value);record.review.items[0].intent.providerId='foreign';await f.db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[JSON.stringify(record),'alpha',key]);
 assert.equal((await f.request(p.id+'/')).status,404,'mutated review cannot be read');assert.equal((await f.request(p.id+'/start/','POST',{reviewHash:p.reviewHash,approveContentTransmission:true})).status,409);assert.equal(f.aiCalls(),0);f.close();
}
// A lost response after remote enqueue replays the same source and job, then advances once.
{
 const f=await setup(),p=await f.plan();await f.start(p);const exec=f.db.exec.bind(f.db);let lost=false;
 f.db.exec=async(sql,args)=>{if(!lost&&sql.startsWith('UPDATE settings SET value')&&args?.[3]==='translation_batch:v1:'+p.id){lost=true;throw Error('lost_progress_write')}return exec(sql,args)};
 assert.equal((await f.request(p.id+'/continue/','POST',{reviewHash:p.reviewHash})).status,409);assert.equal((await f.status(p)).preparedItems,0);assert.equal(f.aiCalls(),0);
 await f.restart();await f.step(p);assert.equal((await f.status(p)).preparedItems,1);await f.step(p);assert.equal(f.aiCalls(),1);await closed(f,p);f.close();
}
{
 const f=await setup(),p=await f.plan();await queued(f,p);const started=deferred(),finish=deferred();f.setHook(async()=>{started.resolve();await finish.promise});
 const running=f.step(p);await started.promise;await closed(f,p);finish.resolve();await running;
 const result=await f.status(p);assert.equal(result.items[0].state,'cancelled');assert.equal(result.items[0].result,null);assert.equal(f.aiCalls(),1);await closed(f,p,{unknownDisposition:'count-as-consumed'});f.close();
}
// Cancellation between checkpoint read and INSERT/replacement UPDATE cannot mint an orphan allowance.
for(const replace of [false,true]){
 const f=await setup();if(replace){const prior=await f.plan();await f.start(prior);await closed(f,prior);}
 const before=await f.db.query('SELECT value FROM settings WHERE key=?',['translation_allowance:v1']);
 const p=await f.plan(),reached=deferred(),resume=deferred(),exec=f.db.exec.bind(f.db);let blocked=false;
 f.db.exec=async(sql,args)=>{if(!blocked&&(replace?sql.startsWith('UPDATE settings')&&args?.[3]==='translation_allowance:v1':sql.startsWith('INSERT INTO settings')&&args?.[1]==='translation_allowance:v1')){blocked=true;reached.resolve();await resume.promise;}return exec(sql,args)};
 const starting=f.request(p.id+'/start/','POST',{reviewHash:p.reviewHash,approveContentTransmission:true});await reached.promise;
 assert.equal((await f.cancel(p)).state,'closed');resume.resolve();assert.equal((await starting).status,409);
 assert.deepEqual(await f.db.query('SELECT value FROM settings WHERE key=?',['translation_allowance:v1']),before);assert.equal(f.aiCalls(),0);f.close();
}
// A stale preparation checkpoint cannot overwrite a concurrent cancellation.
{
 const f=await setup(),p=await f.plan();await f.start(p);const reached=deferred(),resume=deferred(),exec=f.db.exec.bind(f.db);let blocked=false;
 f.db.exec=async(sql,args)=>{if(!blocked&&sql.startsWith('UPDATE settings')&&args?.[3]==='translation_batch:v1:'+p.id&&JSON.parse(args[0]).phase==='queued'){blocked=true;reached.resolve();await resume.promise;}return exec(sql,args)};
 const preparing=f.step(p);await reached.promise;assert.equal((await closed(f,p)).state,'closed');resume.resolve();await preparing;
 assert.equal((await f.status(p)).state,'closed');
 const raw=JSON.parse((await f.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha','translation_batch:v1:'+p.id]))[0].value);
 assert.equal(raw.phase,'closed','exact-value progress CAS preserves cancellation');assert.equal(f.aiCalls(),0);f.close();
}
console.log('translation-batches PASS: authenticated sealed review, owned native text, explicit gate/consent, stable bounded restart/concurrency, source/settings fences, conservative reconciliation, no-call status and cancellation/allocation race');
