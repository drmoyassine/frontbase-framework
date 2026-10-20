#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { defaultDeploymentManifest } from '../packages/edge-core/dist/deployment.js';
import { assertCloudflareExecutionContext, cloudflareExecutionIssues, cloudflareExecutionCapabilities, fingerprintCloudflareArtifacts, executeCloudflareFirstInstall } from './deployment-setup/cloudflare.mjs';
import { startDeploymentSetup } from './deployment-setup/server.mjs';
export async function deploymentSetupCommand(args) {
    if(args.includes('--help')){console.log('Usage: pnpm run deploy:setup -- --target cloudflare|vercel [--environment preview|production] [--deploy --app-name NAME --account-id ACCOUNT_ID]');return;}
    const flags=args.filter(value=>value!=='--deploy');
    if(args.filter(value=>value==='--deploy').length>1)throw new Error('invalid_setup_options');
    for(let index=0;index<flags.length;index+=2)if(!['--target','--environment','--app-name','--account-id'].includes(flags[index]) || !flags[index+1] || flags[index+1].startsWith('--'))throw new Error('invalid_setup_options');
    for(const name of ['--target','--environment','--app-name','--account-id'])if(flags.filter(value=>value===name).length>1)throw new Error('invalid_setup_options');
    const option=name=>{const index=flags.indexOf(name);return index<0?undefined:flags[index+1];};
    const target=option('--target')??'cloudflare';const environment=option('--environment')??'preview';
    let execution={};
    if(args.includes('--deploy')) {
        if(target!=='cloudflare')throw new Error('execution_target_not_supported');
        const context={appName:option('--app-name'),accountId:option('--account-id'),environment,artifactHash:fingerprintCloudflareArtifacts()};
        assertCloudflareExecutionContext(context);
        const initialManifest=defaultDeploymentManifest(target,environment);
        initialManifest.bindings['state-db'].config.resourceName=`${context.appName}-db`;
        initialManifest.bindings.cache.config.resourceName=`${context.appName}-cache`;
        initialManifest.bindings.storage.config.resourceName=`${context.appName}-storage`;
        execution={initialManifest,executionCapabilities:cloudflareExecutionCapabilities,executionInfo:`Account ${context.accountId} / new Worker ${context.appName} / D1 ${context.appName}-db (new D1, optional new KV cache and private R2 storage)`,executionIssues:manifest=>cloudflareExecutionIssues(manifest,context),onDeploy:prepared=>executeCloudflareFirstInstall(prepared,context,{
            onSetupLink:link=>{console.log('Private first-administrator setup link:');console.log(link.url);},
            onReceipt:receipt=>console.log(`Local deployment receipt: ${receipt.directory}`),
        })};
    } else if(option('--app-name') || option('--account-id'))throw new Error('deployment_flag_required');
    const app=await startDeploymentSetup({target,environment,...execution,onReview:({operations})=>console.log(`Validated ${operations.length} binding(s). No provisioning or deployment performed.`)});
    console.log('Open the private local setup link (expires in 15 minutes):');
    console.log(app.url);
    const stop=()=>{void app.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
    return app;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)deploymentSetupCommand(process.argv.slice(2)).catch(()=>{console.error('Unable to start local deployment setup.');process.exitCode=1;});
