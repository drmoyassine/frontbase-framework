import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';import {dirname,join,resolve,parse} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {inspectVercelOperation} from './vercel-inspect.mjs';
import {vercelManifestDigest,vercelOperation} from './vercel-operation.mjs';
import {isDeepStrictEqual} from 'node:util';
import {assertVercelOptionalChanges} from './vercel-bindings.mjs';
import {profileEnvironment} from './profile-environment.mjs';
import {readManagedRuntimeManifest,stateBindingChanged} from '../../packages/edge-core/dist/deployment.js';import {acquireDeploymentLock} from './receipt.mjs';import {assertVercelProfileContext,executeVercelProfile} from './vercel.mjs';
const checkPath=path=>{for(let p=resolve(path);;p=dirname(p)){if(existsSync(p)&&(lstatSync(p).isSymbolicLink()||!lstatSync(p).isDirectory()))throw Error('vercel_receipt_path_refused');if(p===parse(p).root)break;}};
export function vercelReceiptPath(root,context){assertVercelProfileContext(context);return join(resolve(root),'.frontbase','vercel',context.scope,context.environment,context.project,'deployment.json');}
export function readVercelReceipt(root,context) {
 const file=vercelReceiptPath(root,context);checkPath(dirname(file));if(!existsSync(file))return null;
 try {const st=lstatSync(file);if(st.isSymbolicLink()||!st.isFile()||st.size>65536)throw Error();const r=JSON.parse(readFileSync(file,'utf8'));
 if(!r||Object.keys(r).some(k=>!['version','scope','project','environment','manifest','phase','url','operationId','manifestDigest'].includes(k))||r.version!==1||r.scope!==context.scope||r.project!==context.project||r.environment!==context.environment||!['prepared','failed','succeeded'].includes(r.phase)||!readManagedRuntimeManifest(r.manifest)||r.manifest.target!=='vercel'||r.manifest.environment!==context.environment)throw Error();
 vercelOperation(r,r.manifest);
 if(r.url!==null){const u=new URL(r.url);if(u.origin!==r.url||u.protocol!=='https:'||!u.hostname.endsWith('.vercel.app'))throw Error();}if(r.phase==='succeeded'&&!r.url)throw Error();return r;
 }catch{throw Error('invalid_vercel_receipt');}
}
function save(root,context,receipt){const file=vercelReceiptPath(root,context);checkPath(dirname(file));mkdirSync(dirname(file),{recursive:true,mode:0o700});checkPath(dirname(file));const temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});renameSync(temp,file);}
export async function executeManagedVercel(prepared,context,{root=process.cwd(),execute=executeVercelProfile,...options}={}) {
 assertVercelProfileContext(context);if(context.intent==='resume')throw Error('resume_requires_reconciliation_command');const release=acquireDeploymentLock({accountId:createHash('sha256').update('vercel:'+context.scope).digest('hex').slice(0,32),appName:context.project,environment:context.environment});
 let receipt,previous;
 try {previous=readVercelReceipt(root,context);if((context.intent??'create')==='create'&&previous)throw Error('vercel_receipt_already_exists');if(context.intent==='redeploy'&&!previous)throw Error('vercel_receipt_required');
 const manifest=readManagedRuntimeManifest(profileEnvironment(prepared).FRONTBASE_DEPLOYMENT_MANIFEST);if(!manifest||manifest.target!=='vercel'||manifest.environment!==context.environment)throw Error('invalid_vercel_profile');
 if(previous&&stateBindingChanged(previous.manifest,manifest))throw Error('state_change_requires_migration');
 assertVercelOptionalChanges(previous,manifest);
 const pending=previous&&previous.phase!=='succeeded'?vercelOperation(previous,manifest):undefined;
 receipt={version:1,scope:context.scope,project:context.project,environment:context.environment,manifest,phase:'prepared',url:previous?.url??null,operationId:pending?.operationId??randomUUID(),manifestDigest:vercelManifestDigest(manifest)};save(root,context,receipt);
 const result=await execute(prepared,{...context,operationId:receipt.operationId,manifestDigest:receipt.manifestDigest},options);if(!result?.ok)throw Error('vercel_deployment_failed');const url=new URL(result.url);if(url.origin!==result.url||url.protocol!=='https:'||!url.hostname.endsWith('.vercel.app'))throw Error('invalid_vercel_result');
 save(root,context,{...receipt,phase:'succeeded',url:result.url});return result;
 }catch(error){if(receipt)save(root,context,{...receipt,phase:'failed'});throw error;}finally{release();}
}

/** Only local receipt bookkeeping changes; the inspection capability has no remote mutations. */
export async function reconcileManagedVercel(context,{deployment,root=process.cwd(),inspect=inspectVercelOperation,...options}={}){
 assertVercelProfileContext(context);if(context.intent!=='resume'||context.setupLink)throw Error('vercel_resume_requires_explicit_read_only_intent');
 const release=acquireDeploymentLock({accountId:createHash('sha256').update('vercel:'+context.scope).digest('hex').slice(0,32),appName:context.project,environment:context.environment});
 try{const previous=readVercelReceipt(root,context);if(!previous)throw Error('vercel_receipt_required');if(!vercelOperation(previous,previous.manifest))throw Error('legacy_vercel_receipt_requires_manual_reconciliation');
  const result=await inspect(context,previous,deployment,options);if(!result?.ok)throw Error('vercel_reconciliation_failed');const url=new URL(result.url);if(url.origin!==result.url||url.protocol!=='https:'||!url.hostname.endsWith('.vercel.app'))throw Error('invalid_vercel_result');
  if(!isDeepStrictEqual(readVercelReceipt(root,context),previous))throw Error('vercel_receipt_changed_during_reconciliation');
  save(root,context,{...previous,phase:'succeeded',url:result.url});return result;
 }finally{release();}
}
