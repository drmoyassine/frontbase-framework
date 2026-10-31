import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const file=fileURLToPath(new URL('../dist/vercel-native-integration.js',import.meta.url)),original=readFileSync(file,'utf8');
const cases=[
 ['team-bound grant','result.team_id !== c.team','false'],
 ['configuration-bound code','result.installation_id !== c.configuration','false'],
 ['integration identity','configuration.integrationId !== client.clientId','false'],
 ['project access','!configuration.projects.includes(c.project)','false'],
 ['fresh project','now() - p.createdAt > 1200000','false'],
 ['production target',"deployment.target !== 'production'",'false'],
 ['canonical alias','!deployment.alias.includes(u.hostname)','false'],
 ['zero-state runtime',"if (native.target !== 'vercel')",'if (false)'],
 ['same-origin POST',"c.req.header('origin') !== deps.origin",'false'],
 ['single continuation cookie','values.length !== 1','values.length === 0'],
 ['consume before writes','!await deps.vault.take(pendingKey(value), raw)','false'],
 ['durable project claim','!await deps.claimInstallation(target, await proof(registrationKey))','false'],
 ['OAuth state binding','stored.context.subject !== value.subject','false'],
];
for(const[label,before,after]of cases){assert.equal(original.split(before).length,2,label+' anchor');const variant=fileURLToPath(new URL('../dist/.native-vercel-fault-'+randomUUID()+'.js',import.meta.url));try{writeFileSync(variant,original.replace(before,after));const result=spawnSync(process.execPath,[fileURLToPath(new URL('./vercel-native-integration.mjs',import.meta.url))],{encoding:'utf8',timeout:45000,env:{...process.env,FRONTBASE_VERCEL_NATIVE_TEST_MODULE:pathToFileURL(variant).href}});assert.notEqual(result.status,0,label+' survived');assert.match(result.stdout+result.stderr,/AssertionError/,label+' missed behavioral assertion');console.log('PASS detected Vercel native '+label);}finally{unlinkSync(variant);}assert.equal(readFileSync(file,'utf8'),original);}
console.log('PASS thirteen Vercel initial-integration faults; original artifacts unchanged');
