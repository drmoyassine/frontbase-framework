import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {libsqlRunner} from '@frontbase/edge-infra';
import {createCompatApp} from '../dist/compat/app.js';
import {migrateUp} from '../dist/db/migrations.js';
const client=createClient({url:':memory:'}),db=libsqlRunner(client);await migrateUp(db);
globalThis.fetch=()=>{throw Error('raw_fetch_forbidden')};
let tenant='alpha',authenticated=true,role='owner',mode='ok',calls=[];
const properties={id:{type:'integer',format:'integer',description:'Primary Key <pk/>'},name:{type:'string',format:'text'},owner_id:{type:'integer',description:"<fk table='owners' column='id'/>"}};
const document={swagger:'2.0',paths:{'/items':{get:{}},'/owners':{get:{}},'/empty':{get:{}},'/rpc/health':{get:{}}},definitions:{items:{required:['id'],properties},owners:{properties:{id:properties.id,name:properties.name}},empty:{properties:{id:properties.id}}}};
const data=[{id:1,name:'Alpha',owner_id:1},{id:2,name:'Beta',owner_id:1},{id:3,name:'Alpha',owner_id:1}];
const externalFetch=async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url);calls.push(request);
    assert.ok(['GET','HEAD'].includes(request.method));assert.equal(request.headers.get('accept-profile'),'translations');assert.equal(request.headers.get('authorization'),'Bearer PRIVATE_KEY');assert.ok(!url.pathname.includes('/rpc/'),'Inspector must not call SQL RPCs');
    if(url.pathname==='/')return Response.json(document);
    if(mode==='error')return Response.json({message:'PRIVATE_KEY'},{status:400});
    if(mode==='oversize')return Response.json(data,{headers:{'content-length':String(8*1024*1024+1)}});
    if(mode==='stream')return Response.json([...data,{id:4,name:'x'.repeat(8*1024*1024)}],{headers:{'content-range':'0-3/4'}});
    assert.ok(['/items','/owners'].includes(url.pathname));assert.ok(request.headers.get('prefer').includes('count=exact'));
    let rows=url.pathname==='/owners'?[{id:1,name:'Owner',private_note:'DO_NOT_SEND'}]:[...data],filter=url.searchParams.get('or');
    if(filter){if(filter.includes('name.'))rows=rows.filter(row=>row.name==='Alpha');else assert.equal(url.pathname,'/owners');}
    if(url.searchParams.get('order')==='name.desc')rows.sort((a,b)=>b.name.localeCompare(a.name));
    const total=rows.length,offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);rows=rows.slice(offset,offset+limit);
    return new Response(request.method==='HEAD'?null:JSON.stringify(rows),{headers:{'content-type':'application/json',...(mode==='no-count'?{}:{'content-range':`${offset}-${offset+rows.length-1}/${total}`})}});
};
const app=await createCompatApp({makeRunner:()=>db,sessionSecret:'inspector-secret',externalFetch,resolvePrincipal:async()=>({tenant,user:authenticated?{id:'owner',role}:null})});
const req=(path,method='GET',body)=>app.request('/api/sync/'+path,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
try{
 const created=await req('datasources/','POST',{name:'Native',type:'supabase',api_url:'https://native.example.test',service_role_key:'PRIVATE_KEY',endpoint_format:'postgrest',schema:'translations'}),ds=await created.json();assert.equal(created.status,201);const base='datasources/'+ds.id;
 let response=await req(base+'/tables/');assert.equal(response.status,200);assert.deepEqual(await response.json(),['empty','items','owners']);
 response=await req(base+'/tables/items/schema/');const schema=await response.json();assert.equal(schema.columns[0].primary_key,true);assert.equal(schema.columns[0].nullable,false);assert.equal(schema.foreign_keys[0].referenced_table,'owners');
 response=await req(base+'/relationships/');assert.equal((await response.json()).relationships[0].source_column,'owner_id');
 response=await req(base+'/tables/items/data/?limit=2&offset=0');let result=await response.json();assert.equal(response.status,200);assert.equal(result.total,3);assert.equal(result.records.length,2);assert.equal(result.has_more,true);
 response=await req(base+'/tables/items/data/?limit=2&offset=2');result=await response.json();assert.equal(result.records[0].id,3);assert.equal(result.has_more,false);
 response=await req(base+'/tables/items/data/?filters='+encodeURIComponent(JSON.stringify([{field:'name',operator:'eq',value:'Alpha'}])));result=await response.json();assert.equal(result.total,2);assert.ok(calls.at(-1).url.includes('or='));
 response=await req(base+'/tables/items/data/?sort=name&order=desc');assert.equal((await response.json()).records[0].name,'Beta');
 response=await req(base+'/search?q=Alpha');assert.equal((await response.json()).matches.length,2);
 for(const suffix of ['/tables/missing/schema/','/tables/items/data/?sort=bad','/tables/items/data/?offset=-1','/tables/items/data/?filters='+encodeURIComponent(JSON.stringify([{field:'missing',operator:'eq',value:1}]))]){response=await req(base+suffix);assert.equal(response.status,400);assert.ok(!JSON.stringify(await response.json()).includes('PRIVATE_KEY'));}
 response=await req(base+'/tables/items/fields/');assert.equal(response.status,200);assert.ok((await response.json()).fields.some(field=>field.path==='owners.name'));
 const viewResponse=await req(base+'/views/','POST',{name:'Alpha only',target_table:'items',visible_columns:['id','name'],filters:[{field:'name',operator:'eq',value:'Alpha'}]});const view=await viewResponse.json();assert.equal(viewResponse.status,201);
 const relatedResponse=await app.request('/api/data/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dataRequest:{fetchStrategy:'proxy',datasourceId:ds.id,viewId:view.id,body:{table_name:'items',columns:'*',joins:[],filters:[],page:1,page_size:10,related_fields:['owners.name']}}})});assert.equal(relatedResponse.status,200);const related=await relatedResponse.json();assert.equal(related.data[0]['owners.name'],'Owner');assert.ok(!JSON.stringify(related).includes('DO_NOT_SEND'));assert.ok(calls.some(request=>new URL(request.url).pathname==='/owners'&&new URL(request.url).searchParams.get('select')==='id,name'));
 response=await req('views/'+view.id+'/records/');result=await response.json();assert.equal(result.total_records,2);assert.equal(result.records.length,2);
 response=await req('views/'+view.id+'/count');assert.equal((await response.json()).total_records,2);
 response=await req('views/'+view.id+'/preview/','POST',{page:1});assert.equal((await response.json()).rows.length,2);
 for(mode of ['error','oversize','stream','no-count']){response=await req(base+'/tables/items/data/');assert.equal(response.status,400);assert.ok(!JSON.stringify(await response.json()).includes('PRIVATE_KEY'));}mode='ok';
 let before=calls.length;tenant='beta';assert.equal((await req(base+'/tables/')).status,404);assert.equal((await req('views/'+view.id+'/records/')).status,404);tenant='alpha';authenticated=false;assert.equal((await req(base+'/tables/')).status,401);authenticated=true;assert.equal(calls.length,before);
 console.log('postgrest-inspector PASS: actual metadata/table/schema/FK, rows/exact count/pagination/filter/sort, saved view read/count/preview, bounds/redaction and tenant/auth; GET/HEAD only, zero SQL RPCs');
}finally{client.close();}
