import assert from 'node:assert/strict';
import {deploymentSetupCommand} from './deployment-setup.mjs';
for(const args of [ ['--setup-link'],['--deploy','--target','cloudflare','--intent','redeploy','--setup-link'],['--deploy','--target','vercel','--intent','create','--setup-link'],['--deploy','--target','vercel','--intent','redeploy','--setup-link','--setup-link'] ])await assert.rejects(deploymentSetupCommand(args),/setup_link_requires_vercel_redeploy|invalid_setup_options/);
console.log('PASS setup recovery options: explicit Vercel redeploy only; duplicate and cross-target refusal before provider access');
