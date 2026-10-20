import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const source=readFileSync(new URL('./vercel-deployment-policy.mjs',import.meta.url),'utf8');
const suite=fileURLToPath(new URL('./test-vercel-deployment-policy.mjs',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'frontbase-vercel-policy-'));
const faults=[
 ['first-project preview refusal','history.deployments.length===0','false'],
 ['actual deployment target','deployment?.target!==environment','false'],
 ['actual deployment team','deployment?.contextName!==teamSlug','false'],
 ['integration resource identity','resource?.id!==resourceRef','false'],
 ['integration environment membership','p.environments.includes(environment)','true'],
 ['implicit install intent','if (firstInstall === redeploy)', 'if (false)'],
 ['implicit secret rotation','if (env.SESSION_SECRET && !rotateSession)', 'if (false)'],
 ['linked team mismatch','link.orgId !== scope','false'],
 ['unverified environment writes','    assertVercelTarget(target);','    // verification removed'],
 ['failed update continuation','if (result.code !== 0)', 'if (false)'],
];
try {
 for(const [name,before,after] of faults) {
  assert.ok(source.includes(before),name);
  const candidate=join(temp,'fault.mjs');
  const changed=source.replace(before,after).replace("'./deploy-environment.mjs'",JSON.stringify(new URL('./deploy-environment.mjs',import.meta.url).href));
  writeFileSync(candidate,changed);
  const result=spawnSync(process.execPath,[suite],{encoding:'utf8',env:{...process.env,FRONTBASE_VERCEL_POLICY_TEST_MODULE:pathToFileURL(candidate).href}});
  assert.ok(result.status!==0 && result.status!==null,`fault escaped: ${name}`);
  console.log(`PASS detected: ${name}`);
 }
} finally {rmSync(temp,{recursive:true,force:true});}
console.log('Ten Vercel policy faults detected; production source unchanged');
