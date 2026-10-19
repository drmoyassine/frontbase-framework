import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {libsqlRunner} from '@frontbase/edge-infra';
import {createCompatApp} from '../dist/compat/app.js';
import {migrateUp} from '../dist/db/migrations.js';
const client=createClient({url:':memory:'}),db=libsqlRunner(client);await migrateUp(db);
let tenant='alpha',role='owner',calls=[];
globalThis.fetch=()=>{throw Error('unguarded transport')};
const properties={id:{type:'integer',description:'Primary Key <pk/>'},name:{type:'string',format:'text'}};
const externalFetch=async(input,init)=>{
 const request=new Request(input,init),url=new URL(request.url),schema=request.headers.get('accept-profile');calls.push(request);
 assert.ok(['GET','HEAD'].includes(request.method));assert.equal(request.headers.get('authorization'),'Bearer PRIVATE_KEY');
 if(!['public','translations','alternate'].includes(schema))return Response.json({message:'PRIVATE_KEY'},{status:406});
 if(url.pathname==='/'||url.pathname==='/rest/v1/')return Response.json({swagger:'2.0',paths:{'/items':{get:{}}},definitions:{items:{required:['id'],properties}}});
 assert.ok(url.pathname.endsWith('/items'));return new Response(request.method==='HEAD'?null:JSON.stringify([{id:1,name:schema}]),{headers:{'content-type':'application/json','content-range':'0-0/1'}});
};
const app=await createCompatApp({makeRunner:()=>db,sessionSecret:'schema-test',externalFetch,resolvePrincipal:async()=>({tenant,user:{id:'u',role}})});
const req=(path,method='GET',body)=>app.request('/api/sync/'+path,{method,...body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}});
const body={table_name:'items',columns:'*',joins:[],filters:[],page:1,page_size:10};
const execute=(dataRequest)=>app.request('/api/data/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dataRequest})});
try{
 const created=await req('datasources/','POST',{name:'Native',type:'supabase',endpoint_format:'postgrest',schema:'translations',api_url:'https://native.example.test',service_role_key:'PRIVATE_KEY'}),ds=await created.json();assert.equal(created.status,201);
 const base='datasources/'+ds.id;
 for(const schema of ['translations','alternate']){
  let response=await req(base+'/tables/?schema='+schema);assert.equal(response.status,200);assert.deepEqual(await response.json(),['items']);
  response=await req(base+'/tables/items/data/?schema='+schema);assert.equal((await response.json()).records[0].name,schema);
  await req(base+'/tables/items/session/?schema='+schema,'POST',{filters:[schema]});
 }
 for(const schema of ['translations','alternate'])assert.deepEqual((await (await req(base+'/tables/items/session/?schema='+schema)).json()).filters,[schema]);
 await req(base+'/tables/items/session/?schema=alternate','DELETE');assert.deepEqual((await (await req(base+'/tables/items/session/?schema=translations')).json()).filters,['translations']);
 let before=calls.length;for(const schema of ['bad\nheader','a,b','x'.repeat(64),'']){const response=await req(base+'/tables/?schema='+encodeURIComponent(schema));assert.notEqual(response.status,200);}assert.equal(calls.length,before);
 let response=await req(base+'/tables/?schema=private');assert.equal(response.status,502);assert.ok(!JSON.stringify(await response.json()).includes('PRIVATE_KEY'));
 response=await req(base+'/views/','POST',{name:'Pinned',target_table:'items',source_schema:'alternate',visible_columns:['id','name']});const view=await response.json();assert.equal(response.status,201);assert.equal(view.source_schema,'alternate');
 response=await req(base+'/views/','POST',{name:'Default pinned',target_table:'items'});assert.equal((await response.json()).source_schema,'translations');
 response=await req(base+'/views/','POST',{name:'Denied',target_table:'items',source_schema:'private'});assert.equal(response.status,422);
 assert.equal((await (await req('views/'+view.id+'/')).json()).source_schema,'alternate');
 await req(base+'/','PUT',{schema:'public'});
 response=await req('views/'+view.id+'/preview/','POST',{page:1});assert.equal(response.status,200);assert.equal((await response.json()).rows[0].name,'alternate');
 response=await req('views/'+view.id+'/records/?schema=translations');assert.equal((await response.json()).records[0].name,'alternate');
 response=await req('views/'+view.id+'/','PATCH',{name:'Still pinned',expected_updated_at:view.updated_at});assert.equal(response.status,200);assert.equal((await response.json()).source_schema,'alternate');
 response=await req('views/'+view.id+'/','PATCH',{source_schema:'private'});assert.equal(response.status,422);
 const request={fetchStrategy:'proxy',datasourceId:ds.id,viewId:view.id,sourceSchema:'alternate',body};
 response=await execute(request);assert.equal(response.status,200);assert.equal((await response.json()).data[0].name,'alternate');
 before=calls.length;role='viewer';response=await execute({...request,sourceSchema:'public'});assert.equal(response.status,403);assert.equal(calls.length,before);
 response=await execute({...request,viewId:undefined});assert.equal(response.status,403);assert.equal(calls.length,before);role='owner';
 response=await req('views/'+view.id+'/records','PATCH',{id:1,name:'write'});assert.equal(response.status,422);assert.equal(calls.length,before);
 tenant='beta';response=await req(base+'/tables/?schema=alternate');assert.equal(response.status,404);assert.equal(calls.length,before);tenant='alpha';
 // Standard Supabase uses the same profile-aware HTTP implementation when selected.
 response=await req('datasources/','POST',{name:'Supabase',type:'supabase',api_url:'https://project.example.test',service_role_key:'PRIVATE_KEY'});const standard=await response.json();
 response=await req('datasources/'+standard.id+'/tables/items/data/?schema=alternate');assert.equal(response.status,200);assert.equal((await response.json()).records[0].name,'alternate');assert.ok(calls.at(-1).url.includes('/rest/v1/items'));
 console.log('datasource-schema PASS: HTTP profiles, same-table isolation, independent sessions, validated exposure, pinned views/default changes, proxy bindings, override denial, mutation refusal, tenant isolation and Supabase/native parity');
}finally{client.close();}
