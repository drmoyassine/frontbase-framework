import {spawnSync} from 'node:child_process';
import {assertVercelProfileContext} from './vercel.mjs';
import {vercelOperation,vercelOperationListArgs,assertVercelOperationMatch} from './vercel-operation.mjs';
import {assertVercelDeployment,vercelDeploymentUrl} from '../vercel-deployment-policy.mjs';
/** Explicit known canonical URL; no environment reads, changes, uploads or latest-by-name adoption. */
export function inspectVercelOperation(context,receipt,deployment,{run}={}){
 assertVercelProfileContext(context);const operation=vercelOperation(receipt,receipt.manifest);if(!operation)throw Error('legacy_vercel_receipt_requires_manual_reconciliation');
 let url;try{url=vercelDeploymentUrl(JSON.stringify({url:deployment}));if(url!==deployment)throw Error();}catch{throw Error('canonical_vercel_deployment_required');}
 const cli=run??(args=>{const r=spawnSync('vercel',[...args,'--scope',context.scope,'--non-interactive'],{cwd:process.cwd(),encoding:'utf8',timeout:30000,maxBuffer:2000000,shell:process.platform==='win32'});return {code:r.status,stdout:r.stdout};});
 const read=args=>{const r=cli(args);if(r.code!==0)throw Error('vercel_reconciliation_inspection_failed');try{return JSON.parse(r.stdout);}catch{throw Error('vercel_reconciliation_inspection_failed');}};
 const project=read(['project','inspect',context.project,'--json']);if(project.name!==context.project||!/^prj_[a-zA-Z0-9]+$/.test(project.id??'')||!project.owner?.slug)throw Error('vercel_reconciliation_project_mismatch');
 const list=read(vercelOperationListArgs(context,operation));assertVercelOperationMatch(list,{context,operation,url});
 const actual=read(['inspect',url,'--json']);const canonical=assertVercelDeployment(actual,{project:context.project,environment:context.environment,teamSlug:project.owner.slug});if(canonical!==url)throw Error('canonical_vercel_deployment_required');
 return {ok:true,url:canonical};
}
