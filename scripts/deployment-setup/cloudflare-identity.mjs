import { nativeWrangler, readNativeR2Identity } from './cloudflare.mjs';
import { assertReceiptTarget } from './receipt.mjs';
export const installationBinding='FRONTBASE_INSTALLATION_ID';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hex=/^[a-f0-9]{32}$/;
async function boundedJson(response) {
 if(!response.ok)throw new Error('cloudflare_metadata_unavailable');
 const reader=response.body?.getReader();if(!reader)throw new Error('cloudflare_metadata_unavailable');
 let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw new Error('cloudflare_metadata_too_large');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(body.success!==true)throw new Error('cloudflare_metadata_unavailable');
 return body.result;
}
export function projectWorkerIdentity(settings,deployments,context) {
 assertReceiptTarget(context);
 const bindings=settings?.bindings;
 deployments=deployments?.deployments??deployments;
 if(!Array.isArray(bindings) || !Array.isArray(deployments) || !deployments.length)throw new Error('cloudflare_metadata_invalid');
 const latest=[...deployments].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
 if(deployments.some(d=>!Number.isFinite(Date.parse(d.created_on))))throw new Error('cloudflare_metadata_invalid');
 if(!uuid.test(latest?.id??'') || !Array.isArray(latest.versions) || latest.versions.length!==1 || latest.versions[0].percentage!==100 || !uuid.test(latest.versions[0].version_id??''))throw new Error('cloudflare_split_or_unknown_deployment');
 let installationId;const resources={},secrets=[],names=new Set();
 for(const binding of bindings) {
  if(!binding || typeof binding.name!=='string' || names.has(binding.name))throw new Error('cloudflare_metadata_invalid');names.add(binding.name);
  if(binding.type==='plain_text' && binding.name===installationBinding && uuid.test(binding.text??'')){installationId=binding.text;continue;}
  if(binding.type==='secret_text' && /^[A-Z][A-Z0-9_]{0,127}$/.test(binding.name)){secrets.push(binding.name);continue;}
  if(binding.type==='assets' && binding.name==='ASSETS')continue;
  if(binding.type==='d1' && binding.name==='DB' && uuid.test(binding.id??'')){resources.database={name:context.appName+'-db',binding:'DB',id:binding.id};continue;}
  if(binding.type==='kv_namespace' && binding.name==='FRONTBASE_KV' && hex.test(binding.namespace_id??'')){resources.cache={name:context.appName+'-cache',binding:'FRONTBASE_KV',id:binding.namespace_id};continue;}
  if(binding.type==='r2_bucket' && binding.name==='FRONTBASE_R2' && binding.bucket_name===context.appName+'-storage' && !binding.jurisdiction){resources.storage={name:binding.bucket_name,binding:'FRONTBASE_R2'};continue;}
  throw new Error('cloudflare_unmanaged_binding_refused');
 }
 if(!installationId || !resources.database || !secrets.includes('SESSION_SECRET'))throw new Error('cloudflare_ownership_unverified');
 secrets.sort();
 return {installationId,versionId:latest.versions[0].version_id,deploymentId:latest.id,resources,secrets};
}
/** Supported Wrangler credential bridge. Credentials and raw settings never leave this closure. */
export async function readCloudflareIdentity(context,{runWrangler=nativeWrangler(context.accountId),cwd=process.cwd(),fetcher=fetch}={}) {
 assertReceiptTarget(context);
 try {
  const result=await runWrangler(['auth','token','--json'],{cwd});
  if(result.code!==0)throw new Error();
  const auth=JSON.parse(result.stdout),headers={accept:'application/json'};
  if(['api_token','oauth'].includes(auth.type) && typeof auth.token==='string' && auth.token.length>0)headers.authorization='Bearer '+auth.token;
  else if(auth.type==='api_key' && typeof auth.key==='string' && typeof auth.email==='string'){headers['X-Auth-Key']=auth.key;headers['X-Auth-Email']=auth.email;}
  else throw new Error();
  const base='https://api.cloudflare.com/client/v4/accounts/'+context.accountId+'/workers/scripts/'+context.appName;
  const get=async suffix=>boundedJson(await fetcher(base+suffix,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)}));
  const settings=await get('/settings'),deployments=await get('/deployments');
  const identity=projectWorkerIdentity(settings,deployments,context);
  const version=await get('/versions/'+identity.versionId);
  const operationId=version?.annotations?.['workers/tag'];
  if(!uuid.test(operationId??''))throw new Error();
  identity.operationId=operationId;
  if(identity.resources.storage)identity.resources.storage=await readNativeR2Identity(identity.resources.storage.name,runWrangler,cwd);
  return identity;
 } catch {throw new Error('cloudflare_identity_verification_failed');}
}
