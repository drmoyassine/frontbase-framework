import {createHostedBootstrap} from '@frontbase/backend';
import {guardedExternalFetch} from '../../../packages/backend/src/compat/external-http';
import {reconcileBootstrap} from '@frontbase/edge-core/deployment-bootstrap';
import {d1RunnerFromRest,d1RunnerFromBinding,sqliteRunner,timingSafeEqual} from '@frontbase/edge-infra';
import {admitBootstrapState,sqlBootstrapJournal} from '@frontbase/edge-infra/bootstrap-journal';
import {defaultDeploymentManifest,validateDeploymentManifest,deploymentAdapters} from '@frontbase/edge-core/deployment';
import {profileEnvironment} from '../../../scripts/deployment-setup/profile-environment.mjs';
import assets from 'virtual:bootstrap-assets';
const refuse=()=>{throw Error('cloud_bootstrap_refused');};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hex=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function secret(key:string,purpose:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(purpose))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function bootstrapRuntimeProof(request:Request,env:any,health:()=>Promise<Response>){
 if(new URL(request.url).pathname!=='/frontbase-bootstrap/proof')return null;
 const supplied=request.headers.get('x-frontbase-bootstrap-proof');if(!supplied||!env.FRONTBASE_BOOTSTRAP_PROOF_KEY||!timingSafeEqual(new TextEncoder().encode(await hex(supplied)),new TextEncoder().encode(await hex(env.FRONTBASE_BOOTSTRAP_PROOF_KEY))))return new Response('Not found',{status:404});
 const healthy=(await health()).ok;
 return Response.json({operationId:env.FRONTBASE_BOOTSTRAP_OPERATION,fingerprint:env.FRONTBASE_BOOTSTRAP_FINGERPRINT,healthy,bootstrapDisabled:env.FRONTBASE_BOOTSTRAP!=='1'},{headers:{'cache-control':'no-store'}});
}
export function createCloudBootstrap(env:any,target:'cloudflare'|'vercel',transport:typeof fetch=(input,init)=>fetch(input,init)){
 const installationId=env.FRONTBASE_INSTALLATION_ID,origin=env.FRONTBASE_PUBLIC_ORIGIN,owner=env.FRONTBASE_BOOTSTRAP_TOKEN,token=env.FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN;
 if(env.FRONTBASE_BOOTSTRAP!=='1'||!uuid.test(installationId??'')||typeof owner!=='string'||owner.length<32||typeof token!=='string'||!token||new URL(origin).origin!==origin)refuse();
 const account=env.FRONTBASE_BOOTSTRAP_ACCOUNT,project=env.FRONTBASE_BOOTSTRAP_PROJECT,environment=env.FRONTBASE_BOOTSTRAP_ENVIRONMENT??'production';
 if(!['preview','production'].includes(environment)||!project||!(/^[a-zA-Z0-9_-]{1,100}$/).test(project))refuse();
 if(target==='cloudflare'?!/^[a-f0-9]{32}$/.test(account??''):!/^team_[a-zA-Z0-9]+$/.test(account??''))refuse();
 const context={installationId,target,destination:account+'/'+project+'/'+environment};
 const external:typeof fetch=(input,init)=>guardedExternalFetch(transport,input,init);
 const initialBinding=(b:any)=>b.type==='assets'&&b.name==='ASSETS'||['plain_text','secret_text'].includes(b.type)&&['FRONTBASE_BOOTSTRAP','FRONTBASE_INSTALLATION_ID','FRONTBASE_PUBLIC_ORIGIN','FRONTBASE_BOOTSTRAP_TOKEN','FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN','FRONTBASE_BOOTSTRAP_EXPIRES_AT','FRONTBASE_BOOTSTRAP_ACCOUNT','FRONTBASE_BOOTSTRAP_PROJECT','FRONTBASE_BOOTSTRAP_ENVIRONMENT'].includes(b.name);
 const apiOrigin=target==='cloudflare'?'https://api.cloudflare.com':'https://api.vercel.com';
 async function api(path:string,method='GET',body?:any){
  const response=await transport(apiOrigin+path,{method,headers:{authorization:'Bearer '+token,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)});
  const reader=response.body?.getReader();if(!reader)refuse();let bytes=0,text='';const decoder=new TextDecoder();try{for(;;){const part=await reader!.read();if(part.done)break;bytes+=part.value.length;if(bytes>1048576)refuse();text+=decoder.decode(part.value,{stream:true});}}finally{await reader!.cancel().catch(()=>{});}
  let data;try{data=JSON.parse(text+decoder.decode());}catch{refuse();}if(!response.ok||data.success===false){console.warn('bootstrap_provider_refused',response.status);const e:any=Error('provider_request_refused');e.status=response.status;e.code=data?.error?.code;throw e;}return target==='cloudflare'?data.result:data;
 }
 const team='teamId='+encodeURIComponent(account),cf='/client/v4/accounts/'+account;
 const prefix='FB_SETUP_'+installationId.replaceAll('-','').toUpperCase()+'_';
 const coordinatorName='fb-setup-'+installationId;let coordinatorId:string|undefined;
 const runner=(id:string)=>d1RunnerFromRest({accountId:account,databaseId:id,apiToken:token,fetchImpl:(input,init)=>transport(input,{...init,redirect:'manual',signal:AbortSignal.timeout(20000)})});
 async function locate(){if(coordinatorId)return coordinatorId;const rows=await api(cf+'/d1/database?name='+encodeURIComponent(coordinatorName)+'&per_page=100');if(!Array.isArray(rows))refuse();const matches=rows.filter(r=>r.name===coordinatorName);if(matches.length>1)refuse();if(matches[0]){if(!uuid.test(matches[0].uuid))refuse();coordinatorId=matches[0].uuid;}return coordinatorId;}
 async function initialize(){if(target!=='cloudflare')return;let id=await locate();if(!id){try{const created=await api(cf+'/d1/database','POST',{name:coordinatorName});if(!uuid.test(created?.uuid))refuse();coordinatorId=id=created.uuid;}catch(error){id=await locate();if(!id)throw error;}}await admitBootstrapState(runner(id!),context);}
 async function records(){const data=await api('/v9/projects/'+project+'/env?'+team);if(!Array.isArray(data.envs)||data.envs.length>1000)refuse();const rows=data.envs.filter(r=>r.key?.startsWith(prefix));for(const row of rows)if(row.gitBranch||!Array.isArray(row.target)||row.target.length!==1||row.target[0]!==environment||row.type!=='plain')refuse();return rows.map(row=>{const n=Number(row.key.slice(prefix.length));if(!Number.isInteger(n)||n<0||n>100||row.key!==prefix+n)refuse();return {n,record:JSON.parse(row.value)};}).sort((a,b)=>a.n-b.n);}
 const journal:any={read:async(c:any)=>{if(JSON.stringify(c)!==JSON.stringify(context))refuse();if(target==='cloudflare'){const id=await locate();if(!id)return null;const db=runner(id);if(!(await db.query("SELECT name FROM sqlite_schema WHERE name='_frontbase_bootstrap'")).length){await empty(db);return null;}return sqlBootstrapJournal(db,context).read(context);}const rows=await records();for(let i=0;i<rows.length;i++)if(rows[i].n!==i||rows[i].record.revision!==i||rows[i].record.installationId!==installationId||rows[i].record.destination!==context.destination||rows[i].record.target!==target)refuse();return rows.at(-1)?.record??null;},compareAndSwap:async(c:any,revision:any,next:any)=>{
  if(JSON.stringify(c)!==JSON.stringify(context)||next.revision!==(revision??-1)+1||next.installationId!==installationId||next.destination!==context.destination)refuse();
  if(target==='cloudflare'){const id=await locate();if(!id)refuse();return sqlBootstrapJournal(runner(id!),context).compareAndSwap(context,revision,next);}
  const current=await journal.read(c);if((current?.revision??null)!==revision)return false;
  try{const result=await api('/v10/projects/'+project+'/env?'+team,'POST',{key:prefix+next.revision,value:JSON.stringify(next),type:'plain',target:[environment]});if(result.failed?.length)return false;if(!result.created?.id&&!result.id&&!(Array.isArray(result.created)&&result.created.length===1&&result.created[0].id))refuse();return true;}catch(e:any){if(e.status===400&&['ENV_CONFLICT','ENV_ALREADY_EXISTS','env_already_exists'].includes(e.code))return false;throw e;}
 }};
 async function configuration(){const manifest=defaultDeploymentManifest(target,environment);if(target==='cloudflare'){const id=await locate();if(id)manifest.bindings['state-db']={adapterId:'cloudflare-d1',mode:'reuse',config:{resourceName:coordinatorName},resourceRef:id,secretRefs:{}};manifest.bindings.cache.config.resourceName=project+'-cache';manifest.bindings.storage.config.resourceName=project+'-storage';}if(target==='vercel')manifest.bindings['state-db']={adapterId:'libsql-http',mode:'connect',config:{url:''},secretRefs:{token:'state/token'}};return {manifest,adapters:deploymentAdapters.filter(a=>a.targets.includes(target)&&['cloudflare-d1','cloudflare-kv','libsql-http','d1-http','upstash-http','libsql-vector-http','cloudflare-vectorize-http','s3-http','qstash-http'].includes(a.id))};}
 async function empty(db:any,owned=false){const rows=await db.query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_METADATA','_cf_KV'"+(owned?",'_frontbase_bootstrap'":'')+") LIMIT 1");if(rows.length)refuse();}
 async function preflight(c:any,manifest:any){if(c.destination!==context.destination||manifest.target!==target||manifest.environment!==environment||!validateDeploymentManifest(manifest).ready)refuse();
  if(target==='cloudflare'){const settings=await api(cf+'/workers/scripts/'+project+'/settings');const bindings=settings.bindings;if(!Array.isArray(bindings)||bindings.find(b=>b.name==='FRONTBASE_INSTALLATION_ID')?.text!==installationId||bindings.find(b=>b.name==='FRONTBASE_BOOTSTRAP')?.text!=='1'||bindings.some(b=>!initialBinding(b)))refuse();}
  else{const deployment=await api('/v13/deployments/'+env.VERCEL_DEPLOYMENT_ID+'?'+team);if(deployment.projectId!==project||deployment.readyState!=='READY'||(deployment.target??'preview')!==environment)refuse();}
  for(const b of Object.values(manifest.bindings) as any[])if(b.mode!=='disabled'&&!['cloudflare-d1','cloudflare-kv','libsql-http','d1-http','upstash-http','libsql-vector-http','cloudflare-vectorize-http','s3-http','qstash-http'].includes(b.adapterId))refuse();
 }
 async function runtimeValues(record:any,credentials:any){const values=profileEnvironment({manifest:record.manifest,credentials});values.SESSION_SECRET=await secret(owner,'session:'+record.operationId);values.SETUP_TOKEN=await secret(owner,'administrator:'+installationId);values.SETUP_EXPIRES_AT=env.FRONTBASE_BOOTSTRAP_EXPIRES_AT;values.FRONTBASE_PUBLIC_ORIGIN=origin;values.FRONTBASE_BOOTSTRAP='0';values.FRONTBASE_INSTALLATION_ID=installationId;values.FRONTBASE_BOOTSTRAP_ACCOUNT=account;values.FRONTBASE_BOOTSTRAP_PROJECT=project;values.FRONTBASE_BOOTSTRAP_ENVIRONMENT=environment;values.FRONTBASE_BOOTSTRAP_OPERATION=record.operationId;values.FRONTBASE_BOOTSTRAP_FINGERPRINT=record.fingerprint;values.FRONTBASE_BOOTSTRAP_PROOF_KEY=await secret(owner,'proof:'+record.operationId);if(values.FRONTBASE_STORAGE){const s=JSON.parse(values.FRONTBASE_STORAGE);if(s.provider!=='none'){s.namespace='installation-'+installationId;values.FRONTBASE_STORAGE=JSON.stringify(s);}}return values;}
 const executor:any={preflight,apply:async(record:any,credentials:any)=>{
  const values=await runtimeValues(record,credentials),manifest=structuredClone(record.manifest),state=manifest.bindings['state-db'];
  if(state.mode==='connect'){const db=state.adapterId==='libsql-http'?sqliteRunner(values.APP_DB_URL,values.APP_DB_AUTH_TOKEN,external):d1RunnerFromRest({accountId:values.APP_DB_D1_ACCOUNT_ID,databaseId:values.APP_DB_D1_DATABASE_ID,apiToken:values.CLOUDFLARE_API_TOKEN,fetchImpl:external});await empty(db);}
  if(target==='cloudflare'){
   const bindings:any[]=[{type:'d1',name:'FRONTBASE_SETUP_JOURNAL',id:await locate()}];const settings=await api(cf+'/workers/scripts/'+project+'/settings');if(!Array.isArray(settings.bindings)||settings.bindings.some((b:any)=>!initialBinding(b)))refuse();for(const b of settings.bindings)if(b.type==='assets'&&b.name==='ASSETS')bindings.push(b);
   if(state.adapterId==='cloudflare-d1'){if(state.mode==='create'){const created=await api(cf+'/d1/database','POST',{name:state.config.resourceName});state.resourceRef=created?.uuid;state.mode='reuse';}if(state.mode!=='reuse'||!uuid.test(state.resourceRef??''))refuse();await empty(runner(state.resourceRef),state.resourceRef===await locate());bindings.push({type:'d1',name:'DB',id:state.resourceRef});}
   const cache=manifest.bindings.cache;if(cache.adapterId==='cloudflare-kv'&&cache.mode!=='disabled'){let id=cache.resourceRef;if(cache.mode==='create'){const created=await api(cf+'/storage/kv/namespaces','POST',{title:cache.config.resourceName});id=created?.id;}if(!/^[a-f0-9]{32}$/.test(id??''))refuse();if(cache.mode==='reuse'){const keys=await api(cf+'/storage/kv/namespaces/'+id+'/keys?limit=1');if(!Array.isArray(keys)||keys.length)refuse();}bindings.push({type:'kv_namespace',name:'FRONTBASE_KV',namespace_id:id});cache.mode='reuse';cache.resourceRef=id;}
   values.FRONTBASE_DEPLOYMENT_MANIFEST=JSON.stringify(manifest);for(const [name,value] of Object.entries(values))bindings.push({type:['FRONTBASE_BOOTSTRAP','FRONTBASE_INSTALLATION_ID','FRONTBASE_DEPLOYMENT_MANIFEST','FRONTBASE_PUBLIC_ORIGIN','FRONTBASE_BOOTSTRAP_OPERATION','FRONTBASE_BOOTSTRAP_FINGERPRINT'].includes(name)?'plain_text':'secret_text',name,text:value});
   const form=new FormData();form.set('settings',JSON.stringify({bindings}));await api(cf+'/workers/scripts/'+project+'/settings','PATCH',form);
  }else{
   const variables=Object.entries(values).map(([key,value])=>({key,value,type:'encrypted',target:[environment]}));const updated=await api('/v10/projects/'+project+'/env?'+team+'&upsert=true','POST',variables);if(updated.failed?.length)refuse();
   await api('/v13/deployments?'+team,'POST',{name:env.FRONTBASE_BOOTSTRAP_PROJECT_NAME,project,deploymentId:env.VERCEL_DEPLOYMENT_ID,withLatestCommit:false,...(environment==='production'?{target:'production'}:{}),meta:{frontbaseOperation:record.operationId,frontbaseManifest:record.fingerprint}});
  }
 },inspect:async(record:any)=>{
  if(target==='vercel'){const list=await api('/v6/deployments?'+team+'&projectId='+project+'&limit=20');const matches=list.deployments?.filter(d=>d.meta?.frontbaseOperation===record.operationId&&d.meta?.frontbaseManifest===record.fingerprint&&(d.target??'preview')===environment);if(matches?.length!==1||matches[0].state!=='READY')return null;}
  const response=await transport(origin+'/frontbase-bootstrap/proof',{headers:{'x-frontbase-bootstrap-proof':await secret(owner,'proof:'+record.operationId)},redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)return null;const proof=await response.json();return proof;
 }};
 const nextSetup=async()=>'/setup#/setup?claim='+await secret(owner,'administrator:'+installationId);
 let appPromise:Promise<any>|undefined;
 return {journal,executor,initialize,configuration,context,fetch:async(request:Request)=>{
  if(new URL(request.url).origin!==origin)return new Response('Invalid origin',{status:403});
  if(!appPromise)appPromise=nextSetup().then(link=>createHostedBootstrap({enabled:true,origin,token:owner,expiresAt:env.FRONTBASE_BOOTSTRAP_EXPIRES_AT,context,journal,executor,initialize,configuration,pendingSetup:true,nextSetup:()=>link}));
  const url=new URL(request.url);if(url.pathname.startsWith('/frontbase-bootstrap/api/'))return (await appPromise).fetch(request);
  const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
  if(url.pathname==='/health')return Response.json({status:'setup_required'},{headers});
  const asset=assets[url.pathname];if(asset&&request.method==='GET')return new Response(asset.body,{headers:{...headers,'content-type':asset.type}});
  return new Response(null,{status:302,headers:{...headers,location:'/frontbase-bootstrap/'}});
 }};
}

/** The newly healthy runtime completes its receipt without replaying provider writes. */
export async function completeCloudBootstrap(env:any,target:'cloudflare'|'vercel',health:()=>Promise<Response>,transport?:typeof fetch){
 if(env.FRONTBASE_BOOTSTRAP!=='0'||!env.FRONTBASE_BOOTSTRAP_OPERATION||!env.FRONTBASE_BOOTSTRAP_FINGERPRINT)return;
 if(target==='vercel'&&!env.FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN)return; // Operator removed temporary provisioning access after receipt completion.
 const context={installationId:env.FRONTBASE_INSTALLATION_ID,target,destination:env.FRONTBASE_BOOTSTRAP_ACCOUNT+'/'+env.FRONTBASE_BOOTSTRAP_PROJECT+'/'+env.FRONTBASE_BOOTSTRAP_ENVIRONMENT};
 const journal=target==='cloudflare'?sqlBootstrapJournal(d1RunnerFromBinding(env.FRONTBASE_SETUP_JOURNAL),context):createCloudBootstrap({...env,FRONTBASE_BOOTSTRAP:'1'},target,transport).journal;
 const record=await journal.read(context);if(!record||record.phase==='active')return;
 await reconcileBootstrap(context,journal,{preflight:async()=>{refuse()},apply:async()=>{refuse()},inspect:async()=>({operationId:env.FRONTBASE_BOOTSTRAP_OPERATION,fingerprint:env.FRONTBASE_BOOTSTRAP_FINGERPRINT,healthy:(await health()).ok,bootstrapDisabled:true})});
}
