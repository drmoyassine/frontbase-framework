#!/usr/bin/env node
import {discoverCloudflareResources} from './deployment-setup/cloudflare-resources.mjs';
import {executeManagedVercel,readVercelReceipt,reconcileManagedVercel} from './deployment-setup/vercel-receipt.mjs';
import {discoverVercelResources,assertVercelProfileContext,vercelExecutionCapabilities,vercelExecutionIssues} from './deployment-setup/vercel.mjs';
import {readDeploymentProposal} from './deployment-setup/proposal.mjs';
import { receiptPath, readReceipt } from './deployment-setup/receipt.mjs';
import { executeManagedCloudflare, managedExecutionIssues, reuseManifest } from './deployment-setup/cloudflare-lifecycle.mjs';
import { pathToFileURL } from 'node:url';
import { defaultDeploymentManifest } from '../packages/edge-core/dist/deployment.js';
import { nativeWrangler, assertCloudflareExecutionContext, cloudflareExecutionCapabilities, fingerprintCloudflareArtifacts } from './deployment-setup/cloudflare.mjs';
import { startDeploymentSetup } from './deployment-setup/server.mjs';
export async function deploymentSetupCommand(args,{reconcileVercel=reconcileManagedVercel}={}) {
    if(args[0]==='--')args=args.slice(1);
    if(args.includes('--help')){console.log('Usage: pnpm run deploy:setup -- --target cloudflare|vercel [--environment preview|production] [--manifest PATH] [--deploy --intent create|redeploy|resume] [Cloudflare: --app-name NAME --account-id ACCOUNT_ID] [Vercel: --project NAME --scope TEAM_ID] [--setup-link with Vercel redeploy] [--deployment canonical_URL with Vercel resume]');return;}
    const flags=args.filter(value=>!['--deploy','--setup-link'].includes(value));
    if(['--deploy','--setup-link'].some(flag=>args.filter(value=>value===flag).length>1))throw new Error('invalid_setup_options');
    for(let index=0;index<flags.length;index+=2)if(!['--target','--environment','--app-name','--account-id','--intent','--manifest','--project','--scope','--deployment'].includes(flags[index]) || !flags[index+1] || flags[index+1].startsWith('--'))throw new Error('invalid_setup_options');
    for(const name of ['--target','--environment','--app-name','--account-id','--intent','--manifest','--project','--scope','--deployment'])if(flags.filter(value=>value===name).length>1)throw new Error('invalid_setup_options');
    const option=name=>{const index=flags.indexOf(name);return index<0?undefined:flags[index+1];};
    const target=option('--target')??'cloudflare';const environment=option('--environment')??'preview';
    if(args.includes('--setup-link')&&(!args.includes('--deploy')||target!=='vercel'||option('--intent')!=='redeploy'))throw Error('setup_link_requires_vercel_redeploy');
    if(option('--deployment')&&(!args.includes('--deploy')||target!=='vercel'||option('--intent')!=='resume'))throw Error('deployment_url_requires_vercel_resume');
    if(args.includes('--deploy')&&target==='vercel'&&option('--intent')==='resume'&&(!option('--deployment')||option('--manifest')))throw Error('vercel_resume_requires_known_deployment_without_proposal');
    const proposal=option('--manifest')?readDeploymentProposal(option('--manifest'),{target,environment}):undefined;
    let execution=proposal?{initialManifest:proposal}:{};
    if(args.includes('--deploy')) {
        if(target==='vercel') {
        const context={project:option('--project'),scope:option('--scope'),environment,intent:option('--intent')??'create',setupLink:args.includes('--setup-link')};assertVercelProfileContext(context);
        if(context.intent==='resume'){const result=await reconcileVercel(context,{deployment:option('--deployment')});console.log('Verified recorded Vercel operation at '+result.url+'; no remote writes or setup renewal performed.');return result;}
        const prior=readVercelReceipt(process.cwd(),context);
        if(context.intent==='create'&&prior)throw Error('vercel_receipt_already_exists');
        if(context.intent==='redeploy'&&!prior)throw Error('vercel_receipt_required');
        const resources=discoverVercelResources(context),initialManifest=proposal??prior?.manifest??defaultDeploymentManifest(target,environment);
        if(!proposal&&!prior&&resources.length===1)initialManifest.bindings['state-db']={adapterId:'turso-marketplace',mode:'reuse',resourceRef:resources[0].id,config:{},secretRefs:{}};
        execution={initialManifest,resourceOptions:{'turso-marketplace':resources},executionCapabilities:vercelExecutionCapabilities,executionInfo:'Team '+context.scope+' / Project '+context.project+' / '+(context.intent==='create'?'first installation':(prior?.phase==='succeeded'?'preserve state/session; review cache/vector/queue/storage changes; drain pending queue deliveries first; tenant defaults remain independent':'retry the recorded plan only; reconcile the prior incomplete attempt before changing it'))+(context.setupLink?' / renew the private setup link; existing administrator remains protected':''),executionIssues:m=>vercelExecutionIssues(m,context),onDeploy:p=>executeManagedVercel(p,context,{onSetupLink:link=>console.log('Private first-administrator setup link: '+link.url)})};
        } else {
        if(target!=='cloudflare')throw new Error('execution_target_not_supported');
        const context={appName:option('--app-name'),accountId:option('--account-id'),environment,artifactHash:fingerprintCloudflareArtifacts()};
        assertCloudflareExecutionContext(context);
        const intent=option('--intent')??'create';if(!['create','redeploy','resume'].includes(intent))throw new Error('invalid_deployment_intent');
        const prior=readReceipt(receiptPath(process.cwd(),context),context);
        console.log('Local deployment journal: '+receiptPath(process.cwd(),context));
        if(intent==='create' && prior)throw new Error('managed_receipt_already_exists');
        if(intent!=='create' && !prior)throw new Error('managed_receipt_required');
        const initialManifest=proposal??(intent==='create'?defaultDeploymentManifest(target,environment):reuseManifest(prior));
        if(!proposal && intent==='create')initialManifest.bindings['state-db'].config.resourceName=`${context.appName}-db`;
        if(!proposal && intent==='create')initialManifest.bindings.cache.config.resourceName=`${context.appName}-cache`;
        if(!proposal && intent==='create')initialManifest.bindings.storage.config.resourceName=`${context.appName}-storage`;
        const executionCapabilities=intent==='create'?cloudflareExecutionCapabilities:{adapters:{...cloudflareExecutionCapabilities.adapters,'cloudflare-d1':['reuse'],'cloudflare-kv':['reuse'],'cloudflare-r2':['reuse']}};
        execution={initialManifest,credentialsMode:intent==='create'?'entry':'references',executionCapabilities,resourceOptions:intent==='create'?await discoverCloudflareResources(nativeWrangler(context.accountId),process.cwd()):undefined,executionInfo:`Account ${context.accountId} / Worker ${context.appName} / ${intent==='create'?'new managed installation; existing D1/KV must be empty and dedicated to this app':intent==='redeploy'?'reuse recorded bindings; preserve secrets':'verify the previous completed upload; no provider mutation'}`,executionIssues:manifest=>managedExecutionIssues(manifest,context,intent,prior),onDeploy:prepared=>executeManagedCloudflare(prepared,context,{
            intent,root:process.cwd(),
            onSetupLink:link=>{console.log('Private first-administrator setup link:');console.log(link.url);},
            onReceipt:receipt=>console.log(`Durable deployment receipt: ${receipt.path}`),
        })};
        }
    } else if(option('--project') || option('--scope') || option('--app-name') || option('--account-id') || option('--intent'))throw new Error('deployment_flag_required');
    const app=await startDeploymentSetup({target,environment,...execution,onReview:({operations})=>console.log(`Validated ${operations.length} binding(s). No provisioning or deployment performed.`)});
    console.log('Open the private local setup link (expires in 15 minutes):');
    console.log(app.url);
    const stop=()=>{void app.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
    return app;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)deploymentSetupCommand(process.argv.slice(2)).catch(()=>{console.error('Unable to start local deployment setup.');process.exitCode=1;});
