/** Explicit, mounted-volume bootstrap. Existing installations never fall back here. */
import {existsSync,lstatSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve,dirname,parse} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {resolveProviderOAuthCredentials,createSecretCipher,createProviderOAuth,providerOAuthClients,providerOAuthVault} from '../../packages/backend/dist/index.js';
import {createHostedBootstrap} from '../../packages/backend/dist/hosted-bootstrap.js';
import {dockerBootstrapJournal} from './docker-bootstrap-journal.mjs';
import {profileEnvironment} from './profile-environment.mjs';
import {verifyEmptyExternalState} from './cloudflare-state.mjs';
export async function createDockerBootstrapHost({env,boot,assets,probeExternal=verifyEmptyExternalState}) {
 if(env.FRONTBASE_BOOTSTRAP!=='1')throw Error('explicit_bootstrap_required');
 const origin=env.FRONTBASE_PUBLIC_ORIGIN,directory=env.FRONTBASE_BOOTSTRAP_DIRECTORY;
 if(!directory||resolve(directory)!==directory)throw Error('absolute_bootstrap_volume_required');
 for(let p=directory;;p=dirname(p)){if(existsSync(p)&&(lstatSync(p).isSymbolicLink()||!lstatSync(p).isDirectory()))throw Error('unsafe_bootstrap_volume');if(p===parse(p).root)break;}
 mkdirSync(directory,{recursive:true,mode:0o700});
 const context={installationId:env.FRONTBASE_INSTALLATION_ID,target:'docker',destination:origin};
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.installationId??''))throw Error('invalid_installation_identity');
 const file=join(directory,'runtime.json'),database=join(directory,'application.db');
 const journal=dockerBootstrapJournal(join(directory,'journal'));let runtime,configured;
 const read=()=>{if(!existsSync(file))return null;const s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>65536)throw Error('invalid_runtime_configuration');const data=JSON.parse(readFileSync(file,'utf8'));if(data.installationId!==context.installationId||data.origin!==origin||typeof data.environment!=='object'||!data.operationId||!data.fingerprint)throw Error('runtime_identity_mismatch');return data;};
 const start=async data=>{const record=await journal.read(context);if(!record||!['applying','uncertain','active'].includes(record.phase)||record.operationId!==data.operationId||record.fingerprint!==data.fingerprint)throw Error('runtime_receipt_mismatch');configured=data;runtime=await boot(data.environment);};
 const configuredEnvironment=()=>{
  if(env.ADMIN_EMAIL||env.ADMIN_PASSWORD||env.APP_DB_D1_DATABASE_ID||env.APP_DB_AUTH_TOKEN)throw Error('configured_environment_refused');
  if(env.APP_DB_URL&&(!env.APP_DB_URL.startsWith('file:')||existsSync(env.APP_DB_URL.slice(5))))throw Error('configured_environment_refused');
 };
 const existing=read();if(existing)await start(existing);else configuredEnvironment(); // boot failure stays failed, never reopens installation
 const executor={
  preflight:async(c,manifest)=>{configuredEnvironment();if(c.installationId!==context.installationId||c.destination!==origin||existsSync(file)||runtime)throw Error('installed_destination_refused');if(manifest.bindings['state-db'].adapterId==='sqlite-file'&&existsSync(database))throw Error('existing_state_refused');},
  apply:async(record,credentials)=>{
   const prepared={manifest:record.manifest,credentials};const values=profileEnvironment(prepared);
   if(record.manifest.bindings['state-db'].adapterId==='sqlite-file'){if(existsSync(database))throw Error('existing_state_refused');values.APP_DB_URL='file:'+database.replaceAll('\\','/');}else await probeExternal(prepared);
   if(values.FRONTBASE_STORAGE){const storage=JSON.parse(values.FRONTBASE_STORAGE);if(storage.provider!=='none'){storage.namespace='installation-'+context.installationId;values.FRONTBASE_STORAGE=JSON.stringify(storage);}}
   const environment={...values,FRONTBASE_PUBLIC_ORIGIN:origin,SESSION_SECRET:randomBytes(32).toString('hex'),SETUP_TOKEN:randomBytes(32).toString('hex'),SETUP_EXPIRES_AT:new Date(Date.now()+3600000).toISOString()};
   for(const [name,value] of Object.entries(env))if(/^FRONTBASE_(CLOUDFLARE|VERCEL)_OAUTH_(CLIENT_ID|CLIENT_SECRET|SCOPES|INTEGRATION_SLUG)$/.test(name))environment[name]=value;
   const grants=await oauth.grants();if(grants.length){environment.FRONTBASE_OAUTH_CONNECTIONS=await (await createSecretCipher(environment.SESSION_SECRET)).encrypt(JSON.stringify({installationId:context.installationId,grants}));if(environment.FRONTBASE_OAUTH_CONNECTIONS.length>65536)throw Error('oauth_handoff_too_large');}
   const data={version:1,installationId:context.installationId,origin,operationId:record.operationId,fingerprint:record.fingerprint,environment};
   // Exclusive creation is the activation boundary. A partial write fails closed on restart.
   const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,JSON.stringify(data));fsyncSync(fd);}finally{closeSync(fd);}
   await start(data);
  },
  inspect:async record=>{if(!runtime||configured.operationId!==record.operationId||configured.fingerprint!==record.fingerprint)return null;const r=await runtime.engine.fetch(new Request(origin+'/api/auth/me'));return {operationId:record.operationId,fingerprint:record.fingerprint,healthy:r.status===401,bootstrapDisabled:true};}
 };
 const nextSetup=()=>'/setup#/setup?claim='+encodeURIComponent(configured.environment.SETUP_TOKEN);
 // Configured restarts don't require an unexpired owner capability or re-enable the API.
 const api=runtime?null:createHostedBootstrap({enabled:true,origin,token:env.FRONTBASE_BOOTSTRAP_TOKEN??'',expiresAt:env.FRONTBASE_BOOTSTRAP_EXPIRES_AT??'',context,journal,executor,nextSetup,resolveCredentials:async(manifest,input)=>resolveProviderOAuthCredentials(manifest,input,await oauth.grants())});
 const oauthDirectory=join(directory,'oauth');
 const vault={
  entries:async prefix=>{
   if(!existsSync(oauthDirectory))return [];
   if(!lstatSync(oauthDirectory).isDirectory()||lstatSync(oauthDirectory).isSymbolicLink())throw Error('oauth_directory_refused');
   return readdirSync(oauthDirectory).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(name=>{
    const file=join(oauthDirectory,name),stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw Error('oauth_file_refused');return JSON.parse(readFileSync(file,'utf8'));
   }).filter(row=>typeof row.key==='string'&&row.key.startsWith(prefix));
  },
  get:async key=>(await vault.entries(key)).find(row=>row.key===key)?.value??null,
  insert:async(key,value)=>{
   mkdirSync(oauthDirectory,{recursive:true,mode:0o700});await vault.entries('');
   const file=join(oauthDirectory,createHash('sha256').update(key).digest('hex')+'.json');let fd;
   try{fd=openSync(file,'wx',0o600);writeFileSync(fd,JSON.stringify({key,value}));fsyncSync(fd);return true;}catch(error){if(error.code==='EEXIST')return false;throw error;}finally{if(fd!==undefined)closeSync(fd);}
  }
 };
 const actor={tenant:'_root',subject:context.installationId};
 const oauth=providerOAuthVault(vault,await createSecretCipher(env.FRONTBASE_BOOTSTRAP_TOKEN??''),actor);
 const oauthApp=createProviderOAuth({origin,clients:providerOAuthClients(env,origin),store:oauth.store,fetch:(input,init)=>fetch(input,init),authorize:async request=>{
  if(!api)return null;const probe=await api.fetch(new Request(origin+'/frontbase-bootstrap/api/configuration',{headers:{cookie:request.headers.get('cookie')??''}}));if(!probe.ok)return null;const state=await probe.json();return state.operation&&['applying','uncertain'].includes(state.operation.phase)?null:actor;
 }});
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
 return {context,journal,executor,close:()=>runtime?.externalFetch?.close(),fetch:async request=>{
  const url=new URL(request.url);
  // Origin comes from the explicit operator configuration, never a forwarded header.
  if(url.origin!==origin)return new Response('Invalid origin',{status:403,headers});
  if(runtime){if(url.pathname.startsWith('/frontbase-bootstrap'))return new Response('Setup closed',{status:410,headers});return runtime.engine.fetch(request);}
  if(url.pathname.startsWith('/api/provider-oauth/'))return oauthApp.fetch(request);
  if(url.pathname==='/health'&&request.method==='GET')return Response.json({status:'setup_required'},{headers});
  if(url.pathname.startsWith('/frontbase-bootstrap/api/'))return api.fetch(request);
  if(request.method!=='GET'||url.search)return new Response('Not found',{status:404,headers});
  const asset=assets[url.pathname];if(asset)return new Response(asset.body,{headers:{...headers,'Content-Type':asset.type}});
  return new Response(null,{status:302,headers:{...headers,Location:'/frontbase-bootstrap/'}});
 }};
}
