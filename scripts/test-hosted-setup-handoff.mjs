import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./deployment-setup/hosted-app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
async function run(ready,wake=false){
 let clock=0;const times=[],listeners=new Map();
 const elements=new Map(),calls=[],redirects=[];const element=id=>{if(!elements.has(id))elements.set(id,{handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return[];},textContent:''});return elements.get(id);};
 const location={hash:'',pathname:'/frontbase-bootstrap/',assign:url=>redirects.push(url)};
 const context={Date:{now:()=>clock},AbortSignal,clearTimeout:()=>{},document:{hidden:false,getElementById:element,addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)},location,history:{replaceState(){}},sessionStorage:{getItem(){return null;},removeItem(){},setItem(){}},URLSearchParams,addEventListener(){},setTimeout:(fn,ms)=>{queueMicrotask(()=>{if(wake&&times.length===1){context.document.hidden=true;listeners.get('visibilitychange')();clock+=123;context.document.hidden=false;listeners.get('visibilitychange')();}else{clock+=ms;fn();}});return 1;},restoreSetupManifest:(_,manifest)=>manifest,mountBindingsForm:()=>({finishDiscovery(){},async prepareReview(){},snapshot:()=>({manifest:{},credentials:{}}),clearCredentials(){}}),readProviderConnections:async()=>({}),connectionOptions:()=>({}),connectProvider:async()=>{},fetch:async(url,options)=>{calls.push({url,method:options?.method??'GET'});let out;if(url.endsWith('/form'))out={manifest:{},adapters:[]};else if(url.endsWith('/review'))out={reviewId:'review-fixture'};else if(url.endsWith('/apply')||url.endsWith('/reconcile'))out={phase:'uncertain',nextSetup:'/setup#/setup?claim=fixture'};else if(url==='/api/console/setup/status'){times.push(clock);out={needsSetup:ready&&(!wake||times.length===2)};}else throw Error('unexpected request');return {ok:true,headers:{get:()=> 'application/json'},json:async()=>out};}};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));await element('review').handlers.click();await element('apply').handlers.click();assert.equal(calls.filter(c=>c.url.endsWith('/apply')).length,1);assert.equal(calls.filter(c=>c.method==='POST').length,2,'only review and one apply may mutate');
 assert.equal(times[0],0);assert.equal(listeners.size,0);
 if(wake)assert.deepEqual(times,[0,123]);
 if(!ready){assert.deepEqual(times.slice(0,5),[0,1000,3000,7000,15000]);assert.ok(times.length<=22);}
 if(ready)assert.deepEqual(redirects,['/setup#/setup?claim=fixture']);else{assert.deepEqual(redirects,[]);assert.match(element('result').textContent,/could not be confirmed/);}
}
await run(true);await run(true,true);await run(false);console.log('PASS uncertain activation: delayed healthy runtime reaches administrator setup; unconfirmed runtime stops honestly; neither case repeats writes');
