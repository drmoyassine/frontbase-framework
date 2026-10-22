#!/usr/bin/env node
/** Credential-free profile CLI; never provisions or invokes a host. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { defaultDeploymentManifest, validateDeploymentManifest } from '../packages/edge-core/dist/deployment.js';

export function deploymentPlanCommand(args, read = p => readFileSync(p,'utf8')) {
    const flag=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
    if(args.includes('--defaults')) {
        const target=flag('--target');
        if(target!=='cloudflare' && target!=='vercel')return {exitCode:2,result:{error:'invalid_target'}};
        const environment=flag('--environment')??'preview';
        if(environment!=='preview' && environment!=='production')return {exitCode:2,result:{error:'invalid_environment'}};
        return {exitCode:0,result:defaultDeploymentManifest(target,environment)};
    }
    const file=flag('--validate');
    if(!file)return {exitCode:2,result:{error:'usage',usage:'--defaults --target cloudflare|vercel [--environment preview|production] OR --validate file.json'}};
    let input;try {input=JSON.parse(read(file));}catch{return {exitCode:2,result:{error:'invalid_manifest_file'}};}
    const plan=validateDeploymentManifest(input);
    // Validation never prints unvalidated input or secret reference values.
    return {exitCode:plan.ready?0:2,result:plan.ready?{ready:true,operations:plan.operations}:{ready:false,issues:plan.issues}};
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const {exitCode,result}=deploymentPlanCommand(process.argv.slice(2));
    console.log(JSON.stringify(result,null,2));process.exitCode=exitCode;
}
