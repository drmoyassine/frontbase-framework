import assert from 'node:assert/strict';
const {profileEnvironment}=await import(process.env.FRONTBASE_PROFILE_ENV_MODULE??'./deployment-setup/profile-environment.mjs');
const {defaultDeploymentManifest}=await import('../packages/edge-core/dist/deployment.js');
const manifest=defaultDeploymentManifest('vercel');manifest.bindings['state-db']={adapterId:'turso-marketplace',mode:'reuse',resourceRef:'store_fixture',config:{},secretRefs:{}};
manifest.bindings.storage={adapterId:'s3-http',mode:'connect',config:{endpoint:'https://storage.example',bucket:'selected-bucket',region:'auto'},secretRefs:{accessKeyId:'storage/id',secretAccessKey:'storage/key'}};
const credentials={'storage/id':'synthetic-id','storage/key':'synthetic-key'};
const values=profileEnvironment({manifest,credentials}),storage=JSON.parse(values.FRONTBASE_STORAGE);assert.equal(storage.bucket,'selected-bucket');assert.equal(storage.accessKeyId,'synthetic-id');assert.equal(storage.secretAccessKey,'synthetic-key');assert.ok(!values.FRONTBASE_DEPLOYMENT_MANIFEST.includes('synthetic-key'));
manifest.bindings.storage.mode='disabled';const disabled=profileEnvironment({manifest,credentials:{}});assert.deepEqual(JSON.parse(disabled.FRONTBASE_STORAGE),{provider:'none'});assert.ok(!disabled.FRONTBASE_DEPLOYMENT_MANIFEST.includes('storage/key'));assert.ok(!('STORAGE_ACCESS_KEY_ID' in disabled));
console.log('PASS selected S3 bucket lowering, private credentials, metadata cleanup and explicit disable');

const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join,resolve,basename}=await import('node:path');
const {executeManagedVercel,readVercelReceipt}=await import('./deployment-setup/vercel-receipt.mjs');
const root=mkdtempSync(join(tmpdir(),'frontbase-storage-lifecycle-')),context={project:'storage-lifecycle-'+basename(root).slice(-6).toLowerCase(),scope:'team_fixture',environment:'preview'};let inputs=[];
const options={root,run:async(args,input)=>{inputs.push(JSON.parse(input));return {code:0,stdout:'deployed to https://storage-lifecycle.vercel.app'};}};
try{
 const baseline=structuredClone(manifest);await executeManagedVercel({manifest:baseline,credentials:{}},context,options);
 const bound=structuredClone(baseline);bound.bindings.storage.mode='connect';await executeManagedVercel({manifest:bound,credentials},{...context,intent:'redeploy'},options);assert.equal(JSON.parse(inputs.at(-1).FRONTBASE_STORAGE).bucket,'selected-bucket');assert.equal(JSON.parse(inputs.at(-1).FRONTBASE_STORAGE).namespace,'vercel:team_fixture:'+context.project+':preview');assert.equal(readVercelReceipt(root,context).phase,'succeeded');
 const bad=structuredClone(bound);bad.bindings.storage.config.endpoint='https://127.0.0.1';const count=inputs.length;await assert.rejects(executeManagedVercel({manifest:bad,credentials},{...context,intent:'redeploy'},options),/invalid_deployment_storage/);assert.equal(inputs.length,count);assert.equal(readVercelReceipt(root,context).phase,'succeeded');
 await executeManagedVercel({manifest:baseline,credentials:{}},{...context,intent:'redeploy'},options);assert.deepEqual(JSON.parse(inputs.at(-1).FRONTBASE_STORAGE),{provider:'none'});assert.ok(!('SESSION_SECRET' in inputs.at(-1)));assert.ok(!('APP_DB_URL' in inputs.at(-1)));assert.equal(readVercelReceipt(root,context).manifest.bindings.storage.mode,'disabled');
 console.log('PASS managed storage add/disable and invalid-plan refusal before host writes; session/state inputs preserved');
}finally{assert.equal(resolve(root),root);assert.equal(resolve(root,'..'),resolve(tmpdir()));assert.ok(basename(root).startsWith('frontbase-storage-lifecycle-'));rmSync(root,{recursive:true,force:true});}
