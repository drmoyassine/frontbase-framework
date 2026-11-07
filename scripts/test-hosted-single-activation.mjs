import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./deployment-setup/hosted-app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const html=readFileSync(new URL('./deployment-setup/hosted-index.html',import.meta.url),'utf8');
assert(!html.includes('id="review"'));assert.equal((html.match(/>Finish setup</g)??[]).length,1);
for(const scenario of ['success','invalid-binding','rejected-review','changed-review','lost-apply']){
 const elements=new Map(),calls=[];let mount,checks=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{handlers:{},disabled:false,textContent:'',addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return[];}});return elements.get(id);};
 const context={URL,URLSearchParams,AbortSignal,Date,history:{replaceState(){}},location:{hash:'',pathname:'/',assign(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},addEventListener(){},document:{getElementById:element,querySelectorAll:()=>[]},restoreSetupManifest:(_,m)=>m,
 mountBindingsForm:(_root,options)=>{mount=options;assert.equal(options.onDeployNow,undefined);return{finishDiscovery(){},async prepareReview(){checks++;if(scenario==='invalid-binding')throw Error('Optional vector index is invalid');},snapshot:()=>({manifest:{version:1},credentials:{'state/token':'fixture-private'}}),clearCredentials(){},showIssues(){}};},readProviderConnections:async()=>({}),connectionOptions:()=>({}),connectProvider:async()=>{},
 fetch:async(url,init)=>{calls.push({url,body:init.body?JSON.parse(init.body):null});if(url.endsWith('/form'))return Response.json({manifest:{},adapters:[],target:'cloudflare'});if(url.endsWith('/review')){if(scenario==='changed-review')mount.onChange();if(scenario==='rejected-review')return Response.json({message:'Invalid optional storage',issues:[]},{status:422});return Response.json({reviewId:'review-once'});}if(url.endsWith('/apply')){if(scenario==='lost-apply')throw Error('connection lost after submission');assert.deepEqual(JSON.parse(init.body),{reviewId:'review-once',credentials:{'state/token':'fixture-private'}});return Response.json({phase:'active'});}throw Error('Unexpected request');}};
 vm.runInNewContext(source,context);await new Promise(setImmediate);
 const action=element('apply').handlers.click;await action();
 assert.equal(checks,1,'all bindings checked before dispatch');
 assert.equal(calls.filter(c=>c.url.endsWith('/review')).length,scenario==='invalid-binding'?0:1);
 const submitted=['success','lost-apply'].includes(scenario);
 assert.equal(calls.filter(c=>c.url.endsWith('/apply')).length,submitted?1:0);
 if(submitted){await action();assert.equal(calls.filter(c=>c.url.endsWith('/apply')).length,1,'terminal/unknown submission cannot repeat');}
 else assert.equal(element('apply').disabled,false,'pre-submission corrections remain possible');
 console.log('PASS single activation: '+scenario);
}

const flush=()=>new Promise(setImmediate);
for(const scenario of ['hidden-past-timeout','foreground-timeout-then-return','manual-check-after-timeout','receipt-arrives-hidden','journal-reconciliation']){
 const elements=new Map(),requests=[],redirects=[],timers=new Map();
 const link='/setup#/setup?claim='+('a'.repeat(64));
 let now=0,ready=false,timerId=0;
 const element=id=>{
  if(!elements.has(id))elements.set(id,{handlers:{},disabled:false,textContent:'',addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return[];}});
  return elements.get(id);
 };
 const document=Object.assign(new EventTarget(),{getElementById:element,querySelectorAll:()=>[],hidden:false});
 const setHidden=async hidden=>{document.hidden=hidden;document.dispatchEvent(new Event('visibilitychange'));await flush();};
 const advance=async ms=>{
  now+=ms;
  for(const [id,{at,fn}] of timers)if(at<=now){timers.delete(id);fn();}
  await flush();
 };
 const checkCount=()=>requests.filter(r=>r.url==='/api/console/setup/status').length;
 const context={
  URL,URLSearchParams,AbortSignal,Date:class extends Date{static now(){return now;}},document,
  setTimeout(fn,ms){timers.set(++timerId,{at:now+ms,fn});return timerId;},clearTimeout(id){timers.delete(id);},
  history:{replaceState(){}},location:{hash:'',pathname:'/frontbase-bootstrap/',assign:value=>redirects.push(value)},
  sessionStorage:{getItem(){return null;},removeItem(){},setItem(){assert.fail('Never persist the setup handoff');}},
  addEventListener(){},restoreSetupManifest:(_,m)=>m,readProviderConnections:async()=>({}),connectionOptions:()=>({}),
  mountBindingsForm:()=>({finishDiscovery(){},async prepareReview(){},snapshot:()=>({manifest:{},credentials:{}}),clearCredentials(){}}),
  fetch:async(url,init)=>{
   requests.push({url,method:init.method??'GET'});
   if(url.endsWith('/form'))return Response.json({manifest:{},adapters:[],target:'vercel',...scenario==='journal-reconciliation'?{operation:{phase:'uncertain'}}:{}});
   if(url.endsWith('/review'))return Response.json({reviewId:'review-once'});
   if(url.endsWith('/apply'))return Response.json({phase:'uncertain',nextSetup:link});
   if(url.endsWith('/reconcile')){
    if(scenario==='journal-reconciliation')return Response.json({phase:'uncertain',nextSetup:link});
    return new Response('Bootstrap closed',{status:410,headers:{'content-type':'text/html'}});
   }
   if(url==='/api/console/setup/status'){
    assert.equal(init.cache,'no-store');
    assert.equal(init.redirect,'error');
    return Response.json({needsSetup:true},{status:ready?200:503});
   }
   throw Error('Unexpected request');
  }
 };
 vm.runInNewContext(source,context);
 await flush();
 if(scenario==='receipt-arrives-hidden')await setHidden(true);
 if(scenario==='journal-reconciliation')void element('reconcile').handlers.click();
 else void element('apply').handlers.click();
 await flush();
 if(scenario==='hidden-past-timeout'||scenario==='journal-reconciliation')await setHidden(true);
 const before=checkCount();
 assert.equal(before,scenario==='receipt-arrives-hidden'?0:1);
 await advance(181000);
 assert.equal(checkCount(),before,'backgrounding or expiry must not dispatch another probe');
 ready=true;
 if(scenario==='manual-check-after-timeout'){
  const retry=element('reconcile').handlers.click;
  await Promise.all([retry(),retry()]);
 }else{
  if(!document.hidden)await setHidden(true);
  await setHidden(false);
 }
 assert.equal(checkCount(),before+1,'foreground return or explicit retry sends one readiness GET');
 assert.deepEqual(redirects,[link]);
 await setHidden(true);
 await setHidden(false);
 assert.equal(checkCount(),before+1,'successful handoff removes the readiness listener');
 await element('apply').handlers.click();
 assert.equal(requests.filter(r=>r.url.endsWith('/apply')).length,scenario==='journal-reconciliation'?0:1);
 assert.equal(requests.filter(r=>r.url.endsWith('/reconcile')).length,scenario==='journal-reconciliation'?1:0);
 assert(requests.filter(r=>r.url==='/api/console/setup/status').every(r=>r.method==='GET'));
 console.log('PASS activation readiness: '+scenario);
}
