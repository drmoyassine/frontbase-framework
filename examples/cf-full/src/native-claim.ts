/** Provider-level first ownership claim. Called only by an explicit zero-state native entry. */
import {createSecretCipher,relayTargetPolicy,type OAuthRelayTarget} from '@frontbase/backend';
import type {OAuthAuthorization} from '../../../packages/backend/src/provider-oauth.js';
import {d1RunnerFromRest} from '@frontbase/edge-infra';
import {admitBootstrapState} from '@frontbase/edge-infra/bootstrap-journal';
const fail=():never=>{throw Error('native_installation_refused');};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export interface NativeClaimContext {target:OAuthRelayTarget;relayOrigin:string;registrationKey?:string;
 /** Server-side build entry only: the deployment owner receives this capability privately.
  * Never read it from an HTTP request or infer it from the public Worker address. */
 buildOwner?:string;}
/** Internal relay receiver or privileged build hook. Relay calls follow its durable
 * project claim; build calls require the target's management API token and create
 * the fixed coordinator once. Never mount as a browser-callable API. */
export async function claimNativeInstallation(context:NativeClaimContext,grant:OAuthAuthorization,transport:typeof fetch=fetch){
 const target=context.target,host=target.host,account=target.account,project=target.project,installationId=target.installationId,origin=target.origin;
 if(target.purpose!=='install'||!['cloudflare','vercel'].includes(host)||grant.provider!==host||!uuid.test(installationId??'')||!account||!project||new URL(context.relayOrigin).origin!==context.relayOrigin||!context.relayOrigin.startsWith('https://'))fail();
 if(context.buildOwner!==undefined&&(host!=='cloudflare'||!/^[a-f0-9]{64}$/.test(context.buildOwner)||context.registrationKey!==undefined))fail();
 const subdomain=host==='cloudflare'?new URL(origin).hostname.split('.').slice(1,-2).join('.'):'unused';
 const policy=relayTargetPolicy({cloudflareAccount:host==='cloudflare'?account:'0'.repeat(32),cloudflareSubdomain:subdomain,vercelTeam:host==='vercel'?account:'team_unused',connectedOrigins:[]},transport);
 await policy.verify(target,grant); // Recheck after relay redemption, immediately before provider writes.
 const apiOrigin=host==='cloudflare'?'https://api.cloudflare.com':'https://api.vercel.com',team='teamId='+encodeURIComponent(account),cf='/client/v4/accounts/'+account;
 async function api(path:string,method='GET',body?:unknown){
  const response=await transport(apiOrigin+path,{method,headers:{authorization:'Bearer '+grant.accessToken,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)});
  const reader=response.body?.getReader();if(!reader)fail();let size=0,text='';const decoder=new TextDecoder();try{for(;;){const part=await reader!.read();if(part.done)break;size+=part.value.length;if(size>1048576)fail();text+=decoder.decode(part.value,{stream:true});}}finally{await reader!.cancel().catch(()=>{});}let parsed:any;try{parsed=JSON.parse(text+decoder.decode());}catch{fail();}
  if(!response.ok||parsed.success===false){
   // Fixed diagnostic only: never reflect provider bodies or credentials. The
   // durable claim stays fenced; a refusal does not authorize automatic retry.
   if(host==='cloudflare'&&method==='POST'&&path===cf+'/d1/database')throw Error('native_setup_database_rejected');
   fail();
  }
  return host==='cloudflare'?parsed.result:parsed;
 }
 const owner=context.buildOwner??random(),expires=new Date(Date.now()+3600000).toISOString(),environment:any={FRONTBASE_BOOTSTRAP:'1',FRONTBASE_INSTALLATION_ID:installationId,FRONTBASE_PUBLIC_ORIGIN:origin,FRONTBASE_BOOTSTRAP_TOKEN:owner,FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN:grant.accessToken,FRONTBASE_BOOTSTRAP_EXPIRES_AT:expires,FRONTBASE_BOOTSTRAP_ACCOUNT:account,FRONTBASE_BOOTSTRAP_PROJECT:project,FRONTBASE_BOOTSTRAP_ENVIRONMENT:'production'};
 // A build API token has no OAuth receiver registration. Keep the existing manual
 // reconnect path rather than configuring a relay that cannot authenticate this receiver.
 if(context.buildOwner===undefined){environment.FRONTBASE_OAUTH_RELAY_URL=context.relayOrigin;environment.FRONTBASE_OAUTH_RELAY_TARGET=JSON.stringify({origin,host,purpose:'connect'});}
 if(context.registrationKey!==undefined){if(!/^[\w-]{43}$/.test(context.registrationKey))fail();environment.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY=context.registrationKey;}
 const selected=grant.accounts.find(a=>a.id===account);if(!selected)fail();
 environment.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS=await (await createSecretCipher(owner)).encrypt(JSON.stringify([{...grant,accounts:[selected,...grant.accounts.filter(a=>a.id!==account)]}]));
 if(environment.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS.length>65536)fail();
 if(host==='cloudflare'){
  const settings=await api(cf+'/workers/scripts/'+project+'/settings'),bindings=settings.bindings;
  const permitted=new Set(['FRONTBASE_HOSTED_SETUP','FRONTBASE_BOOTSTRAP','FRONTBASE_NATIVE_ACCOUNT','FRONTBASE_NATIVE_PROJECT','FRONTBASE_NATIVE_RELAY_URL','FRONTBASE_NATIVE_PUBLIC_ORIGIN','FRONTBASE_NATIVE_INSTALLATION_ID','FRONTBASE_INSTALLATION_ID','FRONTBASE_PUBLIC_ORIGIN']);
  if(!Array.isArray(bindings)||bindings.filter((b:any)=>b.type==='assets'&&b.name==='ASSETS').length!==1||new Set(bindings.map((b:any)=>b.name)).size!==bindings.length||bindings.some((b:any)=>!(b.type==='assets'&&b.name==='ASSETS'||b.type==='plain_text'&&permitted.has(b.name))))fail();
  // Relay calls follow its account/project CAS. A build proves control via the
  // provider token; the unique fixed database name fences competing build claims.
  // Never adopt an existing database or retry a possibly committed creation.
  const created=await api(cf+'/d1/database','POST',{name:'fb-setup-'+installationId});if(!uuid.test(created?.uuid??''))fail();
  const runner=d1RunnerFromRest({accountId:account,databaseId:created.uuid,apiToken:grant.accessToken,fetchImpl:(input,init)=>transport(input,{...init,redirect:'manual',signal:AbortSignal.timeout(20000)})});
  await admitBootstrapState(runner,{installationId:installationId!,target:'cloudflare',destination:account+'/'+project+'/production'});
  const next=bindings.filter((b:any)=>b.type==='assets');for(const [name,value] of Object.entries(environment))next.push({type:['FRONTBASE_BOOTSTRAP','FRONTBASE_INSTALLATION_ID','FRONTBASE_PUBLIC_ORIGIN'].includes(name)?'plain_text':'secret_text',name,text:value});
  const form=new FormData();form.set('settings',JSON.stringify({bindings:next}));await api(cf+'/workers/scripts/'+project+'/settings','PATCH',form);
 }else{
  const destination=await api('/v9/projects/'+project+'?'+team);if(typeof destination.name!=='string')fail();environment.FRONTBASE_BOOTSTRAP_PROJECT_NAME=destination.name;
  // This variable is integration-owned and create-only. No global env permission,
  // overwrite, rollback or adoption of an earlier claim is permitted.
  const claim=await api('/v10/projects/'+project+'/env?'+team,'POST',{key:'FB_NATIVE_'+installationId!.replaceAll('-','').toUpperCase(),value:JSON.stringify({installationId,ownerHash:await hash(owner)}),type:'plain',target:['production']});
  if(claim.failed?.length||!claim.id&&!claim.created?.id&&!(Array.isArray(claim.created)&&claim.created[0]?.id))fail();
  const installed=await api('/v10/projects/'+project+'/env?'+team,'POST',Object.entries(environment).map(([key,value])=>({key,value,type:'encrypted',target:['production']})));
  if(installed.failed?.length)fail();
  await api('/v13/deployments?'+team,'POST',{name:destination.name,project,deploymentId:target.deploymentId,withLatestCommit:false,target:'production',meta:{frontbaseNativeInstallation:installationId}});
 }
 return {returnPath:'/frontbase-bootstrap/activation#claim='+owner};
}
