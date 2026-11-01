import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const {createSystemServiceResolver}=await import(process.env.FRONTBASE_NATIVE_QUEUE_SERVICE_MODULE??'@frontbase/backend');
const worker=(await import(process.env.FRONTBASE_QUEUE_WORKER_MODULE??new URL('../dist/worker.mjs',import.meta.url))).default;
const db=new DatabaseSync(':memory:');const DB={prepare(sql){const stmt=db.prepare(sql);let params=[];return {bind(...v){params=v;return this;},async all(){return {results:stmt.all(...params)};},async run(){return {meta:{changes:Number(stmt.run(...params).changes)}};}};}};
const ctx={waitUntil(p){p.catch(()=>{});},passThroughOnException(){}};
const jobs=[],queue={async send(body,opts){assert.equal(opts.contentType,'json');jobs.push(body);}},secret='native-queue-callback-private',origin='https://native-queue.example.test';
const env={DB,SESSION_SECRET:'native-queue-session-private',FRONTBASE_PUBLIC_ORIGIN:origin,FRONTBASE_NATIVE_QUEUE:queue,FRONTBASE_QUEUE:JSON.stringify({provider:'cloudflare_queue',url:'queue://jobs'}),FRONTBASE_QUEUE_CALLBACK_SECRET:secret,ASSETS:{async fetch(){return new Response('asset');}}};
const services=createSystemServiceResolver({phase2For:()=>({getDefaultEdgeResource:async()=>null}),env:{nativeQueue:queue,queue:{provider:'cloudflare_queue',url:'queue://jobs'},queueCallbackSecret:secret}});
const dispatch=await services.queueFor('_default');assert.ok(dispatch);assert.equal(await dispatch.publishJob({type:'rag-index',tenant:'_default',bucketId:'fixture'}),true);assert.equal(jobs[0].tenant,'_default');assert.equal(await dispatch.verifyInbound(null,'wrong',JSON.stringify(jobs[0])),false);assert.equal(await dispatch.verifyInbound(null,secret,JSON.stringify(jobs[0])),true);
let ack=0,retry=0;const message=body=>({body,ack(){ack++;},retry(){retry++;}});
try{
 assert.equal(typeof worker.queue,'function');
 const anonymous=await worker.fetch(new Request(origin+'/api/system/queue/receive',{method:'POST',body:JSON.stringify({tenant:'_default',type:'unknown'})}),env,ctx);assert.equal(anonymous.status,401,'external HTTP cannot bypass the native queue secret');
 await worker.queue({messages:[message({tenant:'_default',type:'unknown'})]},env,ctx);assert.equal(ack,1);assert.equal(retry,0,'authenticated event uses the existing idempotent receiver');
 await worker.queue({messages:[message({type:'execution'})]},env,ctx);assert.equal(retry,1,'invalid event is not silently acknowledged as delivered');
 await assert.rejects(()=>worker.queue({messages:[]},{...env,FRONTBASE_QUEUE_CALLBACK_SECRET:undefined},ctx),/queue_receiver_unconfigured/);
 console.log('PASS actual Cloudflare entry: native send, private receive bridge, external refusal, acknowledgement and retry behavior');
}finally{db.close();}
