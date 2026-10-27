import assert from 'node:assert/strict';
import {createStorageClientResolver,storageHttpTransport} from '../dist/compat/routes/storage.js';
const saved=globalThis.fetch;let raw=0,calls=0;globalThis.fetch=async()=>{raw++;throw Error('RAW_STORAGE_FORBIDDEN')};
try{
 const transport=storageHttpTransport(async request=>{calls++;assert.ok(request instanceof Request);assert.equal(request.method,'PUT');assert.equal(request.headers.get('Authorization'),'Bearer invented');assert.equal(await request.text(),'bytes');assert.equal(request.redirect,'manual');return new Response(null,{status:204});});
 await transport(new Request('https://storage.example.test/object',{method:'PUT',headers:{Authorization:'Bearer invented'},body:'bytes'}));assert.equal(calls,1);
 const privateRequest=new Request('https://127.0.0.1/object',{method:'PUT',body:'private'});await assert.rejects(()=>transport(privateRequest),/unsafe_provider_url/);assert.equal(privateRequest.bodyUsed,false);assert.equal(calls,1);
 const requests=[],files=new Map(),account={api_token:'CF_INVENTED',account_id:'a'.repeat(32)};
 const {resolveManaged:resolver}=createStorageClientResolver({phase2For:owner=>{assert.equal(owner,'alpha');return{getEdgeResourceConfig:async()=>account}},kvFor:()=>({getJson:async()=>[{id:'connected-r2',provider:'cloudflare',provider_account_id:'cf-account'}]}),externalFetch:async(input,init)=>{
  const request=input instanceof Request?input:new Request(input,init);requests.push({method:request.method,url:request.url});
  if(request.url==='https://api.cloudflare.com/client/v4/user/tokens/verify'){assert.equal(request.headers.get('authorization'),'Bearer CF_INVENTED');return Response.json({result:{id:'token-fixture'}});}
  assert.equal(new URL(request.url).hostname,'a'.repeat(32)+'.r2.cloudflarestorage.com');assert.match(request.headers.get('authorization'),/^AWS4-HMAC-SHA256/);const key=new URL(request.url).pathname;
  if(request.method==='PUT'){files.set(key,await request.arrayBuffer());return new Response(null,{status:200});}
  if(request.method==='DELETE'){files.delete(key);return new Response(null,{status:204});}
  return files.has(key)?new Response(files.get(key),{headers:{'Content-Type':'text/plain'}}):new Response(null,{status:404});
 }});
 const resolved=await resolver('alpha','connected-r2');assert.ok(resolved.client,JSON.stringify(resolved));const client=resolved.client;
 await client.put({bucket:'fixture',key:'one.txt',bytes:new TextEncoder().encode('round trip'),contentType:'text/plain'});assert.equal(new TextDecoder().decode((await client.get('fixture','one.txt')).bytes),'round trip');await client.delete('fixture','one.txt');await assert.rejects(()=>client.get('fixture','one.txt'));assert.equal(requests.length,5);assert.equal(raw,0);
 account.account_id='evil.example/path';assert.equal((await resolver('alpha','connected-r2')).status,400);assert.equal(requests.length,5);
 const supabaseAccount={api_url:'https://project.supabase.test',service_role_key:'SUPABASE_INVENTED'},supabaseCalls=[];
 const supabase=createStorageClientResolver({phase2For:()=>({getEdgeResourceConfig:async()=>supabaseAccount}),kvFor:()=>({getJson:async()=>[{id:'sb',provider:'supabase',provider_account_id:'sb-account'}]}),externalFetch:async(input,init)=>{
  const request=input instanceof Request?input:new Request(input,init);supabaseCalls.push(request);assert.equal(request.headers.get('authorization'),'Bearer SUPABASE_INVENTED');assert.equal(request.headers.get('apikey'),'SUPABASE_INVENTED');assert.equal(request.redirect,'manual');
  if(request.url.endsWith('/bucket'))return Response.json([{id:'fixture',name:'fixture',public:false}]);
  if(request.method==='POST'){assert.equal(await request.text(),'supabase bytes');return Response.json({Key:'fixture/one.txt'});}
  if(request.method==='DELETE'){assert.deepEqual(await request.json(),{prefixes:['one.txt']});return Response.json({});}
  return new Response('supabase bytes',{headers:{'Content-Type':'text/plain'}});
 }});
 const resolvedSupabase=await supabase.resolveManaged('alpha','sb');assert.ok(resolvedSupabase.client);const sb=resolvedSupabase.client;assert.equal((await sb.listBuckets())[0].name,'fixture');await sb.put({bucket:'fixture',key:'one.txt',bytes:new TextEncoder().encode('supabase bytes')});assert.equal(new TextDecoder().decode((await sb.get('fixture','one.txt')).bytes),'supabase bytes');await sb.delete('fixture','one.txt');assert.equal(supabaseCalls.length,4);
 supabaseAccount.api_url='https://127.0.0.1';assert.equal((await supabase.resolveManaged('alpha','sb')).status,400);assert.equal(supabaseCalls.length,4);assert.equal(raw,0);
 console.log('storage-http-transport: Request/private refusal; connected CF R2 verify→SigV4 transfer and Supabase authenticated metadata/byte transfer through injected transport PASS');
}finally{globalThis.fetch=saved;}
