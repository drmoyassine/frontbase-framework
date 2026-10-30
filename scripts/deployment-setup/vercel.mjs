import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEPLOY_SECRET_NAMES} from '../deploy-environment.mjs';
import {vercelOperation} from './vercel-operation.mjs';
import {profileEnvironment} from './profile-environment.mjs';
const script=fileURLToPath(new URL('../deploy-vercel.mjs',import.meta.url));
export const vercelExecutionCapabilities={adapters:{'turso-marketplace':['reuse'],'libsql-http':['connect'],'d1-http':['connect'],'postgrest-http':['connect'],'upstash-http':['connect'],'cloudflare-vectorize-http':['connect'],'libsql-vector-http':['connect'],'qstash-http':['connect'],'s3-http':['connect']}};
export function assertVercelProfileContext(context) {
 if(!/^team_[a-zA-Z0-9]+$/.test(context.scope??'')||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(context.project??'')||!['production','preview'].includes(context.environment)||!['create','redeploy','resume'].includes(context.intent??'create'))throw Error('invalid_vercel_profile_context');
}
export function vercelExecutionIssues(manifest,context) {
 if(manifest.target!=='vercel'||manifest.environment!==context.environment)return [{code:'execution_target_mismatch'}];
 return Object.entries(manifest.bindings).filter(([,b])=>b.mode!=='disabled'&&!vercelExecutionCapabilities.adapters[b.adapterId]?.includes(b.mode)).map(([role])=>({role,code:'execution_adapter_not_supported'}));
}
export async function executeVercelProfile(prepared,context,{onSetupLink=()=>{},run}={}) {
 assertVercelProfileContext(context);if(context.intent==='resume')throw Error('resume_requires_reconciliation_command');if(vercelExecutionIssues(prepared?.manifest??{},context).length)throw Error('unsupported_vercel_profile');
 const values=profileEnvironment(prepared);const operation=vercelOperation(context,JSON.parse(values.FRONTBASE_DEPLOYMENT_MANIFEST));
 if(prepared.manifest.bindings.storage.mode!=='disabled'){const storage=JSON.parse(values.FRONTBASE_STORAGE);storage.namespace='vercel:'+context.scope+':'+context.project+':'+context.environment;values.FRONTBASE_STORAGE=JSON.stringify(storage);}
 const execute=run??((args,stdin)=>new Promise(resolve=>{
  const env={...process.env};for(const name of DEPLOY_SECRET_NAMES)delete env[name];
  const child=spawn(process.execPath,[script,...args],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',c=>{stdout+=c;if(stdout.length>2000000)child.kill();});child.stderr.on('data',c=>{stderr+=c;if(stderr.length>2000000)child.kill();});child.stdin.on('error',()=>{});child.once('error',()=>resolve({code:1}));child.once('close',code=>resolve({code,stdout,stderr}));child.stdin.end(stdin);
 }));
 const result=await execute(['--project',context.project,'--scope',context.scope,'--environment',context.environment,context.intent==='redeploy'?'--redeploy':'--first-install','--secrets-json',...(operation?['--operation-id',operation.operationId,'--manifest-digest',operation.manifestDigest]:[]),...(context.setupLink?['--setup-link']:[])],JSON.stringify(values));
 // Never return raw host output: it can contain the private first-admin capability.
 if(result.code!==0)throw Error('vercel_profile_deployment_failed_resources_preserved');
 const lines=(result.stdout??'').split(/\r?\n/);const match=lines.map(l=>l.match(/deployed to (https:\/\/[^\s]+)/)?.[1]).filter(Boolean).pop();
 let url;try{url=new URL(match);}catch{throw Error('vercel_deployment_url_unknown');}
 if(url.protocol!=='https:'||!url.hostname.endsWith('.vercel.app')||url.username||url.password||url.search||url.hash)throw Error('vercel_deployment_url_unknown');
 const setup=lines.map(l=>l.trim()).find(l=>l.startsWith(url.origin+'/setup#/setup?claim='));if(setup)onSetupLink({url:setup});
 return {ok:true,url:url.origin};
}

/** Read only names/IDs and environment membership through supported CLI metadata commands. */
export function discoverVercelResources(context,{run}={}) {
 assertVercelProfileContext(context);const cli=run??(args=>{const r=spawnSync('vercel',[...args,'--scope',context.scope,'--non-interactive'],{cwd:process.cwd(),encoding:'utf8',timeout:30000,shell:process.platform==='win32'});return {code:r.status,stdout:r.stdout};});
 try {const listed=cli(['integration','list','--all','--json']);if(listed.code!==0)return [];const data=JSON.parse(listed.stdout);if(!Array.isArray(data.resources)||data.resources.length>200)return [];
 const candidates=data.resources.filter(r=>r.product==='Turso'&&/^store_[a-zA-Z0-9]+$/.test(r.id??'')&&typeof r.name==='string'&&/^[a-z0-9][a-z0-9-]{0,62}$/.test(r.name)&&r.projects?.includes(context.project));if(candidates.length>20)return [];
 return candidates.filter(r=>{const detail=cli(['integration','resource','inspect',r.name,'--json']);if(detail.code!==0)return false;const live=JSON.parse(detail.stdout).resource;return live?.id===r.id&&live.projects?.some(p=>p.name===context.project&&p.environments?.includes(context.environment));}).map(r=>({id:r.id,name:r.name}));
 }catch{return [];}
}
