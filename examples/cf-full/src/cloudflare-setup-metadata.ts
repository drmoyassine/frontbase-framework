/** Durable bootstrap adapter over immutable Worker metadata versions. No resources
 * are provisioned here. PATCH latest clones code/assets without deploying it.
 * Only the first append after the observed provider version may win CAS. */
import {createSecretCipher} from '../../../packages/backend/src/db/secret-cipher.js';
import type {BootstrapContext,BootstrapJournal,BootstrapRecord} from '@frontbase/edge-core/deployment-bootstrap';
import type {OAuthVault} from '../../../packages/backend/src/provider-oauth-vault.js';
export const setupMetadataBinding='FRONTBASE_SETUP_METADATA';
type Api=(path:string,method?:string,body?:any,contentType?:string)=>Promise<any>;
type State={version:1;context:BootstrapContext;sequence:number;journal:BootstrapRecord|null;vault:Array<{key:string;value:string}>};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function refuse():never{throw Error('setup_metadata_unconfirmed');}
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
const field=(version:any)=>version.env?.[setupMetadataBinding]??version.resources?.bindings?.find((b:any)=>b.name===setupMetadataBinding);
export function cloudflareSetupMetadata(context:BootstrapContext,owner:string,api:Api,baseNumber?:number,terminal?:{operationId:string;fingerprint:string}){
 const [account,project,environment]=context.destination.split('/');
 if(context.target!=='cloudflare'||!/^[a-f0-9]{32}$/.test(account??'')||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(project??'')||environment!=='production'||!uuid.test(context.installationId)||owner.length<32||baseNumber!==undefined&&(!Number.isSafeInteger(baseNumber)||baseNumber<1))refuse();
 const root='/client/v4/accounts/'+account+'/workers/',versions=root+'workers/'+project+'/versions',legacy=root+'scripts/'+project+'/versions';
 const cipher=createSecretCipher(owner),ownerHash=hash(owner),scope=JSON.stringify(context);
 const initial=():State=>({version:1,context,sequence:0,journal:null,vault:[]});
 async function decode(v:any){
  const f=field(v);if(!f)return null;if(f.type!=='plain_text'||typeof f.text!=='string'||f.text.length>96000)refuse();
  let envelope:any,state:State;try{envelope=JSON.parse(f.text);const c=await cipher;if(envelope.ownerHash!==await ownerHash)return null;if(!Number.isInteger(envelope.chunks)||envelope.chunks<1||envelope.chunks>16)refuse();let value='';for(let i=0;i<envelope.chunks;i++){const name=setupMetadataBinding+'_'+String(i).padStart(2,'0'),chunk=v.env?.[name]??v.resources?.bindings?.find((b:any)=>b.name===name);if(chunk?.type!=='plain_text'||typeof chunk.text!=='string'||chunk.text.length>3500)refuse();value+=chunk.text;}if(!c.isEncrypted(value))refuse();state=JSON.parse(await c.decrypt(value));}catch{return refuse();}
  if(state.version!==1||JSON.stringify(state.context)!==scope||!Number.isSafeInteger(state.sequence)||state.sequence<0||!Array.isArray(state.vault)||state.vault.length>96||new Set(state.vault.map(r=>r.key)).size!==state.vault.length||state.vault.some(r=>typeof r.key!=='string'||r.key.length>256||typeof r.value!=='string'||!(r.value.startsWith('enc:'))))refuse();
  if(!Number.isSafeInteger(envelope.observed)||envelope.observed<1||!Number.isSafeInteger(v.number)||!uuid.test(v.id??''))refuse();
  return {state,canonical:v.number===envelope.observed+1};
 }
 async function latest(){const v=await api(versions+'/latest');if(!Number.isSafeInteger(v.number)||v.number<1||!uuid.test(v.id??''))refuse();return v;}
 async function read():Promise<{tip:any;state:State}>{
  const tip=await latest();if(!Number.isSafeInteger(baseNumber)||tip.number<baseNumber!)refuse();const decoded=await decode(tip);
  if(decoded?.canonical)return {tip,state:decoded.state};
  // A completed runtime may read its carried terminal receipt after later Git
  // upgrades. This path cannot reopen setup or dispatch a provisioning operation.
  if(decoded&&terminal&&decoded.state.journal?.phase==='active'&&decoded.state.journal.operationId===terminal.operationId&&decoded.state.journal.fingerprint===terminal.fingerprint)return {tip,state:decoded.state};
  const base=baseNumber??0;if(!Number.isSafeInteger(base)||base<1||tip.number-base>=32)throw Error('setup_metadata_history_exhausted');
  const result=await api(legacy+'?page=1&per_page=100'),items=Array.isArray(result)?result:result.items;
  if(!Array.isArray(items)||items.length>100)refuse();
  const range=items.filter((v:any)=>v.number>=base&&v.number<=tip.number).sort((a:any,b:any)=>a.number-b.number);
  if(range.length!==tip.number-base+1||range.some((v:any,i:number)=>v.number!==base+i||!uuid.test(v.id??'')))refuse();
  let winner:State|undefined;
  for(const entry of range){const value=entry.id===tip.id?tip:await api(legacy+'/'+entry.id);if(value.number!==entry.number)refuse();const d=await decode(value);if(d?.canonical){if(winner&&d.state.sequence!==winner.sequence+1)refuse();winner=d.state;}}
  if(!winner)refuse();return {tip,state:winner};
 }
 async function append(tip:any,state:State,env:Record<string,unknown>={}){
  const value=await(await cipher).encrypt(JSON.stringify(state)),chunks=Math.ceil(value.length/3500);if(chunks>16)throw Error('setup_metadata_capacity');
  const text=JSON.stringify({version:1,ownerHash:await ownerHash,observed:tip.number,chunks});
  const fields:Record<string,unknown>={...env,[setupMetadataBinding]:{type:'plain_text',text}};for(let i=0;i<chunks;i++)fields[setupMetadataBinding+'_'+String(i).padStart(2,'0')]={type:'plain_text',text:value.slice(i*3500,(i+1)*3500)};
  let created:any;try{created=await api(versions+'/latest','PATCH',{env:fields,annotations:{'workers/message':'Frontbase setup metadata','workers/tag':'frontbase-setup'}},'application/merge-patch+json');}catch(error:any){if(error.status===409&&error.code===11024)return null;throw error;}
  // Concurrent appends may be rejected by the provider or receive a later
  // number. Neither result authorizes dispatch, overwrites, or automatic retry.
  if(!uuid.test(created?.id??'')||created.number!==tip.number+1)return null;
  const stored=field(created);if(stored?.type!=='plain_text'||stored.text!==text)refuse();return created;
 }
 const journal:BootstrapJournal={
  async read(c){if(JSON.stringify(c)!==scope)refuse();return structuredClone((await read()).state.journal);},
  async compareAndSwap(c,revision,next){if(JSON.stringify(c)!==scope||next.revision!==(revision??-1)+1||JSON.stringify({installationId:next.installationId,target:next.target,destination:next.destination})!==scope)refuse();for(let attempt=0;attempt<3;attempt++){const {tip,state}=await read();if((state.journal?.revision??null)!==revision)return false;if(await append(tip,{...state,sequence:state.sequence+1,journal:structuredClone(next)}))return true;}return false;}
 };
 const vault:OAuthVault={
  async get(key){return(await read()).state.vault.find(r=>r.key===key)?.value??null;},
  async entries(prefix){return structuredClone((await read()).state.vault.filter(r=>r.key.startsWith(prefix)));},
  async insert(key,value){if(!key||key.length>256||!(await cipher).isEncrypted(value))refuse();const {tip,state}=await read();if(key.startsWith('setup-access:')&&state.journal&&state.journal.phase!=='reviewed')refuse();if(state.vault.some(r=>r.key===key))return false;return !!await append(tip,{...state,sequence:state.sequence+1,vault:[...state.vault,{key,value}]});},
  async replace(key,expected,value){if(!(await cipher).isEncrypted(value))refuse();const {tip,state}=await read();if(!state.vault.some(r=>r.key===key&&r.value===expected))return false;return !!await append(tip,{...state,sequence:state.sequence+1,vault:state.vault.map(r=>r.key===key?{key,value}:r)});}
 };
 return {journal,vault,
  async activate(record:BootstrapRecord,bindings:any[],allowed:(binding:any)=>boolean){
   const {tip,state}=await read(),current=state.journal;
   if(!current||current.phase!=='applying'||current.revision!==record.revision||current.operationId!==record.operationId||current.fingerprint!==record.fingerprint)refuse();
   if(!tip.env||Object.entries(tip.env).some(([name,b]:[string,any])=>!allowed({...b,name}))||new Set(bindings.map(b=>b.name)).size!==bindings.length)refuse();
   const env:Record<string,unknown>={};
   for(const b of bindings){if(b.name==='ASSETS'||/^FRONTBASE_SETUP_METADATA(?:_\d{2})?$/.test(b.name))continue;if(b.type==='d1')env[b.name]={type:'d1',database_id:b.id};else if(b.type==='kv_namespace')env[b.name]={type:b.type,namespace_id:b.namespace_id};else if(b.type==='r2_bucket'&&b.name==='FRONTBASE_R2'&&/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(b.bucket_name??''))env[b.name]={type:b.type,bucket_name:b.bucket_name};else if(b.type==='queue'&&b.name==='FRONTBASE_NATIVE_QUEUE'&&/^[a-z0-9][a-z0-9-]{0,62}$/.test(b.queue_name??''))env[b.name]={type:b.type,queue_name:b.queue_name};else if(['plain_text','secret_text'].includes(b.type)&&typeof b.text==='string')env[b.name]={type:b.type,text:b.text};else refuse();}
   for(const name of Object.keys(tip.env))if(name!=='ASSETS'&&!/^FRONTBASE_SETUP_METADATA(?:_\d{2})?$/.test(name)&&!(name in env))env[name]=null;
   const created=await append(tip,{...state,sequence:state.sequence+1},env);if(!created)refuse();
   await api(root+'scripts/'+project+'/deployments','POST',{strategy:'percentage',versions:[{version_id:created.id,percentage:100}]});
  },
  async claim(environmentValues:Record<string,string>){
   const tip=await latest();if(field(tip))refuse();
   const original=tip.env,allowed=new Set(['FRONTBASE_HOSTED_SETUP','FRONTBASE_BOOTSTRAP','FRONTBASE_INSTALLATION_ID','FRONTBASE_PUBLIC_ORIGIN','FRONTBASE_NATIVE_ACCOUNT','FRONTBASE_NATIVE_PROJECT','FRONTBASE_NATIVE_INSTALLATION_ID','FRONTBASE_NATIVE_PUBLIC_ORIGIN','FRONTBASE_NATIVE_RELAY_URL']);
   if(!original||original.FRONTBASE_BOOTSTRAP?.text!=='native'||original.FRONTBASE_INSTALLATION_ID?.text!==context.installationId||original.FRONTBASE_NATIVE_ACCOUNT?.text!==account||original.FRONTBASE_NATIVE_PROJECT?.text!==project||Object.entries(original).some(([name,b]:[string,any])=>!(name==='ASSETS'&&b.type==='assets'||allowed.has(name)&&b.type==='plain_text')))refuse();
   const deployments=await api(root+'scripts/'+project+'/deployments'),active=deployments?.deployments?.[0]?.versions;
   if(!Array.isArray(active)||active.length!==1||active[0].percentage!==100||active[0].version_id!==tip.id)refuse();
   const env:Record<string,unknown>={};for(const name of Object.keys(original))if(name!=='ASSETS'&&!(name in environmentValues))env[name]=null;
   for(const [name,text]of Object.entries(environmentValues))env[name]={type:['FRONTBASE_BOOTSTRAP','FRONTBASE_INSTALLATION_ID','FRONTBASE_PUBLIC_ORIGIN'].includes(name)?'plain_text':'secret_text',text};
   env.FRONTBASE_BOOTSTRAP_STORE={type:'plain_text',text:'versions-v1'};env.FRONTBASE_BOOTSTRAP_BASE_VERSION={type:'plain_text',text:String(tip.number+1)};
   const created=await append(tip,initial(),env);if(!created)refuse();
   await api(root+'scripts/'+project+'/deployments','POST',{strategy:'percentage',versions:[{version_id:created.id,percentage:100}]});
   return created;
  }
 };
}
