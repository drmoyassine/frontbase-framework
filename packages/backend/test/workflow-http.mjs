import assert from 'node:assert/strict';
import {Hono} from 'hono';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
import {runAndRecordAt,recoverStuckExecutions} from '../dist/routes/phase2.js';
import {workflowHttpOptions} from '../dist/workflow-http.js';
import {registerSystemQueueRoutes} from '../dist/compat/routes/system-queue.js';
import {registerEmailInboundRoutes} from '../dist/compat/routes/email-inbound.js';
const runner=sqliteRunner(':memory:'),now=()=>new Date().toISOString(),storeFor=t=>new Phase2Store(runner,t),tenant='owned';
await migrateUp(runner);let calls=0,raw=0;const previous=globalThis.fetch;
globalThis.fetch=async()=>{raw++;throw Error('RAW_FETCH_FORBIDDEN');};
const options=workflowHttpOptions(async(input,init)=>{calls++;assert.equal(String(input),'https://public.example/check');assert.equal(init.redirect,'manual');return Response.json({accepted:true});});
const graph=url=>({name:'HTTP fixture',nodes:JSON.stringify([{id:'trigger',type:'email_trigger',position:{x:0,y:0}},{id:'http',type:'http_request',position:{x:1,y:1},inputs:[{name:'url',value:url},{name:'method',value:'GET'}]}]),edges:JSON.stringify([{source:'trigger',target:'http'}])});
const store=storeFor(tenant),good=graph('https://public.example/check'),bad=graph('https://127.0.0.1/private');
try{
 await store.upsertWorkflow({id:'good',...good},now());await store.upsertWorkflow({id:'bad',...bad},now());
 for(const[id,wf]of [['good',good],['bad',bad]]){await store.createExecution('direct-'+id,id,'manual',now(),{});await runAndRecordAt(store,'direct-'+id,id,tenant,wf,{},now,options);assert.equal((await store.getExecution('direct-'+id)).status,id==='good'?'completed':'error');}
 assert.equal(calls,1);
 await store.createExecution('recover','good','manual','2000-01-01T00:00:00Z',{});await recoverStuckExecutions(storeFor,now,'2001-01-01T00:00:00Z',options);assert.equal((await store.getExecution('recover')).status,'completed');assert.equal(calls,2);
 const app=new Hono();registerSystemQueueRoutes(app,{phase2For:storeFor,resolver:{queueFor:async()=>({verifyInbound:async()=>true})},now,executionOptions:options});
 await store.createExecution('queued','good','manual',now(),{});const queued=await app.request('/api/system/queue/receive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenant,type:'execution',executionId:'queued',workflowId:'good'})});assert.equal(queued.status,200);assert.equal((await store.getExecution('queued')).status,'completed');assert.equal(calls,3);
 for(const[id,trigger,workflowId]of [['selected','authoring_node','good'],['interactive','authoring_test','good'],['mismatched','manual','bad']]){await store.createExecution(id,'good',trigger,now(),{});const response=await app.request('/api/system/queue/receive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenant,type:'execution',executionId:id,workflowId})});assert.equal(response.status,200);assert.equal((await response.json()).skipped,true);assert.equal((await store.getExecution(id)).status,'running');assert.equal(calls,3);}
 const emailApp=new Hono();registerEmailInboundRoutes(emailApp,{phase2For:storeFor,now,inboundSecret:'synthetic-inbound-only',executionOptions:options});
 await runner.exec('UPDATE workflows SET is_active = 1 WHERE id = ? AND tenant_slug = ?',['good',tenant]);
 const email=await emailApp.request('/api/system/email/inbound',{method:'POST',headers:{'content-type':'application/json','x-internal-secret':'synthetic-inbound-only'},body:JSON.stringify({tenant,email:{providerMessageId:'owned-http-fixture',from:'fixture@example.com',to:'owner@example.com',text:'fixture'}})});assert.equal(email.status,200);assert.equal((await email.json()).started,2);assert.equal(calls,4);assert.equal(raw,0);
 console.log('workflow-http: direct/private denial, recovery, signed queue and email dispatch share injected guard; no raw fallback PASS');
}finally{globalThis.fetch=previous;runner.close();}
