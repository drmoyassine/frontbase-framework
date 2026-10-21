import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {randomUUID,createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const file=p=>fileURLToPath(new URL(p,import.meta.url));const operation=file('./deployment-setup/vercel-operation.mjs'),inspector=file('./deployment-setup/vercel-inspect.mjs'),receipt=file('./deployment-setup/vercel-receipt.mjs'),bridge=file('./deployment-setup/vercel.mjs');const suite=file('./test-vercel-reconciliation.mjs'),profileSuite=file('./test-vercel-profile.mjs');
const sources=new Map([operation,inspector,receipt,bridge].map(p=>[p,readFileSync(p,'utf8')]));
const faults=[
 ['operation marker',operation,'candidate.meta?.frontbaseOperation!==operation.operationId','false',suite,'FRONTBASE_VERCEL_OPERATION_TEST_MODULE'],
 ['manifest marker',operation,'candidate.meta?.frontbaseManifest!==operation.manifestDigest','false',suite,'FRONTBASE_VERCEL_OPERATION_TEST_MODULE'],
 ['candidate URL',operation,'candidate.url!==new URL(url).hostname','false',suite,'FRONTBASE_VERCEL_OPERATION_TEST_MODULE'],
 ['candidate environment',operation,"(candidate.target===null?'preview':candidate.target)!==context.environment",'false',suite,'FRONTBASE_VERCEL_OPERATION_TEST_MODULE'],
 ['candidate readiness',operation,"candidate.state!=='READY'",'false',suite,'FRONTBASE_VERCEL_OPERATION_TEST_MODULE'],
 ['unique operation',operation,'list.deployments.length!==1','false',suite,'FRONTBASE_VERCEL_OPERATION_TEST_MODULE'],
 ['normalized plan digest',operation,'context.manifestDigest!==vercelManifestDigest(manifest)','false',suite,'FRONTBASE_VERCEL_OPERATION_TEST_MODULE'],
 ['inspected project',inspector,'project.name!==context.project','false',suite,'FRONTBASE_VERCEL_INSPECT_TEST_MODULE'],
 ['canonical deployment identity',inspector,'if(canonical!==url)','if(false)',suite,'FRONTBASE_VERCEL_INSPECT_TEST_MODULE'],
 ['concurrent local edit',receipt,'if(!isDeepStrictEqual(readVercelReceipt(root,context),previous))','if(false)',suite,'FRONTBASE_VERCEL_RECEIPT_TEST_MODULE'],
 ['pending retry identity',receipt,'pending?.operationId??randomUUID()','randomUUID()',suite,'FRONTBASE_VERCEL_RECEIPT_TEST_MODULE'],
 ['marker CLI handoff',bridge,"...(operation?['--operation-id',operation.operationId,'--manifest-digest',operation.manifestDigest]:[])",'...[]',profileSuite,'FRONTBASE_VERCEL_PROFILE_TEST_MODULE'],
 ['read-only resume boundary',bridge,"if(context.intent==='resume')throw Error('resume_requires_reconciliation_command');",'',profileSuite,'FRONTBASE_VERCEL_PROFILE_TEST_MODULE'],
];
const run=(test,env={})=>spawnSync(process.execPath,[test],{encoding:'utf8',timeout:60000,env:{...process.env,...env}});for(const test of [suite,profileSuite]){const result=run(test);assert.equal(result.status,0,result.stderr);}
const candidates=[];try{
 for(const [name,source,before,after,test,variable] of faults){const original=sources.get(source);assert.equal(original.split(before).length,2,'unique anchor '+name);const candidate=join(dirname(source),'.reconcile-fault-'+randomUUID()+'.mjs');candidates.push(candidate);writeFileSync(candidate,original.replace(before,after),{flag:'wx'});const result=run(test,{[variable]:pathToFileURL(candidate).href});assert.ok(result.status!==0&&result.status!==null,'fault escaped '+name);assert.match(result.stderr,/AssertionError/,'fault must fail behavior, not loading '+name);console.log('PASS detected: '+name);unlinkSync(candidate);candidates.pop();}
 for(const [source,original]of sources)assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),createHash('sha256').update(original).digest('hex'));
 for(const test of [suite,profileSuite])assert.equal(run(test).status,0,'restored baseline');console.log('PASS thirteen independent Vercel reconciliation faults; original source bytes unchanged');
}finally{for(const candidate of candidates)unlinkSync(candidate);}
