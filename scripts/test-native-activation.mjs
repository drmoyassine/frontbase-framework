import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./deployment-setup/native-activation.js',import.meta.url),'utf8');
async function fixture({readyAfter=0,invalid=false,initialize=true,alreadyReady=false,rejection=0,selectProvider=false,inline=false}={}){
 let stamp=0,claims=0,initializations=0,replaced=null,ready=false;
 const nodes=Object.fromEntries(['status','retry','open','providers'].map(id=>[id,{hidden:true,textContent:'',addEventListener(_event,handler){this.handler=handler;}}]));
 const scripts=[];
 if(inline)nodes['owned-wizard']={hidden:true};
 const location={hash:'#claim='+(invalid?'invalid':'a'.repeat(64)),pathname:'/frontbase-bootstrap/activation',replace(value){replaced=value;}};
 const saved=new Map();
 const operation=runInNewContext(source,{URLSearchParams,AbortSignal,Date:{now:()=>stamp},history:{replaceState(){location.hash='';}},sessionStorage:{setItem(k,v){saved.set(k,v);}},location,document:{getElementById:id=>nodes[id],createElement:()=>({}),body:{append:script=>scripts.push(script)}},setTimeout(fn,ms){stamp+=ms;fn();},fetch:async(path,options)=>{
  assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');assert(options.signal);
  if(path==='/frontbase-bootstrap/api/claim'){claims++;assert.equal(nodes.providers.hidden,false);
   if(selectProvider&&claims===1)nodes.providers.handler({target:{dataset:{role:'state-db'},value:'postgrest-http'}});
   if(rejection)return {ok:false,status:rejection};assert.equal(JSON.parse(options.body).token,'a'.repeat(64));return{ok:ready||claims>readyAfter,headers:new Headers(alreadyReady?{'X-Frontbase-Initialization':'ready'}:{})};}
  assert.equal(path,'/frontbase-bootstrap/api/initialize','activation only claims and initializes the existing runtime');initializations++;if(initialize==='throw')throw Error('unknown result');return{ok:initialize};
 }});await operation;
 return{nodes,scripts,saved,get claims(){return claims;},get initializations(){return initializations;},get replaced(){return replaced;},async retry(){ready=true;await nodes.retry.handler();}};
}
{const f=await fixture({readyAfter:25});assert.equal(f.replaced,'/frontbase-bootstrap/');assert.equal(f.claims,26,'build taking over three minutes remains supported');assert.equal(f.initializations,1);}
{const f=await fixture({readyAfter:Infinity});assert.equal(f.replaced,null);assert.ok(f.claims<=64,'readiness backs off during the ten-minute deadline');assert.equal(f.initializations,0);assert.equal(f.nodes.retry.hidden,false);await f.retry();assert.equal(f.replaced,'/frontbase-bootstrap/');assert.equal(f.initializations,1);}
{const f=await fixture({alreadyReady:true});assert.equal(f.replaced,'/frontbase-bootstrap/');assert.equal(f.initializations,0);}
{const f=await fixture({initialize:false});assert.equal(f.initializations,1);assert.equal(f.nodes.open.hidden,false);assert.equal(f.replaced,null);assert.equal(f.nodes.retry.hidden,true,'uncertain initialization is not automatically repeated');}
{const f=await fixture({initialize:'throw'});assert.equal(f.initializations,1,'lost initialization response cannot trigger a retry');assert.equal(f.nodes.open.hidden,false);assert.equal(f.nodes.retry.hidden,true);}
{const f=await fixture({invalid:true});assert.equal(f.claims,0);assert.equal(f.initializations,0);assert.match(f.nodes.status.textContent,/private setup handoff/);}
{
 const f=await fixture({readyAfter:4,alreadyReady:true,selectProvider:true});
 assert.equal(f.saved.get('fb-setup-provider-choices'),JSON.stringify({'state-db':'postgrest-http'}));
 assert.equal(f.initializations,0);
}
{
 const f=await fixture({inline:true,selectProvider:true,alreadyReady:true});
 assert.equal(f.replaced,null);assert.equal(f.saved.size,0);assert.equal(f.scripts[0].src,'/frontbase-bootstrap/app.js');
}
for(const status of [401,403,410]){
 const f=await fixture({rejection:status,selectProvider:true,inline:true});
 assert.equal(f.claims,1);assert.equal(f.scripts.length,0);assert.equal(f.replaced,null);assert.equal(f.saved.size,0);assert.equal(f.initializations,0);
}
console.log('PASS native activation: slow provider build, bounded request/deadline, memory-only capability, readiness retry without redeployment, initialization refusal and missing handoff');

// Hold account discovery open. The actual hosted entry must mount the form
// before discovery settles, and a connected account must skip legacy D1 inventory.
{
 const app=readFileSync(new URL('./deployment-setup/hosted-app.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
 const elements=new Map(),calls=[];
 let resolveAccounts,mounted=false,finished=false;
 const accounts=new Promise(resolve=>{resolveAccounts=resolve;});
 const element=id=>{if(!elements.has(id))elements.set(id,{addEventListener(){},disabled:false});return elements.get(id);};
 runInNewContext(app,{
  document:{getElementById:element},URLSearchParams,history:{replaceState(){}},location:{hash:'',pathname:'/frontbase-bootstrap/'},
  sessionStorage:{getItem(){return null;},removeItem(){}},addEventListener(){},
  readProviderConnections(){calls.push('accounts');return accounts;},connectionOptions:x=>x,restoreSetupManifest:(_,m)=>m,
  mountBindingsForm(){mounted=true;return {finishDiscovery(){finished=true;}};},
  fetch:async path=>{calls.push(path);assert.equal(path,'/frontbase-bootstrap/api/form');return Response.json({target:'cloudflare',manifest:{},adapters:[]});}
 });
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['accounts','/frontbase-bootstrap/api/form']);
 assert.ok(mounted);assert.equal(finished,false);assert.equal(element('review').disabled,true);
 resolveAccounts({cloudflare:{connected:true}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(finished);assert.equal(element('review').disabled,false);assert.equal(calls.length,2);
 console.log('PASS hosted wizard renders during account discovery and skips duplicate inventory');
}
