import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./deployment-setup/hosted-app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
for(const available of [false,true]){
 const elements=new Map(),drafts=[],redirects=[],calls=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:id==='renew',disabled:false,textContent:'',handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return[];}});return elements.get(id);};
 const manifest={bindings:{cache:{secretRefs:{token:'cache/token'}}}};
 const context={URL,URLSearchParams,document:{getElementById:element},history:{replaceState(){}},location:{hash:'',pathname:'/frontbase-bootstrap/',assign:value=>redirects.push(value)},addEventListener(){},sessionStorage:{getItem(){return null;},removeItem(){},setItem(key,value){drafts.push({key,value});}},restoreSetupManifest:(_,m)=>m,mountBindingsForm:()=>({async prepareReview(){},finishDiscovery(){},snapshot:()=>({manifest,credentials:{'cache/token':'synthetic-private-password'}}),clearCredentials(){}}),readProviderConnections:async()=>({}),connectionOptions:()=>({}),connectProvider:async()=>{},fetch:async(url,options)=>{
  calls.push({url,method:options?.method??'GET'});
  if(url.endsWith('recovery-status'))return {ok:true,json:async()=>({available})};
  if(url.endsWith('/form'))return {ok:true,json:async()=>({target:'cloudflare',manifest,adapters:[]})};
  if(url.endsWith('/review'))return {ok:false,json:async()=>({error:'bootstrap_session_required',message:'Setup access is missing or expired. Reopen your current private link or renew setup access.'})};
  if(url.endsWith('/renew'))return {ok:true,json:async()=>({url:'https://relay.example/connect?provider=cloudflare'})};
  throw Error('unexpected request');
 }};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(element('renew').hidden,true);assert.equal(calls.some(c=>c.url.endsWith('recovery-status')),false,'healthy startup defers renewal discovery');
 await element('review').handlers.click();assert.match(element('result').textContent,/missing or expired/);assert.equal(element('unlock').hidden,false,'expired session reveals supported recovery without replacing the form');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(element('renew').hidden,!available,'only supported expired setups offer renewal');
 if(available){await element('renew').handlers.click();assert.deepEqual(redirects,['https://relay.example/connect?provider=cloudflare']);assert.equal(drafts.length,1);assert.deepEqual(JSON.parse(drafts[0].value),manifest);assert.ok(!JSON.stringify(drafts).includes('synthetic-private-password'));assert.equal(calls.filter(c=>c.url.endsWith('/renew')).length,1);assert.equal(calls.filter(c=>c.url.endsWith('/apply')).length,0);}
}
console.log('PASS hosted renewal UI: capability-gated control, actionable session error, in-memory form retention, nonsecret selection draft and one explicit authorization start without Apply');
