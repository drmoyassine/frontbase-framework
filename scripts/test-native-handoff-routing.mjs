import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
let source=readFileSync(new URL('./deployment-setup/native-app.js',import.meta.url),'utf8').replace(/^import .+;\r?\n/gm,'');
const faults={status:['!response.ok','false'],scope:['config.manifest?.target!==config.target','false'],bounded:['if(attempt>=3)','if(false)'],readonly:["method:'GET'","method:'POST'"]};
if(process.env.FB_NATIVE_HANDOFF_FAULT){const[from,to]=faults[process.env.FB_NATIVE_HANDOFF_FAULT]??[];assert(from&&source.split(from).length===2,'unique routing fault anchor');source=source.replace(from,to);}
const configuration={target:'vercel',manifest:{target:'vercel'},adapters:[]};
const reply=(ok,body=configuration)=>({ok,headers:{get:()=> 'application/json'},json:async()=>structuredClone(body)});
async function fixture({owned=[],native=true,search='',providerFailure=false}={}){
 const nodes=Object.fromEntries(['status','bindings','continue'].map(id=>[id,{textContent:'',disabled:false,addEventListener(){}}])),requests=[],redirects=[],draft='{"target":"vercel","draft":"preserved"}';let mounted=0,providers=0,ownedReads=0;
 const location={search,replace:url=>redirects.push(url)},storage=new Map([['fb-setup-manifest',draft]]);
 await runInNewContext('(async()=>{'+source+'})()',{URLSearchParams,AbortSignal,Math,Number,location,document:{getElementById:id=>nodes[id]},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},addEventListener(){},pendingSetupManifest:()=>configuration.manifest,restoreSetupManifest:(_saved,manifest)=>manifest,connectionOptions:()=>[],connectProvider:async()=>{throw Error('routing must never start consent');},mountBindingsForm:()=>{mounted++;return{clearCredentials(){},snapshot:()=>({manifest:configuration.manifest})};},readProviderConnections:async()=>{providers++;if(providerFailure)throw Error('runtime changed');return{};},fetch:async(path,options={})=>{
  requests.push(path);assert.equal(options.method??'GET','GET','rollout recovery never claims, initializes or provisions');assert.equal(options.body,undefined);
  if(path==='/frontbase-bootstrap/api/configuration')return owned[ownedReads++]??reply(false,{});
  assert.equal(path,'/frontbase-bootstrap/native-configuration');if(!native)throw Error('old page/new runtime');return reply(true,configuration);
 }});
 return{nodes,requests,redirects,mounted,providers,storage,draft};
}
{const f=await fixture();assert.equal(f.mounted,1);assert.equal(f.redirects.length,0,'unclaimed native installer stays native');}
{const f=await fixture({owned:[reply(true)]});assert.deepEqual(f.redirects,['/frontbase-bootstrap/?handoff=1'],'an authenticated hosted runtime replaces stale native HTML');assert.equal(f.mounted,0);assert.equal(f.providers,0);assert.equal(f.storage.get('fb-setup-manifest'),f.draft,'preserve the nonsecret binding draft');}
{const f=await fixture({native:false,owned:[reply(false,{}),reply(true)]});assert.deepEqual(f.redirects,['/frontbase-bootstrap/?handoff=1'],'recover a rollout between the first probe and native configuration');assert.equal(f.mounted,0);}
{const f=await fixture({providerFailure:true,owned:[reply(false,{}),reply(true)]});assert.equal(f.redirects.length,1,'recover a rollout during provider status');assert.equal(f.mounted,0);}
{const f=await fixture({native:false,owned:[reply(false),reply(false)]});assert.equal(f.redirects.length,0,'a refused owner session cannot redirect to an authorized wizard');assert.equal(f.nodes.continue.disabled,true);assert.match(f.nodes.status.textContent,/Setup is unavailable/);}
{const wrong={...configuration,manifest:{target:'cloudflare'}};const f=await fixture({native:false,owned:[reply(true,wrong),reply(true,wrong)]});assert.equal(f.redirects.length,0,'reject mismatched runtime/manifest identity');}
{const f=await fixture({search:'?handoff=3',owned:[reply(true)]});assert.equal(f.redirects.length,0,'recovery cannot reload indefinitely');assert.equal(f.nodes.continue.disabled,true);assert.match(f.nodes.status.textContent,/still updating/);}
{const f=await fixture({search:'?handoff=1',owned:[reply(true,{...configuration,operation:{phase:'uncertain'}})]});assert.deepEqual(f.redirects,['/frontbase-bootstrap/?handoff=2'],'route to the existing held operation without dispatch');assert(f.requests.every(p=>!/(claim|initialize|apply|start)$/.test(p)));}
console.log('PASS native rollout routing: owner-authenticated recovery, initial native flow, mid-request rollout, refused/mismatched sessions, bounded redirects, preserved drafts and no provisioning or consent replay');
