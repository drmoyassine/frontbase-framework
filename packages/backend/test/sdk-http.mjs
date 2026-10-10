import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const originalFetch = globalThis.fetch;
let rawCalls = 0;
globalThis.fetch = async () => { rawCalls++; throw new Error('SDK_RAW_FALLBACK'); };
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const causes = error => { let text=''; for(let i=0;error && i<8;i++,error=error.cause) text+=' '+String(error.message); return text; };
const rejects = (fn, marker) => assert.rejects(fn, error => causes(error).includes(marker));
try {
 const { guardedExternalFetch } = await import('../dist/compat/external-http.js');
 const { vectorAdapterFromConfig } = await import('../dist/compat/system-services.js');
 const { datasourceRunner } = await import('../dist/db/datasource-runner.js');
 const guard = transport => (input,init) => guardedExternalFetch(transport,input,init);
 const result = (rows=[],cols=[]) => ({ cols: cols.map(name=>({name,decltype:'TEXT'})), rows, affected_row_count:1, last_insert_rowid:null });
 const hrana = (request,extra={}) => json({ baton:null, base_url:null, ...extra, results: request.requests.map(item => ({type:'ok',response: item.type==='execute' ? {type:'execute', result:result([[{type:'integer',value:'7'}]],['n'])} : item.type==='batch' ? {type:'batch',result:{step_results:item.batch.steps.map(()=>result()),step_errors:item.batch.steps.map(()=>null)}} : {type:item.type} })) });
 test('vector Request POST auth body crosses injected guard', async()=>{
  const calls=[];
  const transport=async(input,init)=>{
   assert.ok(input instanceof Request); assert.equal(init,undefined);
   assert.equal(input.method,'POST'); assert.equal(input.headers.get('authorization'),'Bearer vector-test-key');
   assert.equal(input.redirect,'manual'); const body=await input.json(); calls.push(body);
   assert.equal(new URL(input.url).hostname,'vector.example'); return hrana(body);
  };
  const adapter=vectorAdapterFromConfig({provider:'turso',url:'libsql://vector.example',token:'vector-test-key'},guard(transport),()=>{});
  try { await adapter.ping(); assert.equal(calls.length,1); assert.equal(calls[0].requests[0].stmt.sql,'SELECT 1'); }
  finally {await adapter.close();}
 });
 test('libsql datasource normalizes HTTPS and returns nonempty rows', async()=>{
  let calls=0;
  const db=datasourceRunner('turso',{url:'libsql://db.example',authToken:'db-test-key'},async input=>{
   calls++; assert.ok(input instanceof Request); assert.equal(input.method,'POST'); assert.equal(input.headers.get('authorization'),'Bearer db-test-key');
   assert.equal(input.url,'https://db.example/v2/pipeline'); return hrana(await input.json());
  });
  const rows=await db.query('SELECT 7 AS n'); assert.equal(Number(rows[0].n),7); assert.equal(calls,1);
 });
 test('private vector URL never reaches any transport', async()=>{
  let calls=0;
  const adapter=vectorAdapterFromConfig({provider:'turso',url:'https://127.0.0.1:9443'},guard(async()=>{calls++;throw new Error('FORBIDDEN_TRANSPORT');}),()=>{});
  try {await rejects(()=>adapter.ping(),'unsafe_provider_url'); assert.equal(calls,0);} finally {await adapter.close();}
 });
 test('private datasource URL never reaches any transport', async()=>{
  let calls=0; const transport=async()=>{calls++;throw new Error('FORBIDDEN_TRANSPORT');};
  for(const kind of ['supabase','turso']) { const db=datasourceRunner(kind,{url:'https://127.0.0.1:9443',serviceKey:'secret-test',authToken:'secret-test'},transport); await rejects(()=>db.query('SELECT 1'),'unsafe_provider_url'); }
  assert.equal(calls,0);
 });
 test('Supabase RPC query and exec preserve keys schema SQL and result', async()=>{
  const seen=[]; const db=datasourceRunner('supabase',{url:'https://project.example',serviceKey:'sb_secret_test',schema:'catalog'},async(input,init)=>{
   const req=new Request(input,init); assert.equal(req.method,'POST'); assert.equal(req.headers.get('apikey'),'sb_secret_test'); assert.equal(req.headers.get('authorization'),null);
   assert.equal(req.headers.get('content-profile'),'catalog'); assert.equal(req.redirect,'manual'); const body=await req.json(); seen.push(body);
   return json([{result:req.url.endsWith('/execute_query') ? [{name:'USA'}] : 3}]);
  });
  assert.deepEqual(await db.query('SELECT $1 AS name',['USA']),[{name:'USA'}]); assert.equal(await db.exec('UPDATE programs SET flag=$1',[true]),3);
  assert.equal(seen[0].query_sql,"SELECT 'USA' AS name"); assert.equal(seen[1].query_sql,'UPDATE programs SET flag=TRUE');
 });
 test('Supabase legacy key and JWT bearer contexts retained', async()=>{
  for(const [key,jwt,expected] of [['legacy-key',undefined,'legacy-key'],['sb_publishable_test','user-jwt','user-jwt']]) {
   const db=datasourceRunner('supabase',{url:'https://project.example',serviceKey:key,jwt},async(input,init)=>{
    const req=new Request(input,init); assert.equal(req.headers.get('apikey'),key); assert.equal(req.headers.get('authorization'),'Bearer '+expected); return json([{result:[{n:1}]}]);
   }); assert.equal((await db.query('SELECT 1'))[0].n,1);
  }
 });
 test('SDK redirect response cannot forward credentials', async()=>{
  for(const kind of ['supabase','turso']) {
   let calls=0; const db=datasourceRunner(kind,{url:'https://db.example',serviceKey:'key',authToken:'key'},async(input,init)=>{
    calls++; assert.equal(new Request(input,init).redirect,'manual'); return new Response(null,{status:307,headers:{location:'https://127.0.0.1/private'}});
   }); await rejects(()=>db.query('SELECT 1'),'provider_redirect_rejected'); assert.equal(calls,1);
  }
 });
 test('unsupported remote libsql transports refused before fallback', async()=>{
  let calls=0; const transport=async()=>{calls++;throw new Error('FORBIDDEN_TRANSPORT');};
  for(const url of ['ws://db.example','wss://db.example','http://db.example','libsql://db.example:8443?tls=0']) {
   assert.throws(()=>datasourceRunner('turso',{url},transport),/unsupported_guarded_libsql_transport/);
   assert.throws(()=>vectorAdapterFromConfig({provider:'turso',url},guard(transport),()=>{}),/unsupported_guarded_libsql_transport|URL_INVALID/);
  }
  assert.equal(calls,0);
 });
 test('explicit injected denial never falls back', async()=>{
  for(const kind of ['supabase','turso']) {
   const db=datasourceRunner(kind,{url:'https://db.example',serviceKey:'synthetic-key'},async()=>{throw new Error('OWNER_EGRESS_DENIED');});
   await rejects(()=>db.query('SELECT 1'),'OWNER_EGRESS_DENIED');
  }
 });
 test('parallel per-owner transports and keys never mix', async()=>{
  const calls=[];
  const make=owner=>datasourceRunner('supabase',{url:'https://'+owner+'.example',serviceKey:'sb_secret_'+owner},async(input,init)=>{
   await new Promise(resolve=>setImmediate(resolve)); const req=new Request(input,init);
   assert.equal(new URL(req.url).hostname,owner+'.example'); assert.equal(req.headers.get('apikey'),'sb_secret_'+owner); calls.push(owner); return json([{result:[{owner}]}]);
  });
  const a=make('a'),b=make('b'); const results=await Promise.all([a.query('SELECT 1'),b.query('SELECT 1'),a.query('SELECT 2'),b.query('SELECT 2')]);
  assert.deepEqual(results.map(rows=>rows[0].owner),['a','b','a','b']); assert.equal(calls.length,4);
 });
 test('D1 REST query and exec use injected owner transport', async()=>{
  let calls=0; const db=datasourceRunner('d1',{accountId:'owner',databaseId:'db',apiToken:'d1-key'},async(input,init)=>{
   calls++; const req=new Request(input,init); assert.equal(req.headers.get('authorization'),'Bearer d1-key'); assert.equal(req.method,'POST'); assert.equal(req.redirect,'manual');
   return json({success:true,result:[{results:[{n:1}],meta:{changes:{count:2}}}]});
  }); assert.deepEqual(await db.query('SELECT 1'),[{n:1}]); assert.equal(await db.exec('UPDATE x SET a=1'),2); assert.equal(calls,2);
 });
 test('trusted native memory datasource and vector stay local', async()=>{
  const db=datasourceRunner('sqlite',{url:':memory:'},async()=>{throw new Error('NATIVE_MUST_NOT_USE_HTTP');}); assert.equal((await db.query('SELECT 7 AS n'))[0].n,7);
  const adapter=vectorAdapterFromConfig({provider:'libsql',url:':memory:'},guard(async()=>{throw new Error('NATIVE_MUST_NOT_USE_HTTP');}),()=>{});
  try {await adapter.ping();} finally {await adapter.close();}
 });
 test('HRANA response baseUrl is rechecked on next stream request', async()=>{
  const requireInfra=createRequire(new URL('../../edge-infra/package.json',import.meta.url));
  const {createClient}=requireInfra('@libsql/client');
  const {libsqlHttpConfig}=await import('../../edge-infra/dist/providers/libsql-http.js');
  let calls=0;
  const client=createClient(libsqlHttpConfig('https://db.example','key',guard(async input=>{
   calls++; const body=await input.json(); return hrana(body,{baton:'stream-baton',base_url:'https://127.0.0.1:9443/'});
  })));
  let tx;
  try {tx=await client.transaction('write'); await tx.execute('SELECT 1'); await rejects(()=>tx.execute('SELECT 7'),'unsafe_provider_url'); assert.equal(calls,1);}
  finally {tx?.close(); client.close();}
 });
 test('actual sync and database routes use owned injected SDK transport', async()=>{
  const {sqliteRunner}=await import('@frontbase/edge-infra');
  const {migrateUp}=await import('../dist/db/migrations.js');
  const {createCompatApp}=await import('../dist/compat/app.js');
  const control=sqliteRunner(':memory:'); await migrateUp(control); let calls=0;
  const app=await createCompatApp({makeRunner:async()=>control,sessionSecret:'sdk-offline-session-key',
   resolvePrincipal:async req=>({user:{id:'owner-'+(req.headers.get('x-owner')||'a'),role:'owner'},tenant:req.headers.get('x-owner')||'a'}),
   externalFetch:async(input,init)=>{calls++;const req=new Request(input,init);assert.equal(req.headers.get('apikey'),'sb_secret_route_a');
    const body=await req.json();assert.ok(body.query_sql);return json([{result:[{name:'institutions',table_name:'institutions'}]}]);}
  });
  const request=async(owner,method,path,body)=>app.fetch(new Request('https://admin.example'+path,{method,headers:{'x-owner':owner,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));
  const created=await request('a','POST','/api/sync/datasources/',{name:'Synthetic catalog',type:'supabase',url:'https://route.example',service_role_key:'sb_secret_route_a'});
  assert.equal(created.status,201);const source=await created.json();assert.ok(source.id);assert.equal(calls,0);
  for(const path of [`/api/sync/datasources/${source.id}/tables/`,'/api/database/tables/']) {const res=await request('a','GET',path);assert.equal(res.status,200);assert.match(await res.text(),/institutions/);}
  const before=calls;assert.ok(before>=2);
  const wrongOwner=await request('b','GET',`/api/sync/datasources/${source.id}/tables/`);assert.equal(wrongOwner.status,404);assert.equal(calls,before);
  const raw=await request('a','POST','/api/sync/datasources/test-raw/',{type:'supabase',url:'https://127.0.0.1:9443',service_role_key:'never-send-this'});
  const failure=await raw.json();assert.equal(failure.success,false);assert.equal(calls,before);assert.doesNotMatch(JSON.stringify(failure),/never-send-this/);
 });
 test('vector probe route retains SDK Request semantics for all operations', async()=>{
  const {sqliteRunner}=await import('@frontbase/edge-infra');const {migrateUp}=await import('../dist/db/migrations.js');const {createCompatApp}=await import('../dist/compat/app.js');
  const control=sqliteRunner(':memory:');await migrateUp(control);let calls=0;const statements=[];
  const app=await createCompatApp({makeRunner:async()=>control,sessionSecret:'sdk-vector-route-key',resolvePrincipal:async()=>({user:{id:'owner-a',role:'owner'},tenant:'a'}),
   externalFetch:async(input,init)=>{calls++;assert.ok(input instanceof Request);assert.equal(input.method,'POST');const body=await input.json();statements.push(...body.requests);return hrana(body);}
  });
  const res=await app.fetch(new Request('https://admin.example/api/edge-vectors/test-connection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'turso',vector_url:'libsql://vector.example',token:'synthetic-route-key'})}));
  assert.equal(res.status,200);const body=await res.json();assert.equal(body.success,true,JSON.stringify(body));assert.ok(calls>=4);
  assert.ok(statements.some(item=>item.type==='execute'&&item.stmt.sql.startsWith('CREATE TABLE')));assert.ok(statements.some(item=>item.type==='batch'));
 });
 let failed=0;
 for(const [name,fn] of tests) { try {await fn(); console.log('PASS '+name);} catch(error) {failed++;console.error('FAIL '+name+'\n'+error.stack);} }
 assert.equal(rawCalls,0,'no SDK raw/global transport calls');
 console.log(`SDK HTTP: ${tests.length-failed} passed, ${failed} failed; raw global calls ${rawCalls}`);
 if(failed) process.exitCode=1;
} finally { globalThis.fetch=originalFetch; }
