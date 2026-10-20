#!/usr/bin/env node
import { receiptPath, readReceipt } from './deployment-setup/receipt.mjs';
import { executeManagedCloudflare, managedExecutionIssues, reuseManifest } from './deployment-setup/cloudflare-lifecycle.mjs';
import { pathToFileURL } from 'node:url';
import { defaultDeploymentManifest } from '../packages/edge-core/dist/deployment.js';
import { assertCloudflareExecutionContext, cloudflareExecutionCapabilities, fingerprintCloudflareArtifacts } from './deployment-setup/cloudflare.mjs';
import { startDeploymentSetup } from './deployment-setup/server.mjs';
export async function deploymentSetupCommand(args) {
    if(args.includes('--help')){console.log('Usage: pnpm run deploy:setup -- --target cloudflare|vercel [--environment preview|production] [--deploy --app-name NAME --account-id ACCOUNT_ID --intent create|redeploy|resume]');return;}
    const flags=args.filter(value=>value!=='--deploy');
    if(args.filter(value=>value==='--deploy').length>1)throw new Error('invalid_setup_options');
    for(let index=0;index<flags.length;index+=2)if(!['--target','--environment','--app-name','--account-id','--intent'].includes(flags[index]) || !flags[index+1] || flags[index+1].startsWith('--'))throw new Error('invalid_setup_options');
    for(const name of ['--target','--environment','--app-name','--account-id','--intent'])if(flags.filter(value=>value===name).length>1)throw new Error('invalid_setup_options');
    const option=name=>{const index=flags.indexOf(name);return index<0?undefined:flags[index+1];};
    const target=option('--target')??'cloudflare';const environment=option('--environment')??'preview';
    let execution={};
    if(args.includes('--deploy')) {
        if(target!=='cloudflare')throw new Error('execution_target_not_supported');
        const context={appName:option('--app-name'),accountId:option('--account-id'),environment,artifactHash:fingerprintCloudflareArtifacts()};
        assertCloudflareExecutionContext(context);
        const intent=option('--intent')??'create';if(!['create','redeploy','resume'].includes(intent))throw new Error('invalid_deployment_intent');
        const prior=readReceipt(receiptPath(process.cwd(),context),context);
        console.log('Local deployment journal: '+receiptPath(process.cwd(),context));
        if(intent==='create' && prior)throw new Error('managed_receipt_already_exists');
        if(intent!=='create' && !prior)throw new Error('managed_receipt_required');
        const initialManifest=intent==='create'?defaultDeploymentManifest(target,environment):reuseManifest(prior);
        initialManifest.bindings['state-db'].config.resourceName=`${context.appName}-db`;
        initialManifest.bindings.cache.config.resourceName=`${context.appName}-cache`;
        initialManifest.bindings.storage.config.resourceName=`${context.appName}-storage`;
        const executionCapabilities=intent==='create'?cloudflareExecutionCapabilities:{adapters:{'cloudflare-d1':['reuse'],'cloudflare-kv':['reuse'],'cloudflare-r2':['reuse']}};
        execution={initialManifest,executionCapabilities,executionInfo:`Account ${context.accountId} / Worker ${context.appName} / ${intent==='create'?'new managed installation':intent==='redeploy'?'reuse recorded bindings; preserve secrets':'verify the previous completed upload; no provider mutation'}`,executionIssues:manifest=>managedExecutionIssues(manifest,context,intent,prior),onDeploy:prepared=>executeManagedCloudflare(prepared,context,{
            intent,root:process.cwd(),
            onSetupLink:link=>{console.log('Private first-administrator setup link:');console.log(link.url);},
            onReceipt:receipt=>console.log(`Durable deployment receipt: ${receipt.path}`),
        })};
    } else if(option('--app-name') || option('--account-id') || option('--intent'))throw new Error('deployment_flag_required');
    const app=await startDeploymentSetup({target,environment,...execution,onReview:({operations})=>console.log(`Validated ${operations.length} binding(s). No provisioning or deployment performed.`)});
    console.log('Open the private local setup link (expires in 15 minutes):');
    console.log(app.url);
    const stop=()=>{void app.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
    return app;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)deploymentSetupCommand(process.argv.slice(2)).catch(()=>{console.error('Unable to start local deployment setup.');process.exitCode=1;});
