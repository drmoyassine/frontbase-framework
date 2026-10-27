import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { libsqlRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { testPostgrestConnection } from '../dist/compat/postgrest-connection-test.js';
import { datasourceRunner } from '../dist/db/datasource-runner.js';

globalThis.fetch = () => { throw Error('RAW_FETCH_FORBIDDEN'); };
const client=createClient({url:':memory:'}), db=libsqlRunner(client); await migrateUp(db);
let calls=[],tenant='alpha',authenticated=true,role='owner',mode='ok';
const metadata={swagger:'2.0',paths:{'/items':{get:{}}}};
const externalFetch=async(input,init)=>{
    const request=new Request(input,init); calls.push(request);
    if(mode==='throw')throw Error('PRIVATE_KEY');
    if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://127.0.0.1'}});
    if(mode==='denied')return new Response('PRIVATE_KEY',{status:401});
    if(mode==='permission')return new Response('PRIVATE_KEY',{status:403});
    if(mode==='missing')return new Response('PRIVATE_KEY',{status:404});
    if(mode==='schema')return Response.json({code:'PGRST106',message:'PRIVATE_KEY'},{status:406});
    if(mode==='declared')return Response.json(metadata,{headers:{'content-length':String(8*1024*1024+1)}});
    if(mode==='stream')return Response.json({...metadata,padding:'x'.repeat(8*1024*1024+1)});
    if(mode==='html')return new Response('<html>PRIVATE_KEY</html>');
    if(mode==='invalid')return Response.json({paths:[]});
    return request.method==='POST'?Response.json([{result:[{n:1}]}]):Response.json(metadata);
};
const app=await createCompatApp({makeRunner:()=>db,sessionSecret:'postgrest-fixture',externalFetch,resolvePrincipal:async()=>({tenant,user:authenticated?{id:'owner',role}:null})});
const req=(path,method='GET',body)=>app.request('/api/sync/datasources/'+path,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
const native={api_url:'https://native.example.test',service_role_key:'PRIVATE_KEY',endpoint_format:'postgrest',schema:'translations'};
try {
    let response=await req('','POST',{name:'Native',type:'supabase',...native}); assert.equal(response.status,201);
    const saved=await response.json(), id=saved.id;
    assert.deepEqual(saved.extra_config,{endpoint_format:'postgrest',schema:'translations'}); assert.ok(!JSON.stringify(saved).includes('PRIVATE_KEY')); assert.equal(calls.length,0,'native create must not bootstrap SQL');
    response=await req(id+'/test/','POST'); assert.equal((await response.json()).success,true);
    let last=calls.at(-1); assert.equal(last.url,'https://native.example.test/'); assert.equal(last.method,'GET'); assert.equal(last.body,null); assert.equal(last.redirect,'manual'); assert.equal(last.headers.get('accept-profile'),'translations'); assert.equal(last.headers.get('authorization'),'Bearer PRIVATE_KEY');
    response=await req(id+'/test-update/','POST',{type:'supabase',api_url:'',service_role_key:'',schema:'catalog',endpoint_format:'postgrest'}); assert.equal((await response.json()).success,true); assert.equal(calls.at(-1).headers.get('accept-profile'),'catalog'); assert.equal(calls.at(-1).headers.get('authorization'),'Bearer PRIVATE_KEY');
    assert.equal((await (await req(id+'/')).json()).extra_config.schema,'translations','test updates must not persist');
    response=await req(id+'/','PUT',{type:'supabase',schema:'catalog',endpoint_format:'postgrest',api_url:'',service_role_key:''}); assert.equal(response.status,200); assert.equal((await response.json()).extra_config.schema,'catalog');
    await req(id+'/test/','POST'); assert.equal(calls.at(-1).headers.get('accept-profile'),'catalog'); assert.equal(calls.at(-1).headers.get('authorization'),'Bearer PRIVATE_KEY');
    response=await req('test-raw/','POST',{type:'supabase',api_url:'https://supa.example.test',service_role_key:'sb_secret_fixture'}); assert.equal((await response.json()).success,true);last=calls.at(-1); assert.equal(last.url,'https://supa.example.test/rest/v1/');assert.equal(last.headers.get('accept-profile'),'public');assert.equal(last.headers.get('apikey'),'sb_secret_fixture');assert.equal(last.headers.get('authorization'),null);
    for(const invalid of [{schema:'bad\r\nheader'}, {endpoint_format:'guess'}]){response=await req(id+'/','PUT',invalid);assert.equal(response.status,422);}
    const before=calls.length; tenant='beta';assert.equal((await req(id+'/test/','POST')).status,404);assert.equal((await req(id+'/','PUT',{schema:'other'})).status,404);tenant='alpha';authenticated=false;assert.equal((await req(id+'/test/','POST')).status,401);authenticated=true;role='viewer';assert.equal((await req(id+'/test/','POST')).status,403);role='owner';assert.equal(calls.length,before);
    for(const input of [{...native,api_url:'https://127.0.0.1'},{...native,api_url:'http://native.example.test'},{...native,endpoint_format:'guess'},{...native,schema:'bad\nheader'}])assert.equal((await testPostgrestConnection(input,externalFetch)).success,false);assert.equal(calls.length,before,'invalid/private inputs must not reach network');
    for(mode of ['throw','redirect','denied','permission','missing','schema','declared','stream','html','invalid']){const result=await testPostgrestConnection(native,externalFetch);assert.equal(result.success,false,mode);assert.ok(!JSON.stringify(result).includes('PRIVATE_KEY'),mode);}
    mode='ok';const runner=datasourceRunner('supabase',native,externalFetch);const rows=await runner.query('SELECT 1');assert.equal(rows[0].n,1);assert.equal(calls.at(-1).url,'https://native.example.test/rpc/execute_query');assert.equal(calls.at(-1).headers.get('content-profile'),'translations');
    console.log('postgrest-connection PASS: explicit endpoints/schema, bounded read-only probe, blank-key retention, config round-trip, tenant/auth/SSRF/redirect/redaction, shared runner propagation; no bootstrap SQL');
} finally { client.close(); }
