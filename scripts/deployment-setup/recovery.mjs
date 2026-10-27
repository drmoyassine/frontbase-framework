import {isDeepStrictEqual} from 'node:util';
import {d1RunnerFromRest} from '../../packages/edge-infra/dist/index.js';
import {UserStore} from '../../packages/backend/dist/db/users.js';
import {PasswordResetStore} from '../../packages/backend/dist/compat/store.js';
import {passwordResetLink} from '../../packages/backend/dist/compat/email/resend.js';
import {receiptPath,readReceipt} from './receipt.mjs';
import {readCloudflareIdentity} from './cloudflare-identity.mjs';
import {nativeWrangler} from './cloudflare.mjs';

// Operator-only local bridge. The public app receives only its existing reset capability.
export async function managedAdministratorRecovery(context,{root=process.cwd(),email,issueLink=false,runWrangler=nativeWrangler(context.accountId),readIdentity=ctx=>readCloudflareIdentity(ctx,{runWrangler,cwd:root}),makeRunner,fetcher=fetch,now=()=>new Date().toISOString()}={}) {
 const receipt=readReceipt(receiptPath(root,context),context);
 if(!receipt||receipt.phase!=='succeeded'||!receipt.resources.database)throw Error('managed_native_state_receipt_required');
 const current=await readIdentity(context);
 if(!isDeepStrictEqual(current,receipt.identity))throw Error('deployment_remote_state_changed');
 let runner;
 if(makeRunner)runner=makeRunner(receipt.resources.database.id);
 else {
  const result=await runWrangler(['auth','token','--json'],{cwd:root});
  if(result.code!==0)throw Error('operator_authentication_required');
  let auth;try{auth=JSON.parse(result.stdout);}catch{throw Error('operator_authentication_required');}
  const headers={};
  if(['oauth','api_token'].includes(auth.type)&&typeof auth.token==='string'&&auth.token)headers.authorization='Bearer '+auth.token;
  else if(auth.type==='api_key'&&typeof auth.key==='string'&&auth.key&&typeof auth.email==='string'&&auth.email){headers['X-Auth-Key']=auth.key;headers['X-Auth-Email']=auth.email;}
  else throw Error('operator_authentication_required');
  runner=d1RunnerFromRest({accountId:context.accountId,databaseId:receipt.resources.database.id,apiToken:'operator-bridge',fetchImpl:(input,init)=>{
   const merged=new Headers(init?.headers);merged.delete('authorization');for(const [name,value] of Object.entries(headers))merged.set(name,value);
   return fetcher(input,{...init,headers:merged,redirect:'error',signal:AbortSignal.timeout(15000)});
  }});
 }
 const admins=[];
 for(const tenant of ['_root','_default'])for(const user of await new UserStore(runner,tenant).listUsers())if(['owner','master_admin'].includes(user.role))admins.push(user);
 if(!issueLink)return {admins};
 if(typeof email!=='string'||!email.trim())throw Error('exact_administrator_email_required');
 const selected=admins.filter(user=>user.email.toLowerCase()===email.toLowerCase());
 if(selected.length!==1)throw Error('unique_administrator_required');
 // Recheck ownership immediately before issuing a capability; no password is changed here.
 if(!isDeepStrictEqual(await readIdentity(context),receipt.identity))throw Error('deployment_remote_state_changed');
 const at=now(),token=await new PasswordResetStore(runner).create(selected[0],at);
 return {url:passwordResetLink(receipt.url,selected[0].email,token,'/frontbase-admin/reset-password'),expiresAt:new Date(Date.parse(at)+3600000).toISOString()};
}
