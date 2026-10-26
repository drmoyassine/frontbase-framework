import {profileEnvironment} from './profile-environment.mjs';
import {verifyEmptyExternalState} from './cloudflare-state.mjs';
import {resourceName,verifyEmptyCloudflareResources} from './cloudflare-resources.mjs';
import { createHash } from 'node:crypto';
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateStagedConsole } from '../console-pin.mjs';
import { validateDeploymentManifest, managedRuntimeManifest } from '../../packages/edge-core/dist/deployment.js';
import { deployCommand } from '../../packages/compiler/dist/cli/deploy.js';
import { parseDatabaseId } from '../../packages/compiler/dist/cli/provision-d1.js';
import { workerExists } from '../../packages/compiler/dist/cli/app-identity.js';
const repoRoot=join(dirname(fileURLToPath(import.meta.url)),'../..');
const defaultExample=join(repoRoot,'examples/cf-full');
export const cloudflareExecutionCapabilities={adapters:{'cloudflare-d1':['create','reuse'],'cloudflare-kv':['create','reuse'],'cloudflare-r2':['create'],'libsql-http':['connect'],'d1-http':['connect'],'upstash-http':['connect'],'cloudflare-vectorize-http':['connect'],'libsql-vector-http':['connect'],'s3-http':['connect'],'qstash-http':['connect']}};
export function cloudflareExecutionIssues(manifest,context) {
    const issues=[];
    if(manifest.target!=='cloudflare' || manifest.environment!==context.environment)issues.push({code:'execution_target_mismatch'});
    for(const [role,binding] of Object.entries(manifest.bindings))if(binding.mode!=='disabled'&&!cloudflareExecutionCapabilities.adapters[binding.adapterId]?.includes(binding.mode))issues.push({role,code:'execution_adapter_not_supported'});
    const state=manifest.bindings['state-db'];
    if(state.mode==='create' && state.config.resourceName!==`${context.appName}-db`)issues.push({role:'state-db',code:'execution_database_name_mismatch'});
    if(manifest.bindings.cache.mode==='create' && manifest.bindings.cache.config.resourceName!==`${context.appName}-cache`)issues.push({role:'cache',code:'execution_cache_name_mismatch'});
    if(manifest.bindings.storage.mode==='create' && manifest.bindings.storage.config.resourceName!==`${context.appName}-storage`)issues.push({role:'storage',code:'execution_storage_name_mismatch'});
    if(manifest.bindings.storage.mode==='create' && (manifest.bindings.storage.config.resourceName?.length??0)>63)issues.push({role:'storage',code:'execution_storage_name_too_long'});
    for(const role of ['state-db','cache']) {
        const b=manifest.bindings[role];
        if(b.mode==='reuse' && (!resourceName.test(b.config.resourceName??'') || !(role==='state-db'?/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/:/^[a-f0-9]{32}$/).test(b.resourceRef??'')))issues.push({role,code:'invalid_reused_resource'});
    }
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
export async function readNativeR2Identity(name,runWrangler,cwd) {
    const observed=await runWrangler(['r2','bucket','info',name,'--json'],{cwd});
    let bucket;try{bucket=JSON.parse(observed.stdout);}catch{throw new Error('storage_identity_unknown');}
    if(observed.code!==0 || bucket.name!==name || typeof bucket.created!=='string' || new Date(bucket.created).toISOString()!==bucket.created)throw new Error('storage_identity_unknown');
    return {name,binding:'FRONTBASE_R2',created:bucket.created};
}
export function stageCloudflareArtifacts(context,exampleRoot=defaultExample) {
    assertCloudflareExecutionContext(context);
    if(fingerprintCloudflareArtifacts(exampleRoot)!==context.artifactHash)throw new Error('deployment_artifacts_changed');
    if(exampleRoot===defaultExample)validateStagedConsole(repoRoot,{requireHydrate:true});
    const stage=mkdtempSync(join(tmpdir(),'frontbase-cf-profile-'));
    mkdirSync(join(stage,'dist'));mkdirSync(join(stage,'src'));
    for(const name of ['worker.mjs','pg-worker.mjs'])copyFileSync(join(exampleRoot,'dist',name),join(stage,'dist',name));
    for(const name of ['worker.ts','sw.ts'])copyFileSync(join(exampleRoot,'src',name),join(stage,'src',name));
    cpSync(join(exampleRoot,'console-dist'),join(stage,'console-dist'),{recursive:true});
    if(fingerprintCloudflareArtifacts(stage)!==context.artifactHash)throw new Error('deployment_artifacts_changed');
    writeFileSync(join(stage,'wrangler.toml'),`name = "${context.appName}"\naccount_id = "${context.accountId}"\nmain = "dist/worker.mjs"\ncompatibility_date = "2026-09-07"\ncompatibility_flags = ["nodejs_compat"]\nno_bundle = true\nfind_additional_modules = true\nbase_dir = "./dist"\n[[rules]]\ntype = "ESModule"\nglobs = ["**/*.mjs"]\nfallthrough = true\n[assets]\ndirectory = "./console-dist"\nbinding = "ASSETS"\nrun_worker_first = true\n`,{mode:0o600});
    return stage;
}
/** First-install bridge around the existing compiler executor; never modifies committed host config. */
export async function executeCloudflareFirstInstall(prepared,context,{exampleRoot=defaultExample,runWrangler=nativeWrangler(context.accountId),deploy=deployCommand,onSetupLink=()=>{},onReceipt=()=>{},onCheckpoint=()=>{},installationId,operationId,checkExternalState=verifyEmptyExternalState}={}) {
    assertCloudflareExecutionContext(context);
    const plan=validateDeploymentManifest(prepared?.manifest);
    if(!plan.ready || cloudflareExecutionIssues(plan.manifest,context).length || !prepared.credentials)throw new Error('unsupported_cloudflare_execution_plan');
    if(installationId && (!/^[a-f0-9-]{36}$/.test(installationId) || !/^[a-f0-9-]{36}$/.test(operationId??'')))throw new Error('invalid_installation_identity');
    const environment=profileEnvironment(prepared);
    if(environment.FRONTBASE_STORAGE && plan.manifest.bindings.storage.mode==='connect'){const storage=JSON.parse(environment.FRONTBASE_STORAGE);storage.namespace='cloudflare:'+context.accountId+':'+context.appName;environment.FRONTBASE_STORAGE=JSON.stringify(storage);}
    const stage=stageCloudflareArtifacts(context,exampleRoot);
    const resources={};
    let pending=null;
    const journal=phase=>{
        const checkpoint={phase,pending,resources:structuredClone(resources)};
        onCheckpoint(checkpoint);
        writeFileSync(join(stage,'deployment-receipt.json'),JSON.stringify({...checkpoint,accountId:context.accountId,appName:context.appName,environment:context.environment,artifactHash:context.artifactHash}),{mode:0o600});
    };
    journal('prepared');
    const run=async(args,opts)=>{
        const kind=args.slice(0,2).join(' ');
        if(opts?.cwd!==stage || !['deployments list','d1 info','d1 create','secret put'].includes(kind) && args[0]!=='deploy')throw new Error('unexpected_cloudflare_command');
        if((kind==='d1 create' || kind==='d1 info') && args[2]!==`${context.appName}-db`)throw new Error('cloudflare_target_mismatch');
        if((kind==='secret put' || args[0]==='deploy') && args[args.indexOf('--name')+1]!==context.appName)throw new Error('cloudflare_target_mismatch');
        if(kind==='d1 create'){pending='database';journal('database_create_started');}
        if(kind==='secret put' || args[0]==='deploy'){pending='worker';journal('worker_write_started');}
        if(args[0]==='deploy')for(const [name,value] of Object.entries(environment)){if(name==='FRONTBASE_DEPLOYMENT_MANIFEST')continue;const pushed=await runWrangler(['secret','put',name,'--name',context.appName],{cwd:stage,stdin:value});if(pushed.code!==0)throw Error('profile_secret_upload_failed');}
        const actualArgs=args[0]==='deploy' && installationId?[...args,'--var',`FRONTBASE_INSTALLATION_ID:${installationId}`,'--tag',operationId,'--var','FRONTBASE_DEPLOYMENT_MANIFEST:'+JSON.stringify(managedRuntimeManifest(plan.manifest,resources))]:args;
        const result=await runWrangler(actualArgs,opts);
        if(kind==='d1 create' && result.code===0 && installationId){
            const id=parseDatabaseId(result.stdout);
            if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id??''))throw new Error('database_create_identity_unknown');
            resources.database={name:context.appName+'-db',id,binding:'DB'};pending=null;journal('database_created');
        }
        // The compiler's legacy D1 parser can fall back to lookup after a failed create.
        // A new-resource profile must refuse that adoption rather than reuse unrelated data.
        if(args[0]==='d1' && args[1]==='create' && result.code!==0)throw new Error('d1_create_failed');
        if(args[0]==='deployments' && args[1]==='list' && result.code===0)throw new Error('worker_already_exists');
        return result;
    };
    try {
        if(await workerExists(context.appName,stage,run))throw new Error('worker_already_exists');
        await checkExternalState(prepared);
        await verifyEmptyCloudflareResources(plan.manifest,runWrangler,stage);
        const state=plan.manifest.bindings['state-db'];
        if(state.mode==='create') {
        const info=await runWrangler(['d1','info',`${context.appName}-db`,'--json'],{cwd:stage});
        if(info.code===0)throw new Error('database_already_exists');
        if(!/couldn.t find a D1 DB with name|D1 database .*not found|could not find.*database/i.test(info.stderr+' '+info.stdout))throw new Error('database_existence_unknown');
        } else if(state.mode==='reuse') {
            resources.database={name:state.config.resourceName,id:state.resourceRef,binding:'DB'};
        }
        // List failure/malformed output is not evidence that a namespace is absent.
        const cache=plan.manifest.bindings.cache;
        if(cache.mode==='create') {
            const listed=await runWrangler(['kv','namespace','list'],{cwd:stage});
            if(listed.code!==0)throw new Error('cache_existence_unknown');
            let entries;try{entries=JSON.parse(listed.stdout);}catch{throw new Error('cache_existence_unknown');}
            if(!Array.isArray(entries) || entries.some(entry=>!entry || typeof entry.title!=='string' || !/^[a-f0-9]{32}$/.test(entry.id)))throw new Error('cache_existence_unknown');
            if(entries.some(entry=>entry.title===cache.config.resourceName))throw new Error('cache_already_exists');
        }
        const storage=plan.manifest.bindings.storage;
        if(storage.mode==='create') {
            const info=await runWrangler(['r2','bucket','info',storage.config.resourceName,'--json'],{cwd:stage});
            if(info.code===0)throw new Error('storage_already_exists');
            if(!/The specified bucket does not exist\. \[code: 10006\]/.test(info.stderr+' '+info.stdout))throw new Error('storage_existence_unknown');
        }
        journal('running');
        if(storage.mode==='create') {
            pending='storage';journal('storage_create_started');
            const created=await runWrangler(['r2','bucket','create',storage.config.resourceName,'--binding','FRONTBASE_R2','--update-config=false'],{cwd:stage});
            if(created.code!==0)throw new Error('storage_create_failed');
            resources.storage={name:storage.config.resourceName,binding:'FRONTBASE_R2'};
            if(installationId)resources.storage=await readNativeR2Identity(storage.config.resourceName,runWrangler,stage);
            writeFileSync(join(stage,'wrangler.toml'),readFileSync(join(stage,'wrangler.toml'),'utf8')+`\n[[r2_buckets]]\nbinding = "FRONTBASE_R2"\nbucket_name = "${storage.config.resourceName}"\n`,{mode:0o600});
            pending=null;journal('storage_created');
        }
        if(cache.mode==='create') {
            pending='cache';journal('cache_create_started');
            const created=await runWrangler(['kv','namespace','create',cache.config.resourceName,'--binding','FRONTBASE_KV','--update-config=false'],{cwd:stage});
            if(created.code!==0)throw new Error('cache_create_failed');
            const id=created.stdout.match(/(?:"id"\s*:\s*"|\bid\s*=\s*")([a-f0-9]{32})"/)?.[1];
            if(!id)throw new Error('cache_create_identity_unknown');
            resources.cache={name:cache.config.resourceName,id,binding:'FRONTBASE_KV'};
            writeFileSync(join(stage,'wrangler.toml'),readFileSync(join(stage,'wrangler.toml'),'utf8')+`\n[[kv_namespaces]]\nbinding = "FRONTBASE_KV"\nid = "${id}"\n`,{mode:0o600});
            pending=null;journal('cache_created');
        }
        if(cache.mode==='reuse') {
            resources.cache={name:cache.config.resourceName,id:cache.resourceRef,binding:'FRONTBASE_KV'};
            writeFileSync(join(stage,'wrangler.toml'),readFileSync(join(stage,'wrangler.toml'),'utf8')+`\n[[kv_namespaces]]\nbinding = "FRONTBASE_KV"\nid = "${cache.resourceRef}"\n`,{mode:0o600});
        }
        const result=await deploy('.', {cwd:stage,target:'cloudflare',appName:context.appName,...(state.mode==='reuse'?{d1DatabaseId:state.resourceRef}:state.mode==='connect'?{externalStateConfigured:true}:{}),runWrangler:run,onSetupLink});
        if(!result.ok)throw new Error('cloudflare_deployment_failed');
        const url=new URL(result.details?.workerUrl??'');
        if(url.protocol!=='https:' || !url.hostname.startsWith(context.appName+'.') || !url.hostname.endsWith('.workers.dev') || url.username || url.password || url.search || url.hash)throw new Error('invalid_worker_url');
        pending=null;journal('succeeded');onReceipt({directory:stage,appName:context.appName,accountId:context.accountId,url:url.origin});
        return {ok:true,url:url.origin};
    } catch {
        journal('failed');onReceipt({directory:stage,appName:context.appName,accountId:context.accountId,failed:true});
        throw new Error('cloudflare_deployment_failed_resources_preserved');
    }
}
