import {createHash} from 'node:crypto';
import {readManagedRuntimeManifest} from '../../packages/edge-core/dist/deployment.js';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function vercelManifestDigest(manifest){const safe=readManagedRuntimeManifest(manifest);if(!safe)throw Error('invalid_vercel_operation');return createHash('sha256').update(JSON.stringify(canonical(safe))).digest('hex');}
export function vercelOperation(context,manifest){
 if(context.operationId===undefined&&context.manifestDigest===undefined)return undefined;
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.operationId??'')||!/^[a-f0-9]{64}$/.test(context.manifestDigest??'')||context.manifestDigest!==vercelManifestDigest(manifest))throw Error('invalid_vercel_operation');
 return {operationId:context.operationId,manifestDigest:context.manifestDigest};
}
export const vercelOperationArgs=operation=>operation?['--meta','frontbaseOperation='+operation.operationId,'--meta','frontbaseManifest='+operation.manifestDigest]:[];
export function vercelOperationListArgs(context,operation){if(!operation)throw Error('vercel_operation_required');return ['list',context.project,'--environment',context.environment,'--limit','2','--json',...vercelOperationArgs(operation)];}
export function assertVercelOperationMatch(list,{context,operation,url}){
 if(!operation||!Array.isArray(list?.deployments)||list.deployments.length!==1)throw Error('vercel_operation_not_unique');
 const candidate=list.deployments[0];
 if(candidate.url!==new URL(url).hostname||candidate.name!==context.project||(candidate.target===null?'preview':candidate.target)!==context.environment||candidate.state!=='READY'||candidate.meta?.frontbaseOperation!==operation.operationId||candidate.meta?.frontbaseManifest!==operation.manifestDigest)throw Error('vercel_operation_mismatch');
}
