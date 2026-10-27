import assert from 'node:assert/strict';
import {postgresRunner} from '@frontbase/edge-infra';
import {datasourceRunner} from '../dist/db/datasource-runner.js';
import {guardedExternalFetch} from '../dist/compat/external-http.js';
import {neonConfig} from '../../edge-infra/dist/providers/vendor/neon-client.mjs';
const savedFetch=globalThis.fetch;let rawCalls=0,count=0;
globalThis.fetch=async()=>{rawCalls++;throw Error('RAW_FETCH_FORBIDDEN');};
const dsn=owner=>`postgresql://${owner}:INVENTED@ep-${owner}.us-east-2.aws.neon.tech/${owner}`;
const reply=(rowCount=1,rows=[['42']],command='SELECT')=>Response.json({rowCount,rows,command,fields:rows.length?[{name:'answer',dataTypeID:23}]:[]});
const test=async(name,fn)=>{await fn();count++;console.log('ok - '+name);};
const chain=error=>{let text='';for(let i=0;error&&i<8;i++,error=error.cause)text+=' '+error.message;return text;};
try{
 const before=[neonConfig.fetchFunction,neonConfig.fetchEndpoint];
 await test('actual SDK .query serialization/type parsing and injected native Request',async()=>{
  const runner=datasourceRunner('neon',{connectionString:dsn('alpha')},async request=>{assert.ok(request instanceof Request);assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('Neon-Connection-String'),dsn('alpha'));const body=await request.json();assert.equal(body.query,'SELECT $1::integer AS answer');assert.deepEqual(body.params,['42']);return reply();});
  assert.deepEqual(await runner.query('SELECT $1::integer AS answer',[42]),[{answer:42}]);
 });
 await test('empty returned rows still yield exact affected count, with invalid metadata refused',async()=>{
  for(const affected of [0,1,7]){const runner=datasourceRunner('postgres',{connectionString:dsn('alpha')},async()=>reply(affected,[],'UPDATE'));assert.equal(await runner.exec('UPDATE x SET n=$1',[1]),affected);}
  for(const affected of [-1,1.5,'1',null,Number.MAX_SAFE_INTEGER+1]){const runner=datasourceRunner('neon',{connectionString:dsn('alpha')},async()=>reply(affected,[],'UPDATE'));await assert.rejects(()=>runner.exec('UPDATE x SET n=1'),/postgres_affected_rows_invalid/);}
  assert.equal(await datasourceRunner('neon',{connectionString:dsn('alpha')},async()=>reply(null,[],'CREATE')).exec('CREATE TABLE x(n int)'),0);
 });
 await test('overlapping lazy clients preserve each owner transport and connection header in either order',async()=>{
  for(const order of [['alpha','beta'],['beta','alpha']]){const calls=[];const clients=Object.fromEntries(order.map(owner=>[owner,datasourceRunner('neon',{connectionString:dsn(owner)},async request=>{assert.equal(request.headers.get('Neon-Connection-String'),dsn(owner));calls.push(owner);await Promise.resolve();return reply();})]));const pending=order.map(owner=>clients[owner].query('SELECT $1',[42]));assert.deepEqual(await Promise.all(pending),[[{answer:42}],[{answer:42}]]);assert.deepEqual(calls.sort(),['alpha','beta']);}
  assert.deepEqual([neonConfig.fetchFunction,neonConfig.fetchEndpoint],before);
 });
 await test('actual derived private endpoint is denied before injected I/O; no raw fallback',async()=>{let calls=0;await assert.rejects(()=>datasourceRunner('neon',{connectionString:'postgresql://a:p@database.internal/db'},async()=>{calls++;return reply();}).query('SELECT 1'),error=>chain(error).includes('unsafe_provider_url'));assert.equal(calls,0);});
 await test('redirect and injected denial propagate without another transport',async()=>{for(const mode of ['redirect','deny']){let calls=0;await assert.rejects(()=>datasourceRunner('neon',{connectionString:dsn('alpha')},async()=>{calls++;if(mode==='deny')throw Error('INJECTED_DENIAL');return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/'}});}).query('SELECT 1'),error=>chain(error).includes(mode==='deny'?'postgres_http_failed':'provider_redirect_rejected'));assert.equal(calls,1);}});
 await test('malformed DSNs and provider errors cannot echo credentials/SQL through .message or causes',async()=>{
  for(const connectionString of ['PRIVATE_MALFORMED_DSN',dsn('alpha')]){
   const runner=datasourceRunner('neon',{connectionString},async()=>Response.json({message:'PRIVATE_PROVIDER '+dsn('alpha')+' SELECT private_secret'},{status:400}));
   await assert.rejects(()=>runner.query('SELECT private_secret'),error=>{assert.equal(error.message,'postgres_http_failed');assert.equal(error.cause,undefined);assert.doesNotMatch(error.stack,/PRIVATE_|private_secret|postgresql:/);return true;});
  }
 });
 await test('caller cancellation reaches the same guarded Request before I/O',async()=>{let calls=0;const controller=new AbortController();controller.abort();const runner=postgresRunner({connectionString:dsn('alpha'),signal:controller.signal,fetchImpl:(input,init)=>guardedExternalFetch(async()=>{calls++;return reply();},new Request(input,init))});await assert.rejects(()=>runner.query('SELECT 1'));assert.equal(calls,0);});
 assert.equal(rawCalls,0);console.log(count+' production Neon HTTP groups passed; live credential proof remains separate');
}finally{globalThis.fetch=savedFetch;}
