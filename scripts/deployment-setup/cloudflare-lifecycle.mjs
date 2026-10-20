import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployCommand } from '../../packages/compiler/dist/cli/deploy.js';
import { validateDeploymentManifest, managedRuntimeManifest } from '../../packages/edge-core/dist/deployment.js';
import { executeCloudflareFirstInstall, cloudflareExecutionIssues, stageCloudflareArtifacts, nativeWrangler, assertCloudflareExecutionContext } from './cloudflare.mjs';
import { readCloudflareIdentity, installationBinding } from './cloudflare-identity.mjs';
import { acquireDeploymentLock, receiptPath, readReceipt, writeReceipt } from './receipt.mjs';
const defaultRoot=fileURLToPath(new URL('../..',import.meta.url));
export function reuseManifest(receipt) {
 const manifest=structuredClone(receipt.manifest);
 for(const [role,key] of [['state-db','database'],['cache','cache'],['storage','storage']])if(manifest.bindings[role].mode!=='disabled'){
  manifest.bindings[role].mode='reuse';
  manifest.bindings[role].resourceRef=receipt.resources[key]?.id??receipt.resources[key]?.name;
 }
 return manifest;
}
export function managedExecutionIssues(manifest,context,intent,receipt) {
 if(intent==='create')return cloudflareExecutionIssues(manifest,context);
 return receipt && isDeepStrictEqual(manifest,reuseManifest(receipt))?[]:[{code:'managed_binding_change_requires_migration'}];
}
function compareResources(expected,actual,{allowMissingCreated=false}={}) {
 const copy=structuredClone(actual);
 if(allowMissingCreated && expected.storage && !expected.storage.created && copy.storage)delete copy.storage.created;
 if(!isDeepStrictEqual(expected,copy))throw new Error('deployment_resource_identity_changed');
}
export async function executeManagedCloudflare(prepared,context,{intent='create',root=defaultRoot,exampleRoot,runWrangler=nativeWrangler(context.accountId),readIdentity=ctx=>readCloudflareIdentity(ctx,{runWrangler,cwd:root}),deploy=deployCommand,onSetupLink=()=>{},onReceipt=()=>{},lockRoot}={}) {
 assertCloudflareExecutionContext(context);
 if(!['create','redeploy','resume'].includes(intent))throw new Error('invalid_deployment_intent');
 const path=receiptPath(root,context),release=acquireDeploymentLock(context,{lockRoot});
 let receipt,stage;
 const save=changes=>{
  const expected=receipt?.revision??-1;
  const next={...receipt,...changes,revision:expected+1};
  writeReceipt(path,next,context,expected);receipt=next;
 };
 try {
  receipt=readReceipt(path,context);
  if(!validateDeploymentManifest(prepared?.manifest).ready || !prepared.credentials || Object.keys(prepared.credentials).length || managedExecutionIssues(prepared.manifest,context,intent,receipt).length)throw new Error('unsupported_managed_deployment_plan');
  if(intent==='create') {
   if(receipt)throw new Error('deployment_receipt_already_exists');
   receipt={schemaVersion:1,installationId:randomUUID(),operationId:randomUUID(),revision:-1,accountId:context.accountId,appName:context.appName,environment:context.environment,artifactHash:context.artifactHash,manifest:structuredClone(prepared.manifest),phase:'prepared',pending:null,resources:{},identity:null,url:null};
   save({});
   const result=await executeCloudflareFirstInstall(prepared,context,{exampleRoot,runWrangler,deploy,onSetupLink,
    installationId:receipt.installationId,operationId:receipt.operationId,
    onReceipt:value=>{stage=value.directory;},
    onCheckpoint:value=>save({...value,phase:value.phase==='succeeded'?'running':value.phase}),
   });
   save({url:result.url});
   const identity=await readIdentity(context);
   if(identity.installationId!==receipt.installationId || identity.operationId!==receipt.operationId)throw new Error('deployment_ownership_changed');
   if(receipt.identity && !isDeepStrictEqual(identity.secrets,receipt.identity.secrets))throw new Error('deployment_secret_names_changed');
   compareResources(receipt.resources,identity.resources,{allowMissingCreated:true});
   save({phase:'succeeded',pending:null,resources:identity.resources,identity});
   onReceipt({path,directory:stage});
   return result;
  }
  if(!receipt || !receipt.identity && intent!=='resume')throw new Error('managed_deployment_not_established');
  if(intent==='resume') {
   // Recovery only confirms a completed upload. Unknown create outcomes are never adopted by name.
   if(receipt.phase==='succeeded' || !receipt.url || ![null,'worker'].includes(receipt.pending))throw new Error('deployment_requires_manual_reconciliation');
   const identity=await readIdentity(context);
   if(identity.installationId!==receipt.installationId || identity.operationId!==receipt.operationId)throw new Error('deployment_ownership_changed');
   compareResources(receipt.resources,identity.resources,{allowMissingCreated:true});
   save({phase:'succeeded',pending:null,resources:identity.resources,identity});
   onReceipt({path});return {ok:true,url:receipt.url,reconciled:true};
  }
  if(receipt.phase!=='succeeded')throw new Error('deployment_requires_reconciliation');
  const before=await readIdentity(context);
  if(!isDeepStrictEqual(before,receipt.identity))throw new Error('deployment_remote_state_changed');
  stage=stageCloudflareArtifacts(context,exampleRoot);
  const resources=receipt.resources;
  let config='\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "'+resources.database.name+'"\ndatabase_id = "'+resources.database.id+'"\n';
  if(resources.cache)config+='\n[[kv_namespaces]]\nbinding = "FRONTBASE_KV"\nid = "'+resources.cache.id+'"\n';
  if(resources.storage)config+='\n[[r2_buckets]]\nbinding = "FRONTBASE_R2"\nbucket_name = "'+resources.storage.name+'"\n';
  appendFileSync(join(stage,'wrangler.toml'),config);
  const previousIdentity=receipt.identity;
  save({phase:'running',operationId:randomUUID(),artifactHash:context.artifactHash,pending:null});
  let uploaded=false;
  const run=async(args,options)=>{
   if(options.cwd!==stage || !['deployments','deploy'].includes(args[0]) || args[args.indexOf('--name')+1]!==context.appName || uploaded)throw new Error('managed_redeploy_command_refused');
   if(args[0]==='deployments') {
    if(args[1]!=='list')throw new Error('managed_redeploy_command_refused');
    return runWrangler(args,options);
   }
   if(args.length!==3)throw new Error('managed_redeploy_command_refused');
   const current=await readIdentity(context);
   if(!isDeepStrictEqual(current,previousIdentity))throw new Error('deployment_remote_state_changed');
   save({pending:'worker',phase:'worker_write_started'});
   uploaded=true;
   return runWrangler([...args,'--keep-vars','--var',installationBinding+':'+receipt.installationId,'--tag',receipt.operationId,'--var','FRONTBASE_DEPLOYMENT_MANIFEST:'+JSON.stringify(managedRuntimeManifest(receipt.manifest,receipt.resources))],options);
  };
  const result=await deploy('.',{cwd:stage,target:'cloudflare',appName:context.appName,d1DatabaseId:resources.database.id,runWrangler:run});
  if(!result.ok || !uploaded || result.details?.workerUrl!==receipt.url)throw new Error('managed_redeploy_failed');
  const after=await readIdentity(context);
  if(after.installationId!==receipt.installationId || after.operationId!==receipt.operationId || after.versionId===previousIdentity.versionId || !isDeepStrictEqual(after.secrets,previousIdentity.secrets))throw new Error('deployment_postcondition_failed');
  compareResources(receipt.resources,after.resources);
  save({phase:'succeeded',pending:null,identity:after});
  onReceipt({path,directory:stage});
  return {ok:true,url:receipt.url};
 } catch {
  // Never clear an uncertain mutation or roll back remote resources automatically.
  if(receipt && receipt.revision>=0 && receipt.phase!=='succeeded')save({phase:'failed'});
  throw new Error('managed_deployment_refused_resources_preserved');
 } finally {release();}
}
