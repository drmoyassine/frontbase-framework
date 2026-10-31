import assert from 'node:assert/strict';
import{build}from'esbuild';import{mkdtempSync,rmSync,readFileSync}from'node:fs';import{join}from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';
import{createSecretCipher}from'@frontbase/backend';
import{defaultDeploymentManifest}from'@frontbase/edge-core/deployment';
import{reviewBootstrap,applyBootstrap,reconcileBootstrap}from'@frontbase/edge-core/deployment-bootstrap';
const folder=mkdtempSync(fileURLToPath(new URL('../.native-metadata-',import.meta.url)));
try{
 const faults={number:['created.number!==tip.number+1','false'],stale:['if(d?.canonical){','if(d){'],context:['JSON.stringify(state.context)!==scope','false'],owner:[/if\(field\(tip\)\)refuse\(\);[\s\S]*?(?=\s+const env:Record)/,'const original=tip.env;'],history:["range.length!==tip.number-base+1||range.some((v:any,i:number)=>v.number!==base+i||!uuid.test(v.id??''))",'false'],revision:['(state.journal?.revision??null)!==revision','false'],replace:['if(!state.vault.some(r=>r.key===key&&r.value===expected))return false;',''],plaintext:["||!(await cipher).isEncrypted(value)",'']};
 faults.activation=["if(!current||current.phase!=='applying'||current.revision!==record.revision||current.operationId!==record.operationId||current.fingerprint!==record.fingerprint)refuse();",''];
 const file=join(folder,'adapter.mjs');await build({entryPoints:[fileURLToPath(new URL('../src/cloudflare-setup-metadata.ts',import.meta.url))],outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'metadata-fault',setup(b){b.onLoad({filter:/cloudflare-setup-metadata\.ts$/},args=>{let contents=readFileSync(args.path,'utf8');if(process.env.FRONTBASE_METADATA_FAULT){const [from,to]=faults[process.env.FRONTBASE_METADATA_FAULT]??[];assert(from&&contents.split(from).length===2,'fault anchor must be unique');contents=contents.replace(from,to);}return{contents,loader:'ts'};});}}]});
 const{cloudflareSetupMetadata,setupMetadataBinding}=await import(process.env.FRONTBASE_METADATA_TEST_MODULE??pathToFileURL(file).href);
 const owner='private-owner-fixture-'.repeat(3),context={installationId:'11111111-2222-4333-8444-555555555555',target:'cloudflare',destination:'a'.repeat(32)+'/metadata-fixture/production'},cipher=await createSecretCipher(owner);
 async function fixture(){
  let number=1,active='00000000-0000-4000-8000-000000000001',lose=false,conflict=false,hide=false,lastBody;
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),versions=[{id:id(1),number:1,env:{ASSETS:{type:'assets'},FRONTBASE_BOOTSTRAP:{type:'plain_text',text:'native'},FRONTBASE_INSTALLATION_ID:{type:'plain_text',text:context.installationId},FRONTBASE_NATIVE_ACCOUNT:{type:'plain_text',text:'a'.repeat(32)},FRONTBASE_NATIVE_PROJECT:{type:'plain_text',text:'metadata-fixture'}}}],calls=[];
  const api=async(path,method='GET',body,type)=>{
   calls.push({path,method});assert(!/\/d1\/|\/storage\/|\/vectorize\//.test(path),'metadata adapter never provisions data resources');
   if(method==='GET'&&path.endsWith('/versions/latest'))return structuredClone(versions.at(-1));
   if(method==='PATCH'&&path.endsWith('/versions/latest')){
    assert.equal(type,'application/merge-patch+json');if(conflict){conflict=false;throw Object.assign(Error('conflict'),{status:409,code:11024});}
    lastBody=structuredClone(body);const v={...structuredClone(versions.at(-1)),id:id(++number),number};for(const[k,value]of Object.entries(body.env))value===null?delete v.env[k]:v.env[k]=value;versions.push(v);
    if(lose){lose=false;throw Error('lost committed metadata response');}return structuredClone(v);
   }
   if(method==='GET'&&path.includes('/versions?'))return{items:versions.filter(v=>!hide||v.number!==2).map(v=>({id:v.id,number:v.number})).reverse()};
   if(method==='GET'&&path.includes('/versions/')){const v=versions.find(v=>path.endsWith('/'+v.id));assert(v);return structuredClone(v);}
   if(method==='GET'&&path.endsWith('/deployments'))return{deployments:[{versions:[{version_id:active,percentage:100}]}]};
   if(method==='POST'&&path.endsWith('/deployments')){assert.equal(body.strategy,'percentage');assert.equal(body.versions.length,1);active=body.versions[0].version_id;return{id:'deployment'};}
   throw Error('unexpected provider route');
  };
  const claimant=cloudflareSetupMetadata(context,owner,api),claim=await claimant.claim({FRONTBASE_BOOTSTRAP:'1',FRONTBASE_BOOTSTRAP_TOKEN:owner,FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN:'private-provider-fixture'});
  assert.equal(active,claim.id);assert.equal(versions.at(-1).env.FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN.type,'secret_text');assert.equal(versions.at(-1).env.FRONTBASE_BOOTSTRAP_STORE.text,'versions-v1');
  const open=(key=owner,terminal)=>cloudflareSetupMetadata(context,key,api,claim.number,terminal);
  await assert.rejects(()=>claimant.claim({}),'a claimed destination cannot be adopted');
  return{open,api,versions,calls,get active(){return active;},get lastBody(){return structuredClone(lastBody);},lose(){lose=true;},conflict(){conflict=true;},hide(){hide=true;}};
 }
 {
  const f=await fixture(),a=f.open(),b=f.open(),before=f.active;
  assert.equal(await a.journal.read(context),null);
  const large=await cipher.encrypt('private-grant-'+('x'.repeat(7000)));assert.equal(await a.vault.insert('connection:one',large),true);assert.equal(await b.vault.get('connection:one'),large);assert.equal(f.active,before,'vault metadata remains undeployed');
  const v=f.versions.at(-1);assert(JSON.parse(v.env[setupMetadataBinding].text).chunks>1);for(const[name,value]of Object.entries(v.env))if(name.startsWith(setupMetadataBinding)){assert(value.text.length<=3500);assert(!value.text.includes('private-grant'));assert(!value.text.includes(owner));}
  assert.equal(await a.vault.insert('connection:one',large),false);assert.equal(await a.vault.replace('connection:one','wrong',large),false);await assert.rejects(()=>a.vault.insert('plain','private-plaintext'));
  const manifest=defaultDeploymentManifest('cloudflare','production');let dispatches=0;
  const executor={preflight:async()=>{},apply:async()=>{dispatches++;},inspect:async r=>({operationId:r.operationId,fingerprint:r.fingerprint,healthy:true,bootstrapDisabled:true})};
  const review=await reviewBootstrap(context,manifest,a.journal,executor);assert.equal(dispatches,0,'Review does not create selected resources');
  assert.equal(await a.journal.compareAndSwap(context,null,{...review,revision:0}),false,'a stale expected journal revision cannot reset the reviewed state');
  const attempts=await Promise.allSettled([a,b].map(adapter=>applyBootstrap(context,review.operationId,{},adapter.journal,executor)));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(dispatches,1,'independent runtimes dispatch exactly once');assert.equal((await b.journal.read(context)).phase,'active');assert.equal(f.active,before);
  await assert.rejects(()=>applyBootstrap(context,review.operationId,{},b.journal,executor));assert.equal(dispatches,1);
  await assert.rejects(()=>f.open('different-private-owner-'.repeat(3)).journal.read(context));
  const other={...context,installationId:'99999999-2222-4333-8444-555555555555'};await assert.rejects(()=>cloudflareSetupMetadata(other,owner,f.api,2).journal.read(other),'same provider project cannot cross installation context');
  const state=await a.journal.read(context);const carry=structuredClone(f.versions.at(-1));carry.number+=100;carry.id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';f.versions.push(carry);
  const terminal=f.open(owner,{operationId:state.operationId,fingerprint:state.fingerprint});assert.equal((await terminal.journal.read(context)).phase,'active','terminal receipt survives later source versions');await assert.rejects(()=>a.journal.read(context));
 }
 {
  const f=await fixture(),a=f.open(),value=await cipher.encrypt('private-fault-fixture');f.conflict();assert.equal(await a.vault.insert('one',value),false,'provider conflict is not retried');assert.equal(await a.vault.get('one'),null);
  f.lose();await assert.rejects(()=>a.vault.insert('one',value));assert.equal(await f.open().vault.get('one'),value,'lost response survives restart without repeated append');
 }
 {
  const f=await fixture(),a=f.open(),value=await cipher.encrypt('private-snapshot');await a.vault.insert('first',value);const stale=f.lastBody;await a.vault.insert('second',value);
  await f.api('/client/v4/accounts/'+context.destination.split('/')[0]+'/workers/workers/metadata-fixture/versions/latest','PATCH',stale,'application/merge-patch+json');
  assert.equal(await f.open().vault.get('second'),value,'late stale append cannot roll back a newer accepted snapshot');f.hide();await assert.rejects(()=>f.open().vault.get('second'),'incomplete history fails closed');
 }
 {
  const f=await fixture(),a=f.open(),manifest=defaultDeploymentManifest('cloudflare','production'),bindings=[{name:'ASSETS',type:'assets'},{name:'FRONTBASE_BOOTSTRAP',type:'plain_text',text:'0'},{name:'DB',type:'d1',id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'},{name:'FRONTBASE_KV',type:'kv_namespace',namespace_id:'b'.repeat(32)}];
  const executor={preflight:async()=>{},apply:async record=>a.activate(record,bindings,()=>true),inspect:async r=>({operationId:r.operationId,fingerprint:r.fingerprint,healthy:true,bootstrapDisabled:f.versions.find(v=>v.id===f.active)?.env.FRONTBASE_BOOTSTRAP?.text==='0'})};
  const review=await reviewBootstrap(context,manifest,a.journal,executor);await assert.rejects(()=>a.activate(review,bindings,()=>true),'review alone cannot activate');
  const result=await applyBootstrap(context,review.operationId,{},a.journal,executor);assert.equal(result.phase,'active');const runtime=f.versions.find(v=>v.id===f.active);assert.equal(runtime.env.DB.database_id,'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');assert.equal(runtime.env.FRONTBASE_KV.namespace_id,'b'.repeat(32));await assert.rejects(()=>a.activate(result,bindings,()=>true),'completed activation cannot replay');
 }
 {
  const f=await fixture(),a=f.open(),manifest=defaultDeploymentManifest('cloudflare','production');let sent=0;
  const executor={preflight:async()=>{},apply:async()=>{sent++;throw Error('lost resource response');},inspect:async()=>null};const review=await reviewBootstrap(context,manifest,a.journal,executor);const result=await applyBootstrap(context,review.operationId,{},a.journal,executor);assert.equal(result.phase,'uncertain');assert.equal((await reconcileBootstrap(context,f.open().journal,executor)).phase,'uncertain');await assert.rejects(()=>applyBootstrap(context,review.operationId,{},f.open().journal,executor));assert.equal(sent,1,'unknown resource result cannot replay');
 }
 console.log('PASS CF metadata: no resources before Apply, undeployed encrypted snapshots, chunk limits, durable owner/vault/journal, independent concurrent CAS, stale/lost/conflict/unknown-result fences, carried terminal receipt');
}finally{rmSync(folder,{recursive:true,force:true});}
