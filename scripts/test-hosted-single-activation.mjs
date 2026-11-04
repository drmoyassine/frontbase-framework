import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./deployment-setup/hosted-app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const html=readFileSync(new URL('./deployment-setup/hosted-index.html',import.meta.url),'utf8');
assert(!html.includes('id="review"'));assert.equal((html.match(/>Activate Frontbase</g)??[]).length,1);
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
