import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./deployment-setup/hosted-app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const elements=new Map(),calls=[],redirects=[];
let saved=false,discoveries=0,mounts=0,reviewed=false,applying=false,refuse=true;
const element=id=>{
 if(!elements.has(id))elements.set(id,{value:'',type:'password',handlers:{},disabled:false,hidden:true,
  addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return[];},reportValidity(){return true;},setAttribute(){}});
 return elements.get(id);
};
const context={
 URL,URLSearchParams,AbortSignal,Date,setTimeout,clearTimeout,history:{replaceState(){}},addEventListener(){},
 document:Object.assign(new EventTarget(),{hidden:false,getElementById:element,querySelector:()=>null,querySelectorAll:()=>[]}),
 location:{hash:'',pathname:'/frontbase-bootstrap/',assign:value=>redirects.push(value)},
 sessionStorage:{getItem(){return null;},removeItem(){},setItem(){assert.fail('Administrator secrets must never enter browser storage');}},
 restoreSetupManifest:(_,m)=>m,connectionOptions:x=>x,
 readProviderConnections:async()=>{discoveries++;return{};},
 mountBindingsForm:()=>{mounts++;return{finishDiscovery(){},prepareReview:async()=>{},snapshot:()=>({manifest:{},credentials:{}}),clearCredentials(){}};},
 fetch:async(url,init={})=>{
  calls.push(url);
  if(url.endsWith('/form'))return Response.json({administrator:{required:true,saved},manifest:{},adapters:[],target:'vercel',operation:reviewed?{operationId:'once',phase:applying?'applying':'reviewed'}:null,draft:reviewed?{manifest:{},credentials:{},role:'storage'}:undefined});
  if(url.endsWith('/administrator')){assert.deepEqual(JSON.parse(init.body),{email:'owner@example.test',password:'test-password-123',confirmation:'test-password-123'});saved=true;return Response.json({saved:true});}
  if(url.endsWith('/draft'))return Response.json({saved:true});
  if(url.endsWith('/review')){reviewed=true;return Response.json({reviewId:'once'});}
  if(url.endsWith('/apply'))return refuse?Response.json({message:'Provider refused setup.'},{status:409}):Response.json({phase:'active',nextSetup:'/setup#/setup?claim=fixture'});
  if(url.endsWith('/reconcile'))return Response.json({phase:'applying',operationId:'once'});
  if(url.endsWith('/setup/status'))return Response.json({needsSetup:false});
  assert.fail('Unexpected request '+url);
 }
};
vm.runInNewContext(source,context);await new Promise(setImmediate);
assert.equal(element('administrator').hidden,false);
assert.equal(element('configuration').hidden,true);
assert.equal(mounts,0);assert.equal(discoveries,0);
element('administrator-email').value='owner@example.test';
element('administrator-password').value='test-password-123';
element('administrator-confirmation').value='different';
await element('administrator-form').handlers.submit({preventDefault(){}});
assert(!calls.some(url=>url.endsWith('/administrator')));
element('administrator-confirmation').value='test-password-123';
await element('administrator-form').handlers.submit({preventDefault(){}});
assert.equal(element('administrator-password').value,'');assert.equal(element('administrator-confirmation').value,'');
assert.equal(element('administrator').hidden,true);assert.equal(element('configuration').hidden,false);
assert.equal(mounts,1);assert.equal(discoveries,1);
await element('apply').handlers.click();
assert.equal(element('apply').disabled,true);
await element('reconcile').handlers.click();
assert.equal(element('apply').disabled,false);
assert.match(element('result').textContent,/saved choices are restored/);
assert.equal(calls.filter(url=>url.endsWith('/apply')).length,1,'Checking status must not submit again');
assert.equal(calls.filter(url=>url.endsWith('/reconcile')).length,0,'A reviewed operation is not reconciled');
refuse=false;
await element('apply').handlers.click();
assert.deepEqual(redirects,['/frontbase-admin/login']);
assert.equal(calls.filter(url=>url.endsWith('/apply')).length,2,'Second request requires another explicit Finish');
// A separate 409 may follow dispatch. The journal is authoritative.
elements.clear();calls.length=0;redirects.length=0;reviewed=false;refuse=true;
vm.runInNewContext(source,{...context});await new Promise(setImmediate);
applying=true;
await element('apply').handlers.click();
await element('reconcile').handlers.click();
assert.equal(element('apply').disabled,true,'An operation that has started must stay fenced');
assert.equal(calls.filter(url=>url.endsWith('/apply')).length,1);
assert.equal(calls.filter(url=>url.endsWith('/reconcile')).length,1);
assert(!readFileSync(new URL('./deployment-setup/hosted-index.html',import.meta.url),'utf8').match(/verify ownership|activation|activate frontbase/i));
console.log('PASS administrator-first UI: no discovery before enrollment, confirmation, password clearing, safe status recovery, explicit retry, finished app sign-in');
