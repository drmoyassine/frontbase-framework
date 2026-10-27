import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dockerBootstrapJournal} from './deployment-setup/docker-bootstrap-journal.mjs';
import {defaultDeploymentManifest} from '../packages/edge-core/dist/deployment.js';
import {reviewBootstrap,applyBootstrap,reconcileBootstrap} from '../packages/edge-core/dist/deployment-bootstrap.js';
const root=mkdtempSync(join(tmpdir(),'fb-bootstrap-journal-'));
const c={installationId:'11111111-2222-4333-8444-555555555555',target:'docker',destination:'fixture/container'};
const manifest=defaultDeploymentManifest('docker');manifest.bindings['state-db']={adapterId:'libsql-http',mode:'connect',config:{url:'https://db.example'},secretRefs:{token:'db/token'}};
let proof=null,calls=0;const executor={preflight:async()=>{},apply:async r=>{calls++;proof={operationId:r.operationId,fingerprint:r.fingerprint,healthy:true,bootstrapDisabled:true};throw Error('lost response');},inspect:async()=>proof};
try{
 assert.throws(()=>dockerBootstrapJournal('./relative'));
 const a=dockerBootstrapJournal(root),review=await reviewBootstrap(c,manifest,a,executor);
 const b=dockerBootstrapJournal(root);assert.deepEqual(await b.read(c),review);
 const results=await Promise.allSettled([applyBootstrap(c,review.operationId,{'db/token':'fixture-only-secret'},a,executor),applyBootstrap(c,review.operationId,{'db/token':'fixture-only-secret'},b,executor)]);
 assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const restarted=dockerBootstrapJournal(root);assert.equal((await restarted.read(c)).phase,'uncertain');
 assert.equal((await reconcileBootstrap(c,restarted,executor)).phase,'active');assert.equal(calls,1);
 const name=readdirSync(root).find(n=>n.endsWith('.json'));mkdirSync(join(root,name+'.lock'));
 await assert.rejects(restarted.compareAndSwap(c,3,{...(await restarted.read(c)),revision:4}),/locked/);
 console.log('PASS persistent Docker journal: restart, competing claims, no redispatch on recovery, stale-lock refusal');
}finally{rmSync(root,{recursive:true,force:true});}
