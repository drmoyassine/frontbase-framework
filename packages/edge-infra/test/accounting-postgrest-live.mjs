/** Disposable local PostgreSQL/PostgREST HTTP proof; never uses an owner credential/destination. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {translationPersistenceFromSupabase,translationAccountingFromSupabase} from '../dist/translation.js';
import {TranslationLifecycle,TranslationJobRunner} from '@frontbase/translation';
import {runAccountingConformance} from '../../translation/test/accounting-conformance.mjs';
const [inputPath,mode='full',receiptPath]=process.argv.slice(2);if(!inputPath)throw Error('Explicit disposable fixture configuration required');
const config=JSON.parse(await readFile(inputPath,'utf8'));const endpoint=new URL(config.endpoint);assert.equal(endpoint.hostname,'127.0.0.1');assert.equal(endpoint.protocol,'http:');assert.ok(config.disposable===true);
let calls=0;const ops=[];
// The public adapter still requires HTTPS. This injected fixture maps ONLY its two fixed RPC URLs to loopback HTTP.
// It proves real PostgREST/database transactions, not TLS or the backend SSRF guard (covered separately).
const wire=async(url,options)=>{const source=new URL(url);assert.equal(source.origin,'https://accounting.fixture.invalid');assert.ok(['/rpc/translation_request','/rpc/translation_accounting_request'].includes(source.pathname));assert.equal(options.method,'POST');assert.equal(new Headers(options.headers).get('content-profile'),'translations');const payload=JSON.parse(options.body);assert.ok(!('sql' in payload.p_input));calls++;ops.push(payload.p_operation);return fetch(new URL(source.pathname,endpoint),{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});};
const opts={url:'https://accounting.fixture.invalid',restUrl:'https://accounting.fixture.invalid',serviceKey:config.jwt,fetchImpl:wire};
const old=translationPersistenceFromSupabase(opts);let ready=false;for(let n=0;n<30;n++){try{await old.initialize();ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready,'legacy protocol ready');
if(mode==='legacy'){const missing=translationAccountingFromSupabase(opts);await assert.rejects(missing.initialize());await assert.rejects(missing.createAllowance({scope:{tenantId:'test',projectId:'test'},allowanceId:'test',policyHash:'a'.repeat(64),limitUnits:1,maxRequests:1,maxConcurrent:1}),/uninitialized/);console.log('legacy protocol PASS: v1 usable, accounting unavailable/fail-closed before explicit installation');}
else {
 const store=translationAccountingFromSupabase(opts);ready=false;for(let n=0;n<30;n++){try{await store.initialize();ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready,'accounting protocol ready');
 async function fixture(){
  const scope={tenantId:'accounting-proof-'+randomUUID(),projectId:'disposable'},unit={version:1,scope,resource:{kind:'system',componentKind:'Button',messageId:'apply'},sourceLocale:'en',format:'plain',text:'Apply',placeholders:[],segmenterVersion:1};
  const engine=new TranslationLifecycle(store),source=await engine.syncSource(scope,unit,null,{version:1,role:'button',guidance:'Apply means submit an application'});assert.equal(source.status,'created');
  const revision=extra=>({version:1,unitId:source.unitId,sourceVersion:source.sourceVersion,sourceFingerprint:source.sourceFingerprint,contextFingerprint:source.contextFingerprint,expectedHead:null,locale:'ar',text:'قدّم',revisionId:'revision',...extra});
  const intent=(jobId,extra={})=>{const{text,...rest}=revision();return {...rest,jobId,revisionId:'rev-'+jobId,providerId:'fixture',promptVersion:'v1',maxAttempts:3,...extra};};
  return {scope,unit,source,store,engine,revision,intent,leaseMs:10000,advance:ms=>new Promise(r=>setTimeout(r,ms)),close:()=>{},runner:(provider,extra={})=>new TranslationJobRunner(store,provider,{authorize:async()=>true,...extra}),provider:callback=>({id:'fixture',calls:0,async generate(input,options){this.calls++;return callback?callback(input,options):{text:'قدّم'};}})};
 }
 if(mode==='full')await runAccountingConformance(fixture);
 const f=await fixture(),hash='a'.repeat(64),allowance={scope:f.scope,allowanceId:'race',policyHash:hash,limitUnits:100,maxRequests:10,maxConcurrent:10};await store.createAllowance(allowance);
 const jobs=[];for(let n=0;n<8;n++){const id='race-'+n;assert.equal(await store.enqueueJob(f.scope,f.intent(id)),'created');jobs.push(await store.claimJob(f.scope,id,60000));}
 const keys=jobs.map(j=>({scope:f.scope,jobId:j.intent.jobId,leaseVersion:j.leaseVersion}));
 const reservations=await Promise.all(keys.map(k=>store.reserveAttempt({...k,allowanceId:'race',policyHash:hash,reservedUnits:100})));assert.equal(reservations.filter(Boolean).length,1,'actual concurrent database reservations must not overspend');
 const winner=keys[reservations.indexOf(true)],dispatch=await Promise.all(Array.from({length:8},()=>store.dispatchAttempt(winner)));assert.equal(dispatch.filter(Boolean).length,1,'actual concurrent dispatch exactly one grant');
 assert.equal(await store.releaseAttempt(winner),false,'sent request cannot be refunded');assert.ok((await Promise.all(Array.from({length:8},()=>store.settleAttempt(winner,25)))).every(Boolean));assert.equal(await store.settleAttempt(winner,0),false);assert.equal((await store.readAttempt(winner)).chargedUnits,25);
 assert.equal(await store.readAttempt({...winner,scope:{...f.scope,tenantId:'foreign'}}),null,'actual SQL attempt owner predicate');
 if(mode==='full'){
  assert.equal(await store.enqueueJob(f.scope,f.intent('rollback')),'created');const j=await store.claimJob(f.scope,'rollback',60000),key={scope:f.scope,jobId:'rollback',leaseVersion:j.leaseVersion};assert.equal(await store.reserveAttempt({...key,allowanceId:'race',policyHash:hash,reservedUnits:50}),true);await assert.rejects(store.dispatchAttempt(key));assert.equal((await store.readAttempt(key)).state,'reserved');assert.equal((await store.readJob(f.scope,'rollback')).dispatched,false,'attempt failure rolls back prior job dispatch');
  const raw=async(operation,owner,input)=>fetch(new URL('/rpc/translation_accounting_request',endpoint),{method:'POST',headers:{authorization:'Bearer '+config.jwt,'content-type':'application/json','content-profile':'translations'},body:JSON.stringify({p_operation:operation,p_scope:owner,p_input:input})});
  for(const [op,owner,input] of [['reserve',f.scope,{...winner,scope:undefined,allowanceId:'race',policyHash:hash,reservedUnits:0}],['settle',f.scope,{jobId:'x',leaseVersion:1,chargedUnits:-1}],['read-allowance',f.scope,{allowanceId:'race',sql:'forbidden'}],['read-allowance',{...f.scope,tenantId:null},{allowanceId:'race'}],['create-allowance',f.scope,{allowance:{...allowance,scope:{...f.scope,projectId:'foreign'}}}]]){const response=await raw(op,owner,input);assert.equal(response.status,400,'raw SQL contract rejects malformed/foreign nested inputs');}
  const anonymous=await fetch(new URL('/rpc/translation_accounting_request',endpoint),{method:'POST',headers:{'content-type':'application/json','content-profile':'translations'},body:JSON.stringify({p_operation:'capabilities',p_scope:f.scope,p_input:{}})});assert.ok([401,403,404].includes(anonymous.status));
 }
 console.log('real PostgREST accounting PASS: '+mode+' shared contract, eight-way reservation/dispatch races, settled costs, owner isolation'+(mode==='full'?', strict SQL inputs/anonymous denial and forced atomic rollback':''));
}
if(receiptPath)await writeFile(receiptPath,JSON.stringify({mode,realPostgres:true,realPostgrest:true,transport:'disposable loopback HTTP through injected fixed-HTTPS test origin',runtimeTCP:false,calls,operations:[...new Set(ops)],ownerDestinationTouched:false,realAI:false},null,2)+'\n');
