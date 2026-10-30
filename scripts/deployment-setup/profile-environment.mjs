import {deploymentStorageFromEnv} from '../../packages/backend/dist/compat/deployment-storage.js';
import {validateDeploymentManifest} from '../../packages/edge-core/dist/deployment.js';
/** Lower reviewed bindings to the existing host resolver; returned values are private process state.
 * `nativeHyperdrive` is set only by the Cloudflare native executor and its empty-state probe —
 * the two callers that actually create/bind a Hyperdrive config for wire state. Everyone else
 * keeps the wizard-time refusal (a Worker without the binding would be a certain boot failure). */
export function profileEnvironment(prepared,{nativeHyperdrive=false}={}) {
 const plan=validateDeploymentManifest(prepared?.manifest);if(!plan.ready)throw Error('invalid_profile');
 const credentials=prepared.credentials;if(!credentials||typeof credentials!=='object'||Array.isArray(credentials))throw Error('invalid_profile_credentials');
 const refs=new Set(Object.values(plan.manifest.bindings).filter(b=>b.mode!=='disabled').flatMap(b=>Object.values(b.secretRefs)));
 if(Object.keys(credentials).some(k=>!refs.has(k))||[...refs].some(k=>typeof credentials[k]!=='string'||!credentials[k]||credentials[k].length>8192))throw Error('invalid_profile_credentials');
 const env={},get=(b,k)=>credentials[b.secretRefs[k]],json=(name,value)=>{env[name]=JSON.stringify(value);};
 for(const [role,b] of Object.entries(plan.manifest.bindings)) {
  if(b.mode==='disabled') {
   // A nonempty explicit sentinel replaces old host values without deleting secrets.
   const name={cache:'FRONTBASE_CACHE',vector:'FRONTBASE_VECTOR',queue:'FRONTBASE_QUEUE',storage:'FRONTBASE_STORAGE'}[role];
   if(name)json(name,{provider:'none'});
   continue;
  }
  if(b.adapterId==='turso-marketplace'&&b.mode==='reuse'&&/^store_[a-zA-Z0-9]+$/.test(b.resourceRef??''))continue;
  if(plan.manifest.target==='cloudflare' && ['cloudflare-d1','cloudflare-kv','cloudflare-r2'].includes(b.adapterId) && ['create','reuse'].includes(b.mode))continue;
  if(b.mode!=='connect')throw Error('profile_requires_host_native_executor');
  const c=b.config;
  switch(b.adapterId) {
   case 'sqlite-file':if(plan.manifest.target!=='docker')throw Error('invalid_local_state');env.APP_DB_URL='file:application.db';break;
   case 'libsql-http':env.APP_DB_URL=c.url;env.APP_DB_AUTH_TOKEN=get(b,'token');break;
   case 'd1-http':if(!/^[a-f0-9]{32}$/.test(c.accountId)||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(c.databaseId))throw Error('invalid_state_identity');env.APP_DB_D1_ACCOUNT_ID=c.accountId;env.APP_DB_D1_DATABASE_ID=c.databaseId;env.CLOUDFLARE_API_TOKEN=get(b,'token');break;
   case 'supabase-postgres':{
    // PostgREST is plain HTTPS — the one transport lowered identically on every target. Wire needs direct TCP:
    // Docker and the Node-runtime Vercel function have it; a Worker reaches it only through a Hyperdrive config
    // the native executor creates from this DSN, so callers that cannot provision one keep the refusal. Under
    // the executor the DSN still lowers (private process env, the same posture as APP_DB_AUTH_TOKEN) as the loud
    // fallback — a Worker that lost its binding refuses at boot instead of silently TCP-less dialing — while
    // APP_DB_HYPERDRIVE=1 opts the resolver into the binding ahead of it.
    if(c.url){env.APP_DB_POSTGREST_URL=c.url;env.APP_DB_POSTGREST_TOKEN=get(b,'token');}
    else{if(plan.manifest.target==='cloudflare'){if(!nativeHyperdrive)throw Error('state_wire_requires_hyperdrive');env.APP_DB_HYPERDRIVE='1';}env.APP_DB_URL=`postgres://${encodeURIComponent(get(b,'username'))}:${encodeURIComponent(get(b,'password'))}@${c.host}:${c.port||'5432'}/${c.database}`;}
    if(c.schema)env.APP_DB_POSTGRES_SCHEMA=c.schema;break;
   }
   case 'postgrest-http':
    // Self-hosted Postgres behind PostgREST lowers through the same supabaseRunner HTTP
    // transport pair as the supabase-postgres connect path (url is https-only and required
    // at manifest validation, so no wire branch exists here).
    env.APP_DB_POSTGREST_URL=c.url;env.APP_DB_POSTGREST_TOKEN=get(b,'token');if(c.schema)env.APP_DB_POSTGRES_SCHEMA=c.schema;break;
   case 'upstash-http':json('FRONTBASE_CACHE',{provider:'upstash',url:c.url,token:get(b,'token')});break;
   case 'libsql-vector-http':json('FRONTBASE_VECTOR',{provider:'libsql',url:c.url,token:get(b,'token')});break;
   case 'cloudflare-vectorize-http':json('FRONTBASE_VECTOR',{provider:'vectorize',url:c.indexName,cfAccountId:c.accountId,cfApiToken:get(b,'token')});break;
   case 'qstash-http':{const callback=new URL(c.destination);if(callback.pathname!=='/api/system/queue/receive')throw Error('invalid_queue_callback');env.PUBLIC_URL=callback.origin;json('FRONTBASE_QUEUE',{provider:'qstash',token:get(b,'token'),signingKey:get(b,'signingKey'),nextSigningKey:get(b,'nextSigningKey')});break;}
   case 's3-http':{const storage={provider:'s3',endpoint:c.endpoint,region:c.region||'auto',bucket:c.bucket,accessKeyId:get(b,'accessKeyId'),secretAccessKey:get(b,'secretAccessKey')};deploymentStorageFromEnv(JSON.stringify({...storage,namespace:'review-validation'}));json('FRONTBASE_STORAGE',storage);break;}
   default:throw Error('unsupported_profile_adapter');
  }
 }
 const metadata=structuredClone(plan.manifest);for(const b of Object.values(metadata.bindings))if(b.mode==='disabled'){b.config={};b.secretRefs={};delete b.resourceRef;}
 env.FRONTBASE_DEPLOYMENT_MANIFEST=JSON.stringify(metadata);
 return env;
}
