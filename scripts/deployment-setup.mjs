#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { startDeploymentSetup } from './deployment-setup/server.mjs';
export async function deploymentSetupCommand(args) {
    if(args.includes('--help')){console.log('Usage: pnpm run deploy:setup -- --target cloudflare|vercel [--environment preview|production]');return;}
    for(let index=0;index<args.length;index+=2)if(!['--target','--environment'].includes(args[index]) || !args[index+1] || args[index+1].startsWith('--'))throw new Error('invalid_setup_options');
    const option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
    const app=await startDeploymentSetup({target:option('--target')??'cloudflare',environment:option('--environment')??'preview',onReview:({operations})=>console.log(`Validated ${operations.length} binding(s). No provisioning or deployment performed.`)});
    console.log('Open the private local setup link (expires in 15 minutes):');
    console.log(app.url);
    const stop=()=>{void app.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
    return app;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)deploymentSetupCommand(process.argv.slice(2)).catch(()=>{console.error('Unable to start local deployment setup.');process.exitCode=1;});
