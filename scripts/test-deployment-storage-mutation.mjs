import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const file=relative=>fileURLToPath(new URL(relative,import.meta.url));
const scope=file('../packages/edge-infra/src/storage/deployment.ts'),backend=file('../packages/backend/src/compat/deployment-storage.ts'),profile=file('./deployment-setup/profile-environment.mjs'),vercel=file('./deployment-setup/vercel.mjs');
const infraSuite=file('../packages/edge-infra/test/storage-deployment.mjs'),backendSuite=file('../packages/backend/test/deployment-storage.mjs'),profileSuite=file('./test-deployment-storage-profile.mjs'),vercelSuite=file('./test-vercel-profile.mjs');
const sources=new Map([scope,backend,profile,vercel].map(p=>[p,readFileSync(p,'utf8')]));
const faults=[
 ['project namespace',scope,"segment(namespace)+'/'+segment(tenant)","segment('shared')+'/'+segment(tenant)",infraSuite,'FRONTBASE_STORAGE_SCOPE_MODULE'],
 ['tenant namespace',scope,'segment(tenant)',"segment('shared')",infraSuite,'FRONTBASE_STORAGE_SCOPE_MODULE'],
 ['logical bucket fence',scope,"if(bucket!=='files')",'if(false)',infraSuite,'FRONTBASE_STORAGE_SCOPE_MODULE'],
 ['path traversal fence',scope,"value.split('/').some(p=>p==='.'||p==='..')",'false',infraSuite,'FRONTBASE_STORAGE_SCOPE_MODULE'],
 ['grant expiry cap',scope,'Math.min(seconds,3600)','seconds',infraSuite,'FRONTBASE_STORAGE_SCOPE_MODULE'],
 ['physical management refusal',scope,"throw Error('deployment_storage_managed');","return undefined as never;",infraSuite,'FRONTBASE_STORAGE_SCOPE_MODULE'],
 ['opaque provider errors',scope,"catch{throw Error('deployment_storage_failed');}",'catch(error){throw error;}',infraSuite,'FRONTBASE_STORAGE_SCOPE_MODULE'],
 ['private endpoint fence',backend,'checkedExternalUrl(c.endpoint as string)','new URL(c.endpoint as string)',backendSuite,'FRONTBASE_DEPLOYMENT_STORAGE_TEST_MODULE'],
 ['explicit disable precedence',backend,'if(env.FRONTBASE_STORAGE!==undefined)',`if(env.FRONTBASE_STORAGE!==undefined&&env.FRONTBASE_STORAGE!=='{"provider":"none"}')`,backendSuite,'FRONTBASE_DEPLOYMENT_STORAGE_TEST_MODULE'],
 ['selected bucket handoff',profile,'bucket:c.bucket',"bucket:'wrong-bucket'",profileSuite,'FRONTBASE_PROFILE_ENV_MODULE'],
 ['exact Vercel namespace',vercel,"storage.namespace='vercel:'+context.scope+':'+context.project+':'+context.environment","storage.namespace='shared'",vercelSuite,'FRONTBASE_VERCEL_PROFILE_TEST_MODULE'],
];
const run=(suite,env={})=>spawnSync(process.execPath,[suite],{encoding:'utf8',timeout:60000,env:{...process.env,...env}});
for(const suite of new Set(faults.map(f=>f[4]))){const r=run(suite);assert.equal(r.status,0,r.stderr);}
const candidates=[];
try{
 for(const [name,source,before,after,suite,variable] of faults){const original=sources.get(source);assert.equal(original.split(before).length,2,'unique source anchor '+name);let changed=original.replace(before,after);const typed=source.endsWith('.ts');if(typed)changed=ts.transpileModule(changed,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const directory=typed?source.replace('/src/','/dist/').replace('\\src\\','\\dist\\'):source;const candidate=join(dirname(directory),'.storage-fault-'+randomUUID()+'.mjs');candidates.push(candidate);writeFileSync(candidate,changed,{flag:'wx'});const result=run(suite,{[variable]:pathToFileURL(candidate).href});assert.ok(result.status!==0&&result.status!==null,'fault escaped '+name);assert.match(result.stderr,/AssertionError|deployment_storage_failed|invalid_deployment_storage/,'fault must fail behavior, not imports '+name);console.log('PASS detected: '+name);unlinkSync(candidate);candidates.pop();}
 for(const [source,original]of sources)assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),createHash('sha256').update(original).digest('hex'));
 for(const suite of new Set(faults.map(f=>f[4])))assert.equal(run(suite).status,0,'restored baseline');
 console.log('PASS eleven independent deployment-storage source faults; original bytes unchanged');
}finally{for(const candidate of candidates)unlinkSync(candidate);}
