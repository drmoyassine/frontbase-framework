import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';import {dirname,join,resolve,parse} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {profileEnvironment} from './profile-environment.mjs';
import {readManagedRuntimeManifest,stateBindingChanged} from '../../packages/edge-core/dist/deployment.js';import {acquireDeploymentLock} from './receipt.mjs';import {assertVercelProfileContext,executeVercelProfile} from './vercel.mjs';
const checkPath=path=>{for(let p=resolve(path);;p=dirname(p)){if(existsSync(p)&&(lstatSync(p).isSymbolicLink()||!lstatSync(p).isDirectory()))throw Error('vercel_receipt_path_refused');if(p===parse(p).root)break;}};
export function vercelReceiptPath(root,context){assertVercelProfileContext(context);return join(resolve(root),'.frontbase','vercel',context.scope,context.environment,context.project,'deployment.json');}
export function readVercelReceipt(root,context) {
 const file=vercelReceiptPath(root,context);checkPath(dirname(file));if(!existsSync(file))return null;
 try {const st=lstatSync(file);if(st.isSymbolicLink()||!st.isFile()||st.size>65536)throw Error();const r=JSON.parse(readFileSync(file,'utf8'));
 if(!r||Object.keys(r).some(k=>!['version','scope','project','environment','manifest','phase','url'].includes(k))||r.version!==1||r.scope!==context.scope||r.project!==context.project||r.environment!==context.environment||!['prepared','failed','succeeded'].includes(r.phase)||!readManagedRuntimeManifest(r.manifest)||r.manifest.target!=='vercel'||r.manifest.environment!==context.environment)throw Error();
 if(r.url!==null){const u=new URL(r.url);if(u.origin!==r.url||u.protocol!=='https:'||!u.hostname.endsWith('.vercel.app'))throw Error();}if(r.phase==='succeeded'&&!r.url)throw Error();return r;
 }catch{throw Error('invalid_vercel_receipt');}
}
function save(root,context,receipt){const file=vercelReceiptPath(root,context);checkPath(dirname(file));mkdirSync(dirname(file),{recursive:true,mode:0o700});checkPath(dirname(file));const temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});renameSync(temp,file);}
export async function executeManagedVercel(prepared,context,{root=process.cwd(),execute=executeVercelProfile,...options}={}) {
 assertVercelProfileContext(context);const release=acquireDeploymentLock({accountId:createHash('sha256').update('vercel:'+context.scope).digest('hex').slice(0,32),appName:context.project,environment:context.environment});
 let receipt,previous;
 try {previous=readVercelReceipt(root,context);if((context.intent??'create')==='create'&&previous)throw Error('vercel_receipt_already_exists');if(context.intent==='redeploy'&&!previous)throw Error('vercel_receipt_required');
 const manifest=readManagedRuntimeManifest(profileEnvironment(prepared).FRONTBASE_DEPLOYMENT_MANIFEST);if(!manifest||manifest.target!=='vercel'||manifest.environment!==context.environment)throw Error('invalid_vercel_profile');
 if(previous&&stateBindingChanged(previous.manifest,manifest))throw Error('state_change_requires_migration');
 if(previous)for(const role of Object.keys(manifest.bindings)){if(role!=='state-db'&&JSON.stringify(previous.manifest.bindings[role])!==JSON.stringify(manifest.bindings[role]))throw Error('binding_change_requires_review');}
 receipt={version:1,scope:context.scope,project:context.project,environment:context.environment,manifest,phase:'prepared',url:previous?.url??null};save(root,context,receipt);
 const result=await execute(prepared,context,options);if(!result?.ok)throw Error('vercel_deployment_failed');const url=new URL(result.url);if(url.origin!==result.url||url.protocol!=='https:'||!url.hostname.endsWith('.vercel.app'))throw Error('invalid_vercel_result');
 save(root,context,{...receipt,phase:'succeeded',url:result.url});return result;
 }catch(error){if(receipt)save(root,context,{...receipt,phase:'failed'});throw error;}finally{release();}
}
