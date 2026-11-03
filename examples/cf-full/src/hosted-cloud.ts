import {createHostedBootstrap} from '@frontbase/backend';
import {hostedSetupAccess} from '@frontbase/backend';
import {verifySetupRenewalOwner,verifyVercelSetupOwnerIdentity} from './setup-renewal-owner.js';
import {createSetupOwnerIdentityClient} from '@frontbase/backend';
import {resolveProviderBindingCredentials,createSecretCipher,createProviderOAuth,createProviderOAuthResources,createProviderRelayClient,providerOAuthRelay,providerOAuthClients,providerOAuthVault,type OAuthVault} from '@frontbase/backend';
import {guardedExternalFetch} from '../../../packages/backend/src/compat/external-http';
import {reconcileBootstrap} from '@frontbase/edge-core/deployment-bootstrap';
import {d1RunnerFromRest,d1RunnerFromBinding,sqliteRunner,supabaseRunner,timingSafeEqual} from '@frontbase/edge-infra';
import {admitBootstrapState,sqlBootstrapJournal} from '@frontbase/edge-infra/bootstrap-journal';
import {defaultDeploymentManifest,validateDeploymentManifest} from '@frontbase/edge-core/deployment';
import {profileEnvironment} from '../../../scripts/deployment-setup/profile-environment.mjs';
import {provisionSupabaseHttpState,provisionPostgrestState} from '../../../scripts/deployment-setup/postgres-http-state.mjs';
import {hostedAdapters,activationPage} from './setup-provider-choices.js';
import assets from 'virtual:bootstrap-assets';
import {cloudflareSetupMetadata,setupMetadataBinding} from './cloudflare-setup-metadata.js';
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
export function createCloudBootstrap(env:any,target:'cloudflare'|'vercel',transport:typeof fetch=(input,init)=>fetch(input,init),terminalProof?:{operationId:string;fingerprint:string}){
 const installationId=env.FRONTBASE_INSTALLATION_ID,origin=env.FRONTBASE_PUBLIC_ORIGIN,owner=env.FRONTBASE_BOOTSTRAP_TOKEN,token=env.FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN;
 if(env.FRONTBASE_BOOTSTRAP!=='1'||!uuid.test(installationId??'')||typeof owner!=='string'||owner.length<32||typeof token!=='string'||!token||new URL(origin).origin!==origin)refuse();
 const account=env.FRONTBASE_BOOTSTRAP_ACCOUNT,project=env.FRONTBASE_BOOTSTRAP_PROJECT,environment=env.FRONTBASE_BOOTSTRAP_ENVIRONMENT??'production';
 if(!['preview','production'].includes(environment)||!project||!(/^[a-zA-Z0-9_-]{1,100}$/).test(project))refuse();
 if(target==='cloudflare'?!/^[a-f0-9]{32}$/.test(account??''):!/^team_[a-zA-Z0-9]+$/.test(account??''))refuse();
 const context={installationId,target,destination:account+'/'+project+'/'+environment};
 const external:typeof fetch=(input,init)=>guardedExternalFetch(transport,input,init);
 const oauthKey=(name:string)=>/^FRONTBASE_(CLOUDFLARE|VERCEL|SUPABASE|UPSTASH)_OAUTH_(CLIENT_ID|CLIENT_SECRET|SCOPES|INTEGRATION_SLUG|TEAM_SLUG)$/.test(name);
 const initialBinding=(b:any)=>['FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY','FRONTBASE_UPSTASH_OAUTH_CLIENT_SECRET'].includes(b.name)?b.type==='secret_text':/^FRONTBASE_SETUP_METADATA(?:_\d{2})?$/.test(b.name)?b.type==='plain_text':b.type==='assets'&&b.name==='ASSETS'||['plain_text','secret_text'].includes(b.type)&&(['FRONTBASE_BOOTSTRAP','FRONTBASE_INSTALLATION_ID','FRONTBASE_PUBLIC_ORIGIN','FRONTBASE_BOOTSTRAP_TOKEN','FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN','FRONTBASE_BOOTSTRAP_EXPIRES_AT','FRONTBASE_BOOTSTRAP_ACCOUNT','FRONTBASE_BOOTSTRAP_PROJECT','FRONTBASE_BOOTSTRAP_ENVIRONMENT','FRONTBASE_BOOTSTRAP_OAUTH_GRANTS'].includes(b.name)||oauthKey(b.name)||['FRONTBASE_OAUTH_RELAY_URL','FRONTBASE_OAUTH_RELAY_TARGET','FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY','FRONTBASE_OAUTH_RELAY_ENROLL','FRONTBASE_BOOTSTRAP_STORE','FRONTBASE_BOOTSTRAP_BASE_VERSION',setupMetadataBinding].includes(b.name));
 const apiOrigin=target==='cloudflare'?'https://api.cloudflare.com':'https://api.vercel.com';
 async function api(path:string,method='GET',body?:any,contentType='application/json',credential=token){
  const response=await transport(apiOrigin+path,{method,headers:{authorization:'Bearer '+credential,...(body instanceof FormData?{}:{'content-type':contentType})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)});
  const reader=response.body?.getReader();if(!reader)refuse();let bytes=0,text='';const decoder=new TextDecoder();try{for(;;){const part=await reader!.read();if(part.done)break;bytes+=part.value.length;if(bytes>1048576)refuse();text+=decoder.decode(part.value,{stream:true});}}finally{await reader!.cancel().catch(()=>{});}
  let data;try{data=JSON.parse(text+decoder.decode());}catch{refuse();}if(!response.ok||data.success===false){console.warn('bootstrap_provider_refused',response.status);const e:any=Error('provider_request_refused');e.status=response.status;e.code=data?.error?.code??data?.errors?.[0]?.code;throw e;}return target==='cloudflare'?data.result:data;
 }
 const team='teamId='+encodeURIComponent(account),cf='/client/v4/accounts/'+account;
 const prefix='FB_SETUP_'+installationId.replaceAll('-','').toUpperCase()+'_';
 const coordinatorName='fb-setup-'+installationId;let coordinatorId:string|undefined;
 const metadata=target==='cloudflare'&&env.FRONTBASE_BOOTSTRAP_STORE==='versions-v1'?cloudflareSetupMetadata(context,owner,api,Number(env.FRONTBASE_BOOTSTRAP_BASE_VERSION),terminalProof):undefined;
 if(target==='cloudflare'&&env.FRONTBASE_BOOTSTRAP_STORE!==undefined&&!metadata)refuse();
 const runner=(id:string)=>d1RunnerFromRest({accountId:account,databaseId:id,apiToken:token,fetchImpl:(input,init)=>transport(input,{...init,redirect:'manual',signal:AbortSignal.timeout(20000)})});
 async function locate(){if(coordinatorId)return coordinatorId;const rows=await api(cf+'/d1/database?name='+encodeURIComponent(coordinatorName)+'&per_page=100');if(!Array.isArray(rows))refuse();const matches=rows.filter(r=>r.name===coordinatorName);if(matches.length>1)refuse();if(matches[0]){if(!uuid.test(matches[0].uuid))refuse();coordinatorId=matches[0].uuid;}return coordinatorId;}
 async function initialize(){if(target!=='cloudflare'||metadata)return;let id=await locate();if(!id){try{const created=await api(cf+'/d1/database','POST',{name:coordinatorName});if(!uuid.test(created?.uuid))refuse();coordinatorId=id=created.uuid;}catch(error){id=await locate();if(!id)throw error;}}await admitBootstrapState(runner(id!),context);}
 async function records(){const data=await api('/v9/projects/'+project+'/env?'+team);if(!Array.isArray(data.envs)||data.envs.length>1000)refuse();const rows=data.envs.filter(r=>r.key?.startsWith(prefix));for(const row of rows)if(row.gitBranch||!Array.isArray(row.target)||row.target.length!==1||row.target[0]!==environment||row.type!=='plain')refuse();return rows.map(row=>{const n=Number(row.key.slice(prefix.length));if(!Number.isInteger(n)||n<0||n>100||row.key!==prefix+n)refuse();return {n,record:JSON.parse(row.value)};}).sort((a,b)=>a.n-b.n);}
 const journal:any={read:async(c:any)=>{if(JSON.stringify(c)!==JSON.stringify(context))refuse();if(metadata)return metadata.journal.read(c);if(target==='cloudflare'){const id=await locate();if(!id)return null;const db=runner(id);if(!(await db.query("SELECT name FROM sqlite_schema WHERE name='_frontbase_bootstrap'")).length){await empty(db);return null;}return sqlBootstrapJournal(db,context).read(context);}const rows=await records();for(let i=0;i<rows.length;i++)if(rows[i].n!==i||rows[i].record.revision!==i||rows[i].record.installationId!==installationId||rows[i].record.destination!==context.destination||rows[i].record.target!==target)refuse();return rows.at(-1)?.record??null;},compareAndSwap:async(c:any,revision:any,next:any)=>{
  if(JSON.stringify(c)!==JSON.stringify(context)||next.revision!==(revision??-1)+1||next.installationId!==installationId||next.destination!==context.destination)refuse();
  if(metadata)return metadata.journal.compareAndSwap(c,revision,next);
  if(target==='cloudflare'){const id=await locate();if(!id)refuse();return sqlBootstrapJournal(runner(id!),context).compareAndSwap(context,revision,next);}
  const current=await journal.read(c);if((current?.revision??null)!==revision)return false;
  try{const result=await api('/v10/projects/'+project+'/env?'+team,'POST',{key:prefix+next.revision,value:JSON.stringify(next),type:'plain',target:[environment]});if(result.failed?.length)return false;if(!result.created?.id&&!result.id&&!(Array.isArray(result.created)&&result.created.length===1&&result.created[0].id))refuse();return true;}catch(e:any){if(e.status===400&&['ENV_CONFLICT','ENV_ALREADY_EXISTS','env_already_exists'].includes(e.code))return false;throw e;}
 }};
 // Hosted PostgreSQL state uses HTTPS on both targets. Provisioned selections
 // become the existing PostgREST runtime profile only after the journal claim.
 async function resourceOptions(){const resourceOptions:Record<string,{id:string;name:string}[]>={};if(target==='cloudflare'){let databases;try{databases=await api(cf+'/d1/database?per_page=100');}catch(error){if(!metadata)throw error;databases=[];}if(!Array.isArray(databases))refuse();resourceOptions['cloudflare-d1']=databases.map(d=>({id:d.uuid,name:d.name}));}return resourceOptions;}
 async function configuration(){const manifest=defaultDeploymentManifest(target,environment);if(target==='cloudflare'){const id=metadata?undefined:await locate();if(metadata)manifest.bindings['state-db'].config.resourceName=project.slice(0,45)+'-state-production';if(id)manifest.bindings['state-db']={adapterId:'cloudflare-d1',mode:'reuse',config:{resourceName:coordinatorName},resourceRef:id,secretRefs:{}};manifest.bindings.cache.config.resourceName=project+'-cache';manifest.bindings.storage.config.resourceName=project+'-storage';}if(target==='vercel')manifest.bindings['state-db']={adapterId:'libsql-http',mode:'connect',config:{url:''},secretRefs:{token:'state/token'}};return {manifest,adapters:hostedAdapters(target)};}
 async function empty(db:any,owned=false){const rows=await db.query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_METADATA','_cf_KV'"+(owned?",'_frontbase_bootstrap','_frontbase_oauth_vault'":'')+") LIMIT 1");if(rows.length)refuse();}
 async function privateR2(name:string){const path=cf+'/r2/buckets/'+encodeURIComponent(name),bucket=await api(path);if(bucket?.name!==name)throw Error('storage_bucket_unavailable');const managed=await api(path+'/domains/managed'),custom=await api(path+'/domains/custom');if(managed?.enabled!==false||!Array.isArray(custom?.domains)||custom.domains.length)throw Error('storage_requires_private_bucket');}
 async function unusedQueue(id:string,name:string){if(!/^[a-f0-9]{32}$/.test(id??''))throw Error('invalid_queue_identity');const actual=await api(cf+'/queues/'+id);if(actual?.queue_id!==id||actual.queue_name!==name||!Array.isArray(actual.consumers)||!Array.isArray(actual.producers)||actual.consumers.length||actual.producers.length||actual.consumers_total_count>0||actual.producers_total_count>0)throw Error('queue_requires_unused_resource');}
 async function preflight(c:any,manifest:any){if(c.destination!==context.destination||manifest.target!==target||manifest.environment!==environment||!validateDeploymentManifest(manifest).ready)refuse();
  if(manifest.bindings['state-db'].adapterId==='supabase-postgres'&&!['create','reuse'].includes(manifest.bindings['state-db'].mode))refuse();
  if(target==='cloudflare'){const settings=await api(cf+'/workers/scripts/'+project+'/settings');const bindings=settings.bindings;if(!Array.isArray(bindings)||bindings.find(b=>b.name==='FRONTBASE_INSTALLATION_ID')?.text!==installationId||bindings.find(b=>b.name==='FRONTBASE_BOOTSTRAP')?.text!=='1'||bindings.some(b=>!initialBinding(b)))refuse();

  }
  else{const deployment=await api('/v13/deployments/'+env.VERCEL_DEPLOYMENT_ID+'?'+team);if(deployment.projectId!==project||deployment.readyState!=='READY'||(deployment.target??'preview')!==environment)refuse();}
  const enabled=Object.entries(manifest.bindings).filter(([,binding]:any)=>binding.mode!=='disabled');
  const allowed=hostedAdapters(target);
  async function checkBinding(role:string,b:any){
   if(!allowed.some(a=>a.id===b.adapterId&&a.role===role))refuse();
   if(['cloudflare-d1','cloudflare-kv','cloudflare-r2','cloudflare-queue'].includes(b.adapterId)&&b.config.accountId&&b.config.accountId!==account)throw Error('native_resource_account_mismatch');
   const state=b;if(state.adapterId==='cloudflare-d1'){
    if(state.mode==='create'){const rows=await api(cf+'/d1/database?name='+encodeURIComponent(state.config.resourceName)+'&per_page=100');if(!Array.isArray(rows))refuse();if(rows.some(r=>r.name===state.config.resourceName))throw Error('setup_database_already_exists');}
    if(state.mode==='reuse')await empty(runner(state.resourceRef),!metadata&&state.resourceRef===await locate());
   }
   if(b.adapterId==='cloudflare-r2'){
    if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(b.mode==='reuse'?b.resourceRef??'':b.config.resourceName??''))throw Error('invalid_r2_bucket_name');
    if(b.mode==='reuse')await privateR2(b.resourceRef);
   }
   if(b.adapterId==='cloudflare-queue'){
    if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(b.config.resourceName??''))throw Error('invalid_queue_name');
    if(b.mode==='reuse')await unusedQueue(b.resourceRef,b.config.resourceName);
   }
  }
  let next=0;
  const failures=new Map<string,string>();
  async function readBindings(){
   while(next<enabled.length){
    const [role,binding]=enabled[next++];
    try{await checkBinding(role,binding);}
    catch(error){failures.set(role,error instanceof Error?error.message:'binding_check_failed');}
   }
  }
  // Ownership is verified before the pool starts. Only read-only checks may run here.
  await Promise.all(Array.from({length:Math.min(3,enabled.length)},readBindings));
  const issues=enabled.filter(([role])=>failures.has(role)).map(([role])=>({role,code:failures.get(role)}));
  if(issues.length)throw Object.assign(Error('binding_review_failed'),{bindingIssues:issues});
 }
 async function runtimeValues(record:any,credentials:any){const values=profileEnvironment({manifest:record.manifest,credentials});values.SESSION_SECRET=await secret(owner,'session:'+record.operationId);values.SETUP_TOKEN=await secret(owner,'administrator:'+installationId);values.SETUP_EXPIRES_AT=new Date(Date.now()+3600000).toISOString();values.FRONTBASE_PUBLIC_ORIGIN=origin;values.FRONTBASE_BOOTSTRAP='0';values.FRONTBASE_INSTALLATION_ID=installationId;values.FRONTBASE_BOOTSTRAP_ACCOUNT=account;values.FRONTBASE_BOOTSTRAP_PROJECT=project;values.FRONTBASE_BOOTSTRAP_ENVIRONMENT=environment;values.FRONTBASE_BOOTSTRAP_OPERATION=record.operationId;values.FRONTBASE_BOOTSTRAP_FINGERPRINT=record.fingerprint;if(metadata)for(const name of ['FRONTBASE_BOOTSTRAP_STORE','FRONTBASE_BOOTSTRAP_BASE_VERSION','FRONTBASE_BOOTSTRAP_TOKEN','FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN','FRONTBASE_BOOTSTRAP_EXPIRES_AT'])values[name]=env[name];values.FRONTBASE_BOOTSTRAP_PROOF_KEY=await secret(owner,'proof:'+record.operationId);if(values.FRONTBASE_STORAGE){const s=JSON.parse(values.FRONTBASE_STORAGE);if(s.provider!=='none'){s.namespace='installation-'+installationId;values.FRONTBASE_STORAGE=JSON.stringify(s);}}for(const [name,value] of Object.entries(env))if((oauthKey(name)||['FRONTBASE_OAUTH_CONNECTIONS','FRONTBASE_OAUTH_RELAY_URL','FRONTBASE_OAUTH_RELAY_TARGET','FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY','FRONTBASE_OAUTH_RELAY_ENROLL'].includes(name))&&typeof value==='string')values[name]=value;return values;}
 const executor:any={preflight,apply:async(record:any,credentials:any)=>{
  let prepared={manifest:structuredClone(record.manifest),credentials:{...credentials}}; const selected=prepared.manifest.bindings['state-db']; const provisioned=['supabase-postgres','postgrest-http'].includes(selected.adapterId)&&['create','reuse'].includes(selected.mode); if(selected.adapterId==='supabase-postgres')prepared=await provisionSupabaseHttpState(prepared,{fetch:external,installationId}); else if(provisioned)prepared=await provisionPostgrestState(prepared,{fetch:external,installationId}); const values=await runtimeValues({...record,manifest:prepared.manifest},prepared.credentials),manifest=prepared.manifest,state=manifest.bindings['state-db'];
  if(state.mode==='connect'&&!provisioned){
   // postgrest-http emptiness probes the application schema over PostgREST (the sqlite_schema
   // query below cannot run there); libsql-http and d1-http keep the shared sqlite check.
   if(state.adapterId==='postgrest-http'){const probe=supabaseRunner({url:values.APP_DB_POSTGREST_URL,serviceKey:values.APP_DB_POSTGREST_TOKEN,restUrl:values.APP_DB_POSTGREST_URL,schema:values.APP_DB_POSTGRES_SCHEMA,fetchImpl:external});const schema=(values.APP_DB_POSTGRES_SCHEMA||'public').replace(/'/g,"''");const rows=await probe.query(`SELECT tablename FROM pg_tables WHERE schemaname='${schema}' LIMIT 1`);if(!Array.isArray(rows)||rows.length)refuse();}
   else{const db=state.adapterId==='libsql-http'?sqliteRunner(values.APP_DB_URL,values.APP_DB_AUTH_TOKEN,external):d1RunnerFromRest({accountId:values.APP_DB_D1_ACCOUNT_ID,databaseId:values.APP_DB_D1_DATABASE_ID,apiToken:values.CLOUDFLARE_API_TOKEN,fetchImpl:external});await empty(db);}
  }
  if(target==='cloudflare'){
   const bindings:any[]=metadata?[]:[{type:'d1',name:'FRONTBASE_SETUP_JOURNAL',id:await locate()}];const settings=await api(cf+'/workers/scripts/'+project+'/settings');if(!Array.isArray(settings.bindings)||settings.bindings.some((b:any)=>!initialBinding(b)))refuse();for(const b of settings.bindings)if(b.type==='assets'&&b.name==='ASSETS')bindings.push(b);else if(metadata&&/^FRONTBASE_SETUP_METADATA(?:_\d{2})?$/.test(b.name)&&b.type==='plain_text')bindings.push(b);
   if(state.adapterId==='cloudflare-d1'){if(state.mode==='create'){const created=await api(cf+'/d1/database','POST',{name:state.config.resourceName});state.resourceRef=created?.uuid;state.mode='reuse';}if(state.mode!=='reuse'||!uuid.test(state.resourceRef??''))refuse();await empty(runner(state.resourceRef),!metadata&&state.resourceRef===await locate());bindings.push({type:'d1',name:'DB',id:state.resourceRef});}
   const cache=manifest.bindings.cache;if(cache.adapterId==='cloudflare-kv'&&cache.mode!=='disabled'){let id=cache.resourceRef;if(cache.mode==='create'){const created=await api(cf+'/storage/kv/namespaces','POST',{title:cache.config.resourceName});id=created?.id;}if(!/^[a-f0-9]{32}$/.test(id??''))refuse();if(cache.mode==='reuse'){const keys=await api(cf+'/storage/kv/namespaces/'+id+'/keys?limit=10');if(!Array.isArray(keys)||keys.length)refuse();}bindings.push({type:'kv_namespace',name:'FRONTBASE_KV',namespace_id:id});cache.mode='reuse';cache.resourceRef=id;}
   const storage=manifest.bindings.storage;if(storage.adapterId==='cloudflare-r2'&&storage.mode!=='disabled'){
    const name=storage.mode==='reuse'?storage.resourceRef:storage.config.resourceName;if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name??''))throw Error('invalid_r2_bucket_name');
    if(storage.mode==='create')await api(cf+'/r2/buckets','POST',{name});
    else await privateR2(name);
    bindings.push({type:'r2_bucket',name:'FRONTBASE_R2',bucket_name:name});storage.mode='reuse';storage.resourceRef=name;
   }
   const queue=manifest.bindings.queue;if(queue.adapterId==='cloudflare-queue'&&queue.mode!=='disabled'){
    let id=queue.resourceRef;if(queue.mode==='create'){if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(queue.config.resourceName??''))throw Error('invalid_queue_name');const created=await api(cf+'/queues','POST',{queue_name:queue.config.resourceName});id=created?.queue_id;}
    if(!/^[a-f0-9]{32}$/.test(id??''))throw Error('invalid_queue_identity');
    await unusedQueue(id,queue.config.resourceName);
    bindings.push({type:'queue',name:'FRONTBASE_NATIVE_QUEUE',queue_name:queue.config.resourceName});
    values.FRONTBASE_QUEUE=JSON.stringify({provider:'cloudflare_queue',url:'queue://'+queue.config.resourceName});values.FRONTBASE_QUEUE_CALLBACK_SECRET=await secret(owner,'queue:'+installationId);
    // Consumer creation is journaled with the rest of Apply. An uncertain response must be inspected,
    // never repeated. The old runtime has no queue handler and delivery retries until activation.
    await api(cf+'/queues/'+id+'/consumers','POST',{type:'worker',script_name:project,settings:{batch_size:10,max_retries:3}});queue.mode='reuse';queue.resourceRef=id;
   }
   values.FRONTBASE_DEPLOYMENT_MANIFEST=JSON.stringify(manifest);for(const [name,value] of Object.entries(values))bindings.push({type:['FRONTBASE_BOOTSTRAP','FRONTBASE_INSTALLATION_ID','FRONTBASE_DEPLOYMENT_MANIFEST','FRONTBASE_PUBLIC_ORIGIN','FRONTBASE_BOOTSTRAP_OPERATION','FRONTBASE_BOOTSTRAP_FINGERPRINT','FRONTBASE_BOOTSTRAP_STORE','FRONTBASE_BOOTSTRAP_BASE_VERSION'].includes(name)?'plain_text':'secret_text',name,text:value});
   if(metadata)await metadata.activate(record,bindings,initialBinding);
   else{const form=new FormData();form.set('settings',JSON.stringify({bindings}));await api(cf+'/workers/scripts/'+project+'/settings','PATCH',form);}
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
 const oauthPrefix='FB_OAUTH_'+installationId.replaceAll('-','').toUpperCase()+'_';
 const vault:OAuthVault={
  get:async key=>metadata?metadata.vault.get(key):(await vault.entries(key)).find(r=>r.key===key)?.value??null,
  entries:async key=>{
   if(metadata)return metadata.vault.entries(key);
   if(target==='cloudflare'){const id=await locate();if(!id)refuse();const db=runner(id!);await db.exec('CREATE TABLE IF NOT EXISTS _frontbase_oauth_vault (key TEXT PRIMARY KEY, value TEXT NOT NULL)');return (await db.query('SELECT key,value FROM _frontbase_oauth_vault WHERE key LIKE ?',[key+'%'])).map(r=>({key:String(r.key),value:String(r.value)}));}
   const result=await api('/v9/projects/'+project+'/env?'+team);return result.envs.filter(r=>r.key.startsWith(oauthPrefix)).map(r=>{if(r.type!=='plain'||r.gitBranch||r.target?.length!==1||r.target[0]!==environment)refuse();return JSON.parse(r.value);}).filter(r=>r.key.startsWith(key));
  },
  insert:async(key,value)=>{
   if(metadata)return metadata.vault.insert(key,value);
   if(target==='cloudflare'){await vault.entries(key);const db=runner((await locate())!);return (await db.query('INSERT INTO _frontbase_oauth_vault (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING RETURNING key',[key,value])).length===1;}
   try{const result=await api('/v10/projects/'+project+'/env?'+team,'POST',{key:oauthPrefix+await hex(key),value:JSON.stringify({key,value}),type:'plain',target:[environment]});if(result.failed?.length)return false;return !!(result.id||result.created?.id||Array.isArray(result.created)&&result.created[0]?.id);}catch(e:any){if(e.status===400&&['ENV_CONFLICT','ENV_ALREADY_EXISTS','env_already_exists'].includes(e.code))return false;throw e;}
  },
  replace:async(key,expected,value)=>{
   // Grant rotation: swap only the record that was inspected before the refresh call.
   if(metadata)return metadata.vault.replace!(key,expected,value);
   if(target==='cloudflare'){await vault.entries(key);const db=runner((await locate())!);return (await db.query('UPDATE _frontbase_oauth_vault SET value = ? WHERE key = ? AND value = ? RETURNING key',[value,key,expected])).length===1;}
   if((await vault.get(key))!==expected)return false;
   try{const result=await api('/v10/projects/'+project+'/env?'+team+'&upsert=true','POST',{key:oauthPrefix+await hex(key),value:JSON.stringify({key,value}),type:'plain',target:[environment]});return !result.failed?.length&&!!(result.id||result.created?.id||Array.isArray(result.created)&&result.created[0]?.id);}catch{return false;}
  },
 };
 const actor={tenant:'_root',subject:installationId};
 const accessPromise=createSecretCipher(owner).then(cipher=>hostedSetupAccess(vault,cipher,context,owner,env.FRONTBASE_BOOTSTRAP_EXPIRES_AT));
 async function recoveryEligible(){const phase=(await journal.read(context))?.phase;if(phase&&phase!=='reviewed')throw Error(phase==='active'?'setup_already_installed':'setup_operation_held');}
 async function recoveryAvailable(){
  const relay=providerOAuthRelay(env,origin);if(!relay?.registrationKey)return false;if(target==='cloudflare')return !!metadata;
  try{const response=await transport(relay.relayOrigin+'/setup-owner/vercel/status',{redirect:'manual',signal:AbortSignal.timeout(10000)});if(!response.ok||!response.body)return false;const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder();try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>4096)return false;text+=decoder.decode(p.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(text+decoder.decode()).available===true;}catch{return false;}
 }
 let recoveryPromise:Promise<any>|undefined;
 async function recovery(){
  if(target==='cloudflare'&&!metadata)throw Error('setup_renewal_unavailable');
  if(!recoveryPromise)recoveryPromise=createSecretCipher(owner).then(cipher=>{
   const relay=providerOAuthRelay(env,origin);if(!relay?.registrationKey)throw Error('setup_renewal_unavailable');
   if(target==='vercel')return createSetupOwnerIdentityClient({...relay,registrationKey:relay.registrationKey,cipher,fetch:transport,authorize:async request=>{
    if(new URL(request.url).origin!==origin)return null;await recoveryEligible();const access=await(await accessPromise).read();return {tenant:actor.tenant,subject:actor.subject+':renew:'+access.generation};
   },establish:async(identity,pendingActor)=>{
    await recoveryEligible();const access=await(await accessPromise).read();if(pendingActor.subject!==actor.subject+':renew:'+access.generation)throw Error('setup_renewal_conflict');
    const grant=(await(await oauth()).refresh(providerOAuthClients(env,origin),{fetch:transport})).find(g=>g.provider==='vercel');if(!grant)throw Error('setup_ownership_refused');
    await verifyVercelSetupOwnerIdentity(context,identity,grant,transport);await verifySetupRenewalOwner(context,origin,owner,grant,transport);
    await recoveryEligible();const renewed=await(await accessPromise).renew(access.generation);await recoveryEligible();console.info('bootstrap_access_renewed');return '/frontbase-bootstrap/#claim='+renewed.token;
   }});
   return createProviderRelayClient({...relay,mode:'setup-renewal',cipher,fetch:transport,authorize:async request=>{
    if(new URL(request.url).origin!==origin)return null;
    await recoveryEligible();const access=await(await accessPromise).read();return {tenant:actor.tenant,subject:actor.subject+':renew:'+access.generation};
   },establish:async(grant,_request,_registration,pendingActor)=>{
    await recoveryEligible();const access=await(await accessPromise).read();
    if(pendingActor?.subject!==actor.subject+':renew:'+access.generation)throw Error('setup_renewal_conflict');
    await verifySetupRenewalOwner(context,origin,owner,grant,transport);
    // Reinspect after external ownership checks; a concurrent Apply stays fenced.
    // Prove edit authority with the fresh visitor grant, never with the app's
    // retained grant: a provider viewer must not inherit provisioning access.
    const renewalVault=metadata?cloudflareSetupMetadata(context,owner,(path,method,body,type)=>api(path,method,body,type,grant.accessToken),Number(env.FRONTBASE_BOOTSTRAP_BASE_VERSION)).vault:{...vault,insert:async(key:string,value:string)=>{
     try{const result=await api('/v10/projects/'+project+'/env?'+team,'POST',{key:oauthPrefix+await hex(key),value:JSON.stringify({key,value}),type:'plain',target:[environment]},'application/json',grant.accessToken);if(result.failed?.length)return false;return !!(result.id||result.created?.id||Array.isArray(result.created)&&result.created[0]?.id);}catch(e:any){if(e.status===400&&['ENV_CONFLICT','ENV_ALREADY_EXISTS','env_already_exists'].includes(e.code))return false;throw e;}
    }};
    const renewable=hostedSetupAccess(renewalVault,cipher,context,owner,env.FRONTBASE_BOOTSTRAP_EXPIRES_AT);
    await recoveryEligible();const renewed=await renewable.renew(access.generation);await recoveryEligible();
    console.info('bootstrap_access_renewed');return '/frontbase-bootstrap/#claim='+renewed.token;
   }});
  });return recoveryPromise;
 }
 let oauthPromise:Promise<any>|undefined;
 async function oauth(){
  return oauthPromise??=createSecretCipher(owner).then(async cipher=>{
   const connection=providerOAuthVault(vault,cipher,actor);
   if(env.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS){
    if(typeof env.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS!=='string'||!cipher.isEncrypted(env.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS))refuse();
    const imported=JSON.parse(await cipher.decrypt(env.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS));if(!Array.isArray(imported)||imported.length!==1||imported[0]?.provider!==target)refuse();
    const grant=imported[0];if(!(await connection.grants()).some(g=>g.provider===grant.provider&&g.accessToken===grant.accessToken)){
     try{await connection.store.save(actor,grant);}catch(error){if(!(await connection.grants()).some(g=>g.provider===grant.provider&&g.accessToken===grant.accessToken))throw error;}
    }
   }
   const configuration={origin,clients:providerOAuthClients(env,origin),store:connection.store,fetch:transport,authorize:async (request:Request)=>{
    if(new URL(request.url).origin!==origin||!appPromise)return null;
    const probe=await (await appPromise).fetch(new Request(origin+'/frontbase-bootstrap/api/session',{headers:{cookie:request.headers.get('cookie')??''}}));if(!probe.ok)return null;const state=await probe.json();return state.phase===null||state.phase==='reviewed'?actor:null;
   }};const relay=providerOAuthRelay(env,origin);const authorize=configuration.authorize;return {...connection,app:relay?createProviderRelayClient({...configuration,...relay,mode:'authenticated',cipher}):createProviderOAuth(configuration),resources:createProviderOAuthResources({origin,authorize,fetch:transport,grant:async(_actor,provider)=>{const grants=await connection.refresh(providerOAuthClients(env,origin),{fetch:transport});return grants.find(g=>g.provider===provider)??null;},supabaseGrant:async()=>{const grants=await connection.refresh(providerOAuthClients(env,origin),{fetch:transport});return grants.find(g=>g.provider==='supabase')??null;}})};
  });
 }
 const originalApply=executor.apply;
 executor.apply=async(record:any,credentials:any)=>{
  // Hand the installed application only grants that are usable now; expiring ones refresh and rotate first.
  const grants=await (await oauth()).refresh(providerOAuthClients(env,origin),{fetch:transport});
  if(grants.length){const cipher=await createSecretCipher(await secret(owner,'session:'+record.operationId));env.FRONTBASE_OAUTH_CONNECTIONS=await cipher.encrypt(JSON.stringify({installationId,grants}));if(env.FRONTBASE_OAUTH_CONNECTIONS.length>65536)refuse();}
  return originalApply(record,credentials);
 };
 return {journal,executor,initialize,configuration,context,fetch:async(request:Request)=>{
  if(new URL(request.url).origin!==origin)return new Response('Invalid origin',{status:403});
  if(!appPromise)appPromise=nextSetup().then(async link=>createHostedBootstrap({enabled:true,origin,token:owner,expiresAt:env.FRONTBASE_BOOTSTRAP_EXPIRES_AT,renewalAvailable:recoveryAvailable,access:metadata||target==='vercel'?async()=>(await accessPromise).read():undefined,context,journal,executor,initialize:target==='cloudflare'&&!metadata?initialize:undefined,configuration,resourceOptions,resolveCredentials:async(manifest,input)=>resolveProviderBindingCredentials(manifest,input,await (await oauth()).refresh(providerOAuthClients(env,origin),{fetch:transport}),transport),pendingSetup:true,nextSetup:()=>link,providerResources:()=>oauth().then(app=>app.resources)}));
  const url=new URL(request.url);
  if(url.pathname==='/frontbase-bootstrap/recovery-status'&&request.method==='GET'&&!url.search)return Response.json({available:await recoveryAvailable()},{headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
  if(url.pathname==='/frontbase-bootstrap/api/renew'){
   if(request.method!=='POST'||request.headers.get('origin')!==origin||request.headers.get('content-type')?.split(';')[0]!=='application/json'||url.search)return Response.json({error:'setup_renewal_refused',message:'Renew setup access from this installation.'},{status:403});
   if(!await recoveryAvailable())return Response.json({error:'setup_renewal_unavailable',message:'Owner sign-in is not configured or cannot be reached. Ask the deployment owner to check the recovery service; no installation changes were repeated.'},{status:409,headers:{'cache-control':'no-store'}});
   const rewritten=new Request(origin+'/api/provider-oauth/'+target+(target==='vercel'?'/owner-start':'/start'),{method:'POST',headers:request.headers,body:JSON.stringify(target==='vercel'?{}:{returnPath:'/frontbase-bootstrap/'})});
   try{return await(await recovery()).fetch(rewritten);}catch{return Response.json({error:'setup_renewal_unavailable',message:'Renewal is unavailable or an installation operation is held. Inspect its status; no changes were repeated.'},{status:409,headers:{'cache-control':'no-store'}});}
  }
  if(url.pathname.startsWith('/api/provider-oauth/')){
   if(target==='vercel'&&['/owner-callback','/owner-callback.js','/owner-finish'].some(path=>url.pathname.endsWith(path)))return (await recovery()).fetch(request);
   if(['/relay-finish','/relay-callback','/relay-callback.js'].some(path=>url.pathname.endsWith(path))&&(request.headers.get('cookie')??'').split(';').some(c=>c.trim().startsWith('__Host-fb_relay_recovery_'+target+'=')))return (await recovery()).fetch(request);
   return (await oauth()).app.fetch(request);
  }
  if(url.pathname.startsWith('/frontbase-bootstrap/api/'))return (await appPromise).fetch(request);
  const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
  if(url.pathname==='/health')return Response.json({status:'setup_required'},{headers});
  // A rollout can briefly route the setup-status probe to the new runtime and
  // the following navigation to this old one. Keep /setup and its browser-only
  // claim fragment intact instead of redirecting it into the closed installer.
  if(url.pathname==='/setup'&&request.method==='GET')return new Response('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Activating Frontbase</title></head><body><p role="status">Waiting for the activated application. Your setup link is preserved; no deployment will be repeated.</p></body></html>',{status:503,headers:{...headers,'content-type':'text/html; charset=utf-8','retry-after':'2'}});
  if(url.pathname.startsWith('/api/console/setup'))return Response.json({error:'activation_in_progress'},{status:503,headers:{...headers,'retry-after':'2'}});
  const asset=assets[url.pathname];if(asset&&request.method==='GET')return new Response(url.pathname==='/frontbase-bootstrap/activation'?activationPage(asset.body,target):asset.body,{headers:{...headers,'content-type':asset.type}});
  return new Response(null,{status:302,headers:{...headers,location:'/frontbase-bootstrap/'}});
 }};
}

/** The newly healthy runtime completes its receipt without replaying provider writes. */
export async function completeCloudBootstrap(env:any,target:'cloudflare'|'vercel',health:()=>Promise<Response>,transport?:typeof fetch){
 if(env.FRONTBASE_BOOTSTRAP!=='0'||!env.FRONTBASE_BOOTSTRAP_OPERATION||!env.FRONTBASE_BOOTSTRAP_FINGERPRINT)return;
 if(target==='vercel'&&!env.FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN)return; // Operator removed temporary provisioning access after receipt completion.
 const context={installationId:env.FRONTBASE_INSTALLATION_ID,target,destination:env.FRONTBASE_BOOTSTRAP_ACCOUNT+'/'+env.FRONTBASE_BOOTSTRAP_PROJECT+'/'+env.FRONTBASE_BOOTSTRAP_ENVIRONMENT};
 const journal=target==='cloudflare'&&!env.FRONTBASE_BOOTSTRAP_STORE?sqlBootstrapJournal(d1RunnerFromBinding(env.FRONTBASE_SETUP_JOURNAL),context):createCloudBootstrap({...env,FRONTBASE_BOOTSTRAP:'1'},target,transport,{operationId:env.FRONTBASE_BOOTSTRAP_OPERATION,fingerprint:env.FRONTBASE_BOOTSTRAP_FINGERPRINT}).journal;
 const record=await journal.read(context);if(!record||record.phase==='active')return;
 await reconcileBootstrap(context,journal,{preflight:async()=>{refuse()},apply:async()=>{refuse()},inspect:async()=>({operationId:env.FRONTBASE_BOOTSTRAP_OPERATION,fingerprint:env.FRONTBASE_BOOTSTRAP_FINGERPRINT,healthy:(await health()).ok,bootstrapDisabled:true})});
}
