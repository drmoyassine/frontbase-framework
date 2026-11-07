import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {getEventListeners} from 'node:events';
const source=readFileSync(new URL('./deployment-setup/hosted-app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
async function run(ready,wake=false){
 let clock=0;const times=[];
 const elements=new Map(),calls=[],redirects=[];const element=id=>{if(!elements.has(id))elements.set(id,{handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return[];},textContent:''});return elements.get(id);};
 const location={hash:'',pathname:'/frontbase-bootstrap/',assign:url=>redirects.push(url)};
 const document=Object.assign(new EventTarget(),{querySelectorAll:()=>[],hidden:false,getElementById:element});
 const context={Date:{now:()=>clock},AbortSignal,clearTimeout:()=>{},document,location,history:{replaceState(){}},sessionStorage:{getItem(){return null;},removeItem(){},setItem(){}},URLSearchParams,addEventListener(){},setTimeout:(fn,ms)=>{queueMicrotask(()=>{if(wake&&times.length===1){context.document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));clock+=123;context.document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));}else{clock+=ms;fn();}});return 1;},restoreSetupManifest:(_,manifest)=>manifest,mountBindingsForm:()=>({finishDiscovery(){},async prepareReview(){},snapshot:()=>({manifest:{},credentials:{}}),clearCredentials(){}}),readProviderConnections:async()=>({}),connectionOptions:()=>({}),connectProvider:async()=>{},fetch:async(url,options)=>{calls.push({url,method:options?.method??'GET'});let out;if(url.endsWith('/form'))out={manifest:{},adapters:[]};else if(url.endsWith('/review'))out={reviewId:'review-fixture'};else if(url.endsWith('/apply')||url.endsWith('/reconcile'))out={phase:'uncertain',nextSetup:'/setup#/setup?claim=fixture'};else if(url==='/api/console/setup/status'){times.push(clock);out={needsSetup:ready&&(!wake||times.length===2)};}else throw Error('unexpected request');return {ok:true,headers:{get:()=> 'application/json'},json:async()=>out};}};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));await element('apply').handlers.click();assert.equal(calls.filter(c=>c.url.endsWith('/apply')).length,1);assert.equal(calls.filter(c=>c.method==='POST').length,2,'only review and one apply may mutate');
 assert.equal(times[0],0);assert.equal(getEventListeners(document,'visibilitychange').length,ready?0:1,'only unresolved activation keeps a resume listener');
 if(wake)assert.deepEqual(times,[0,123]);
 if(!ready){assert.deepEqual(times.slice(0,5),[0,1000,3000,7000,15000]);assert.ok(times.length<=22);}
 if(ready)assert.deepEqual(redirects,['/setup#/setup?claim=fixture']);else{assert.deepEqual(redirects,[]);assert.match(element('result').textContent,/could not be confirmed/);}
}
await run(true);await run(true,true);await run(false);console.log('PASS uncertain activation: delayed healthy runtime reaches administrator setup; unconfirmed runtime stops honestly; neither case repeats writes');
