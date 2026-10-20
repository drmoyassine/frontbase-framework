import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const sourceUrl=new URL('./deployment-setup/server.mjs',import.meta.url);
const source=readFileSync(sourceUrl,'utf8');
const suite=fileURLToPath(new URL('./test-deployment-setup.mjs',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'frontbase-setup-fault-'));
const faults=[
 ['host binding','req.headers.host!==host','false'],
 ['mutation origin',"if(req.method==='POST' && req.headers.origin!==origin)",'if(false)'],
 ['private session','if(!session || !equal(sessionCookie(req,cookieName),session))','if(false)'],
 ['one-time claim',"session=randomBytes(32).toString('base64url');claim=undefined;","session=randomBytes(32).toString('base64url');"],
 ['request size','if(size>maxBody)','if(false)'],
 ['expiry','if(now()>=expires){clear();return reply(410', 'if(false){clear();return reply(410'],
 ['response secrecy','return reply(200,{ready:true,operations:plan.operations});','return reply(200,{ready:true,operations:plan.operations,credentials:secrets});'],
 ['one-shot handoff','const value=prepared;prepared=undefined;return value;','const value=prepared;return value;'],
];
try {
 for(const [name,before,after] of faults) {
  assert.ok(source.includes(before),name);
  const candidate=join(temp,'fault.mjs');
  const changed=source.replace(before,after)
    .replace("'../../packages/edge-core/dist/deployment.js'",JSON.stringify(new URL('../packages/edge-core/dist/deployment.js',import.meta.url).href))
    .replace('new URL(asset[0],import.meta.url)',`new URL(asset[0],${JSON.stringify(sourceUrl.href)})`);
  writeFileSync(candidate,changed);
  const result=spawnSync(process.execPath,[suite],{encoding:'utf8',timeout:15000,env:{...process.env,FRONTBASE_SETUP_TEST_MODULE:pathToFileURL(candidate).href}});
  assert.ok(result.status!==0 && result.status!==null,`fault escaped or timed out: ${name}`);
  console.log(`PASS detected: ${name}`);
 }
} finally {rmSync(temp,{recursive:true,force:true});}
console.log('Eight bootstrap security faults detected; production source unchanged');
