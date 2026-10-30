import {createProviderRelayClient,type OAuthRelayTarget} from '@frontbase/backend';
import {defaultDeploymentManifest,deploymentAdapters} from '@frontbase/edge-core/deployment';
import {claimNativeInstallation} from './native-claim.js';
import assets from 'virtual:bootstrap-assets';
const fail=():never=>{throw Error('native_setup_refused');};
/** Explicit zero-state entry. Database failures never enter this branch. */
export function createNativeCloudBootstrap(env:any,host:'cloudflare'|'vercel',transport:typeof fetch=(input,init)=>fetch(input,init)){
 if(env.FRONTBASE_HOSTED_SETUP!=='1'||env.FRONTBASE_BOOTSTRAP!=='native'||env.DB||env.SESSION_SECRET||env.ADMIN_EMAIL||env.ADMIN_PASSWORD||env.APP_DB_URL||env.APP_DB_AUTH_TOKEN||env.APP_DB_D1_DATABASE_ID)fail();
 const origin=env.FRONTBASE_NATIVE_PUBLIC_ORIGIN,relayOrigin=env.FRONTBASE_NATIVE_RELAY_URL,installationId=env.FRONTBASE_NATIVE_INSTALLATION_ID,account=env.FRONTBASE_NATIVE_ACCOUNT,project=env.FRONTBASE_NATIVE_PROJECT;
 if(typeof origin!=='string'||new URL(origin).origin!==origin||!origin.startsWith('https://')||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(installationId??'')||!account||!project)fail();
 const target:OAuthRelayTarget={origin,host,purpose:'install',account,project,installationId,...(host==='vercel'?{deploymentId:env.VERCEL_DEPLOYMENT_ID}:{})};
 const actor={tenant:'_native',subject:installationId};
 const receiver=createProviderRelayClient({origin,relayOrigin,target,mode:'native-install',fetch:transport,authorize:async request=>new URL(request.url).origin===origin?actor:null,establish:async (authorization,_request,registrationKey)=>(await claimNativeInstallation({target,relayOrigin,registrationKey},authorization,transport)).returnPath});
 return {fetch:async(request:Request)=>{
  const url=new URL(request.url),headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
  if(url.origin!==origin)return new Response('Invalid origin',{status:403,headers});
  if(url.pathname.startsWith('/api/provider-oauth/'))return receiver.fetch(request);
  if(request.method!=='GET')return new Response('Not found',{status:404,headers});
  if(url.pathname==='/health')return Response.json({status:'setup_required'},{headers});
  // supabase-postgres is cloudflare-only here: the vercel native executor has no
  // provisioning route, so advertising create/reuse there would fail closed at apply.
  if(url.pathname==='/frontbase-bootstrap/native-configuration')return Response.json({target:host,manifest:defaultDeploymentManifest(host,'production'),adapters:deploymentAdapters.filter(a=>a.targets.includes(host)&&['cloudflare-d1','cloudflare-kv','libsql-http','d1-http',...(host==='cloudflare'?['supabase-postgres']:[]),'upstash-http','libsql-vector-http','cloudflare-vectorize-http','s3-http','qstash-http'].includes(a.id))},{headers});
  const key=url.pathname==='/frontbase-bootstrap/'?'/frontbase-bootstrap/native':url.pathname,asset=assets[key];if(asset)return new Response(asset.body,{headers:{...headers,'content-type':asset.type}});
  if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404,headers});
  return new Response(null,{status:302,headers:{...headers,location:'/frontbase-bootstrap/'}});
 }};
}
