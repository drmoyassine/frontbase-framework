import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readDeploymentProposal} from './deployment-setup/proposal.mjs';
import {defaultDeploymentManifest} from '../packages/edge-core/dist/deployment.js';
const dir=mkdtempSync(join(tmpdir(),'frontbase-proposal-')),file=join(dir,'proposal.json'),scope={target:'cloudflare',environment:'preview'};
try {const manifest=defaultDeploymentManifest('cloudflare');writeFileSync(file,JSON.stringify(manifest));assert.deepEqual(readDeploymentProposal(file,scope),manifest);
assert.throws(()=>readDeploymentProposal(file,{...scope,target:'vercel'}));assert.throws(()=>readDeploymentProposal(file,{...scope,environment:'production'}));
manifest.credentials={token:'synthetic-not-echoed'};writeFileSync(file,JSON.stringify(manifest));assert.throws(()=>readDeploymentProposal(file,scope),e=>!e.message.includes('synthetic-not-echoed'));
writeFileSync(file,' '.repeat(32769));assert.throws(()=>readDeploymentProposal(file,scope));assert.throws(()=>readDeploymentProposal(dir,scope));
console.log('PASS bounded data-only proposal handoff: scope, size, credential payload and directory refusal');
} finally {rmSync(dir,{recursive:true,force:true});}
