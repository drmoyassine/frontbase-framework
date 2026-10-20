import { createHash } from 'node:crypto';
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateStagedConsole } from '../console-pin.mjs';
import { validateDeploymentManifest } from '../../packages/edge-core/dist/deployment.js';
import { deployCommand } from '../../packages/compiler/dist/cli/deploy.js';
import { workerExists } from '../../packages/compiler/dist/cli/app-identity.js';
const repoRoot=join(dirname(fileURLToPath(import.meta.url)),'../..');
const defaultExample=join(repoRoot,'examples/cf-full');
export const cloudflareExecutionCapabilities={adapters:{'cloudflare-d1':['create'],'cloudflare-kv':['create']}};
export function cloudflareExecutionIssues(manifest,context) {
    const issues=[];
    if(manifest.target!=='cloudflare' || manifest.environment!==context.environment)issues.push({code:'execution_target_mismatch'});
    for(const [role,binding] of Object.entries(manifest.bindings))if(role!=='state-db' && !(role==='cache' && binding.adapterId==='cloudflare-kv' && binding.mode==='create') && binding.mode!=='disabled')issues.push({role,code:'execution_adapter_not_supported'});
    const state=manifest.bindings['state-db'];
    if(state.adapterId!=='cloudflare-d1' || state.mode!=='create')issues.push({role:'state-db',code:'execution_requires_new_d1'});
    if(state.config.resourceName!==`${context.appName}-db`)issues.push({role:'state-db',code:'execution_database_name_mismatch'});
    if(manifest.bindings.cache.mode!=='disabled' && manifest.bindings.cache.config.resourceName!==`${context.appName}-cache`)issues.push({role:'cache',code:'execution_cache_name_mismatch'});
    return issues;
}
export function assertCloudflareExecutionContext(context) {
    if(!/^[a-f0-9]{32}$/.test(context.accountId??'') || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(context.appName??'') || !['preview','production'].includes(context.environment) || !/^[a-f0-9]{64}$/.test(context.artifactHash??''))throw new Error('invalid_cloudflare_execution_context');
}
function files(directory) {
    return readdirSync(directory).sort().flatMap(name=>{const path=join(directory,name),stat=lstatSync(path);if(stat.isSymbolicLink())throw new Error('artifact_symlink_refused');return stat.isDirectory()?files(path):[path];});
}
export function fingerprintCloudflareArtifacts(exampleRoot=defaultExample) {
    const hash=createHash('sha256');
    for(const path of [join(exampleRoot,'dist/worker.mjs'),join(exampleRoot,'dist/pg-worker.mjs'),...files(join(exampleRoot,'console-dist'))]) {
        hash.update(path.slice(exampleRoot.length).replaceAll('\\','/'));hash.update('\0');hash.update(readFileSync(path));
    }
    return hash.digest('hex');
}
export function nativeWrangler(accountId) {
    return (args,{cwd,stdin}={})=>new Promise(resolve=>{
        const child=spawn(process.execPath,[join(repoRoot,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:accountId,CI:'true'},windowsHide:true,stdio:['pipe','pipe','pipe']});
        let stdout='',stderr='';
        child.stdout.on('data',x=>{stdout+=x;});child.stderr.on('data',x=>{stderr+=x;});
        child.stdin.on('error',()=>{});child.on('error',()=>resolve({code:1,stdout:'',stderr:''}));child.on('close',code=>resolve({code:code??1,stdout,stderr}));
        child.stdin.end(stdin??'');
    });
}
/** First-install bridge around the existing compiler executor; never modifies committed host config. */
export async function executeCloudflareFirstInstall(prepared,context,{exampleRoot=defaultExample,runWrangler=nativeWrangler(context.accountId),deploy=deployCommand,onSetupLink=()=>{},onReceipt=()=>{}}={}) {
    assertCloudflareExecutionContext(context);
    const plan=validateDeploymentManifest(prepared?.manifest);
    if(!plan.ready || cloudflareExecutionIssues(plan.manifest,context).length || !prepared.credentials || Object.keys(prepared.credentials).length)throw new Error('unsupported_cloudflare_execution_plan');
    if(fingerprintCloudflareArtifacts(exampleRoot)!==context.artifactHash)throw new Error('deployment_artifacts_changed');
    if(exampleRoot===defaultExample)validateStagedConsole(repoRoot,{requireHydrate:true});
    const stage=mkdtempSync(join(tmpdir(),'frontbase-cf-profile-'));
    mkdirSync(join(stage,'dist'));mkdirSync(join(stage,'src'));
    for(const name of ['worker.mjs','pg-worker.mjs'])copyFileSync(join(exampleRoot,'dist',name),join(stage,'dist',name));
    for(const name of ['worker.ts','sw.ts'])copyFileSync(join(exampleRoot,'src',name),join(stage,'src',name));
    cpSync(join(exampleRoot,'console-dist'),join(stage,'console-dist'),{recursive:true});
    if(fingerprintCloudflareArtifacts(stage)!==context.artifactHash)throw new Error('deployment_artifacts_changed');
    writeFileSync(join(stage,'wrangler.toml'),`name = "${context.appName}"\naccount_id = "${context.accountId}"\nmain = "dist/worker.mjs"\ncompatibility_date = "2026-09-07"\ncompatibility_flags = ["nodejs_compat"]\nno_bundle = true\nfind_additional_modules = true\nbase_dir = "./dist"\n[[rules]]\ntype = "ESModule"\nglobs = ["**/*.mjs"]\nfallthrough = true\n[assets]\ndirectory = "./console-dist"\nbinding = "ASSETS"\nrun_worker_first = true\n`,{mode:0o600});
    const resources={};
    const journal=phase=>writeFileSync(join(stage,'deployment-receipt.json'),JSON.stringify({phase,accountId:context.accountId,appName:context.appName,environment:context.environment,artifactHash:context.artifactHash,resources}),{mode:0o600});
    journal('prepared');
    const run=async(args,opts)=>{
        const kind=args.slice(0,2).join(' ');
        if(opts?.cwd!==stage || !['deployments list','d1 info','d1 create','secret put'].includes(kind) && args[0]!=='deploy')throw new Error('unexpected_cloudflare_command');
        if((kind==='d1 create' || kind==='d1 info') && args[2]!==`${context.appName}-db`)throw new Error('cloudflare_target_mismatch');
        if((kind==='secret put' || args[0]==='deploy') && args[args.indexOf('--name')+1]!==context.appName)throw new Error('cloudflare_target_mismatch');
        const result=await runWrangler(args,opts);
        // The compiler's legacy D1 parser can fall back to lookup after a failed create.
        // A new-resource profile must refuse that adoption rather than reuse unrelated data.
        if(args[0]==='d1' && args[1]==='create' && result.code!==0)throw new Error('d1_create_failed');
        if(args[0]==='deployments' && args[1]==='list' && result.code===0)throw new Error('worker_already_exists');
        return result;
    };
    try {
        if(await workerExists(context.appName,stage,run))throw new Error('worker_already_exists');
        const info=await runWrangler(['d1','info',`${context.appName}-db`,'--json'],{cwd:stage});
        if(info.code===0)throw new Error('database_already_exists');
        if(!/couldn.t find a D1 DB with name|D1 database .*not found|could not find.*database/i.test(info.stderr+' '+info.stdout))throw new Error('database_existence_unknown');
        // List failure/malformed output is not evidence that a namespace is absent.
        const cache=plan.manifest.bindings.cache;
        if(cache.mode!=='disabled') {
            const listed=await runWrangler(['kv','namespace','list'],{cwd:stage});
            if(listed.code!==0)throw new Error('cache_existence_unknown');
            let entries;try{entries=JSON.parse(listed.stdout);}catch{throw new Error('cache_existence_unknown');}
            if(!Array.isArray(entries) || entries.some(entry=>!entry || typeof entry.title!=='string' || !/^[a-f0-9]{32}$/.test(entry.id)))throw new Error('cache_existence_unknown');
            if(entries.some(entry=>entry.title===cache.config.resourceName))throw new Error('cache_already_exists');
        }
        journal('running');
        if(cache.mode!=='disabled') {
            const created=await runWrangler(['kv','namespace','create',cache.config.resourceName,'--binding','FRONTBASE_KV','--update-config=false'],{cwd:stage});
            if(created.code!==0)throw new Error('cache_create_failed');
            const id=created.stdout.match(/(?:"id"\s*:\s*"|\bid\s*=\s*")([a-f0-9]{32})"/)?.[1];
            if(!id)throw new Error('cache_create_identity_unknown');
            resources.cache={name:cache.config.resourceName,id,binding:'FRONTBASE_KV'};
            writeFileSync(join(stage,'wrangler.toml'),readFileSync(join(stage,'wrangler.toml'),'utf8')+`\n[[kv_namespaces]]\nbinding = "FRONTBASE_KV"\nid = "${id}"\n`,{mode:0o600});
            journal('cache_created');
        }
        const result=await deploy('.', {cwd:stage,target:'cloudflare',appName:context.appName,runWrangler:run,onSetupLink});
        if(!result.ok)throw new Error('cloudflare_deployment_failed');
        const url=new URL(result.details?.workerUrl??'');
        if(url.protocol!=='https:' || !url.hostname.startsWith(context.appName+'.') || !url.hostname.endsWith('.workers.dev') || url.username || url.password || url.search || url.hash)throw new Error('invalid_worker_url');
        journal('succeeded');onReceipt({directory:stage,appName:context.appName,accountId:context.accountId,url:url.origin});
        return {ok:true,url:url.origin};
    } catch {
        journal('failed');onReceipt({directory:stage,appName:context.appName,accountId:context.accountId,failed:true});
        throw new Error('cloudflare_deployment_failed_resources_preserved');
    }
}
