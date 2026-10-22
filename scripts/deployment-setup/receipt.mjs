import { isDeepStrictEqual } from 'node:util';
import { validateDeploymentManifest } from '../../packages/edge-core/dist/deployment.js';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve, parse } from 'node:path';
import { tmpdir } from 'node:os';

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hex=/^[a-f0-9]{32}$/;
const phases=new Set(['prepared','running','storage_create_started','storage_created','cache_create_started','cache_created','database_create_started','database_created','worker_write_started','succeeded','failed']);
const pending=new Set(['storage','cache','database','worker',null]);
function exact(value,keys) { return value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>keys.includes(key)); }
export function assertReceiptTarget(context) {
 if(!hex.test(context.accountId??'') || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(context.appName??'') || !['preview','production'].includes(context.environment))throw new Error('invalid_receipt_target');
}
function safeAncestors(path) {
 for(let cursor=resolve(path);;cursor=dirname(cursor)) {
  if(existsSync(cursor) && (lstatSync(cursor).isSymbolicLink() || !lstatSync(cursor).isDirectory()))throw new Error('receipt_path_refused');
  if(cursor===parse(cursor).root)break;
 }
}
export function receiptPath(root,context) {
 assertReceiptTarget(context);
 return join(resolve(root),'.frontbase','deployments',context.accountId,context.environment,context.appName,'deployment.json');
}
export function validateReceipt(value,context) {
 assertReceiptTarget(context);
 if(!exact(value,['schemaVersion','installationId','operationId','revision','accountId','appName','environment','artifactHash','manifest','phase','pending','resources','identity','url']) || value.schemaVersion!==1 || !uuid.test(value.installationId??'') || !uuid.test(value.operationId??'') || !Number.isSafeInteger(value.revision) || value.revision<0 || !phases.has(value.phase) || !pending.has(value.pending) || !/^[a-f0-9]{64}$/.test(value.artifactHash??'') || ['accountId','appName','environment'].some(k=>value[k]!==context[k]))throw new Error('invalid_deployment_receipt');
 const resources=value.resources;
 if(!exact(resources,['database','cache','storage']))throw new Error('invalid_deployment_receipt');
 for(const [role,item] of Object.entries(resources)) {
  const fields=role==='storage'?['name','binding','created']:['name','binding','id'];
  if(!exact(item,fields) || item.name!==context.appName+({database:'-db',cache:'-cache',storage:'-storage'}[role]) || item.binding!==({database:'DB',cache:'FRONTBASE_KV',storage:'FRONTBASE_R2'}[role]))throw new Error('invalid_deployment_receipt');
  if(role!=='storage' && !(role==='database'?uuid:hex).test(item.id??''))throw new Error('invalid_deployment_receipt');
  if(role==='storage' && item.created!==undefined && (typeof item.created!=='string'||new Date(item.created).toISOString()!==item.created))throw new Error('invalid_deployment_receipt');
 }
 // Native-only manifests have no credentials, secret references or arbitrary connection settings.
 if(value.url!==null) {
  let url;try{url=new URL(value.url);}catch{throw new Error('invalid_deployment_receipt');}
  if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash || !url.hostname.startsWith(context.appName+'.') || !url.hostname.endsWith('.workers.dev') || url.origin!==value.url)throw new Error('invalid_deployment_receipt');
 }
 const manifest=value.manifest;
 if(!exact(manifest,['version','target','environment','profileId','profileVersion','bindings']))throw new Error('invalid_deployment_receipt');
 if(!validateDeploymentManifest(manifest).ready || !manifest || manifest.target!=='cloudflare' || manifest.environment!==context.environment)throw new Error('invalid_deployment_receipt');
 for(const [role,binding] of Object.entries(manifest.bindings??{})) {
  if(binding.mode!=='disabled' && (binding.mode!=='create' || binding.adapterId!==({'state-db':'cloudflare-d1',cache:'cloudflare-kv',storage:'cloudflare-r2'}[role])))throw new Error('invalid_deployment_receipt');
  if(!exact(binding,['adapterId','mode','config','secretRefs','origin']) || !exact(binding.secretRefs,[]) || !exact(binding.config,['resourceName']))throw new Error('invalid_deployment_receipt');
  if(binding.config.resourceName!==undefined && ![context.appName+'-db',context.appName+'-cache',context.appName+'-storage'].includes(binding.config.resourceName))throw new Error('invalid_deployment_receipt');
 }
 if(value.identity!==null) {
  if(!exact(value.identity,['installationId','versionId','deploymentId','resources','secrets','operationId']) || value.identity.installationId!==value.installationId || !uuid.test(value.identity.operationId??'') || !uuid.test(value.identity.versionId??'') || !uuid.test(value.identity.deploymentId??'') || !Array.isArray(value.identity.secrets) || value.identity.secrets.some(x=>typeof x!=='string'||!/^[A-Z][A-Z0-9_]{0,127}$/.test(x)) || !isDeepStrictEqual(value.identity.resources,resources))throw new Error('invalid_deployment_receipt');
 }
 if(value.phase==='succeeded' && (!value.identity || value.pending!==null || value.identity.operationId!==value.operationId))throw new Error('invalid_deployment_receipt');
 return value;
}
export function readReceipt(path,context) {
 safeAncestors(dirname(path));
 if(!existsSync(path))return null;
 const stat=lstatSync(path);if(stat.isSymbolicLink() || !stat.isFile() || stat.size>65536)throw new Error('receipt_path_refused');
 try{return validateReceipt(JSON.parse(readFileSync(path,'utf8')),context);}catch{throw new Error('invalid_deployment_receipt');}
}
export function writeReceipt(path,value,context,expectedRevision) {
 validateReceipt(value,context);safeAncestors(dirname(path));mkdirSync(dirname(path),{recursive:true,mode:0o700});safeAncestors(dirname(path));
 const current=readReceipt(path,context);
 if((current?.revision??-1)!==expectedRevision || value.revision!==expectedRevision+1)throw new Error('receipt_revision_changed');
 const bytes=JSON.stringify(value,null,2);if(Buffer.byteLength(bytes)>65536)throw new Error('receipt_too_large');
 const temp=path+'.'+randomUUID()+'.tmp';let fd;
 try{fd=openSync(temp,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temp,path);}
 finally{if(fd!==undefined)closeSync(fd);if(existsSync(temp))unlinkSync(temp);}
}
export function acquireDeploymentLock(context,{lockRoot=join(tmpdir(),'frontbase-deployment-locks')}={}) {
 assertReceiptTarget(context);safeAncestors(lockRoot);mkdirSync(lockRoot,{recursive:true,mode:0o700});safeAncestors(lockRoot);
 // Same account/name is one Worker, even across worktrees and environment labels.
 const path=join(lockRoot,context.accountId+'-'+context.appName+'.lock');
 try{mkdirSync(path,{mode:0o700});}catch{throw new Error('deployment_locked_reconciliation_required');}
 const token=randomUUID(),owner=join(path,'owner.json');
 writeFileSync(owner,JSON.stringify({token,pid:process.pid}),{flag:'wx',mode:0o600});
 let released=false;
 return ()=>{if(released)return;const value=JSON.parse(readFileSync(owner,'utf8'));if(value.token!==token)throw new Error('deployment_lock_changed');unlinkSync(owner);rmdirSync(path);released=true;};
}
