import assert from 'node:assert/strict';
const {deploymentStorageFromEnv}=await import(process.env.FRONTBASE_SUPABASE_STORAGE_MODULE??'../dist/compat/deployment-storage.js');
const objects=new Map(),calls=[],origin='https://fixtureproj.supabase.co',bucket='files-private';
const transport=async(input,init={})=>{const url=new URL(String(input));assert.equal(url.origin,origin);const credential=new Headers(init.headers).get('apikey');assert.ok(['server-storage-private','sb_secret_server_private'].includes(credential));assert.equal(new Headers(init.headers).get('authorization'),credential.startsWith('sb_secret_')?null:'Bearer '+credential);const method=init.method??'GET',path=decodeURIComponent(url.pathname);calls.push({path,method,body:init.body});
 if(path.includes('/object/list/')){const {prefix}=JSON.parse(init.body),entries=[...objects.keys()].filter(k=>k.startsWith(prefix+'/')).map(k=>({name:k.slice(prefix.length+1),id:'provider-uuid-not-object-path',metadata:{size:objects.get(k).length,mimetype:'text/plain'}}));return Response.json(entries);}
 if(path.includes('/object/sign/')){const key=path.split('/object/sign/'+bucket+'/')[1];if(!objects.has(key))return Response.json({error:'missing'},{status:404});assert.equal(JSON.parse(init.body).expiresIn,3600);return Response.json({signedURL:'/object/sign/'+bucket+'/'+key+'?token=signed-file-capability'});}
 if(method==='DELETE'&&path==='/storage/v1/object/'+bucket){for(const key of JSON.parse(init.body).prefixes)objects.delete(key);return Response.json({});}
 assert.ok(path.startsWith('/storage/v1/object/'+bucket+'/'));const key=path.slice(('/storage/v1/object/'+bucket+'/').length);
 if(method==='POST'){assert.equal(new Headers(init.headers).get('x-upsert'),'true');objects.set(key,typeof init.body==='string'?init.body:new TextDecoder().decode(init.body));return Response.json({Key:bucket+'/'+key});}
 if(method==='DELETE'){objects.delete(key);return Response.json({});}
 return objects.has(key)?new Response(objects.get(key),{headers:{'content-type':'text/plain'}}):new Response('missing',{status:404});
};
const config={provider:'supabase',url:origin,bucket,token:'server-storage-private',namespace:'installation-one'},factory=deploymentStorageFromEnv(JSON.stringify(config),transport);
assert.equal(factory.deploymentBinding.provider,'supabase');assert.equal(factory.deploymentBinding.supportsSignedUpload,false);
const a=factory('tenant-a'),b=factory('tenant-b'),other=deploymentStorageFromEnv(JSON.stringify({...config,namespace:'installation-two'}),transport)('tenant-a');
await a.put({bucket:'files',key:'sample.txt',bytes:new TextEncoder().encode('first')});await a.put({bucket:'files',key:'sample.txt',bytes:new TextEncoder().encode('updated')});assert.equal(new TextDecoder().decode((await a.get('files','sample.txt')).bytes),'updated');
let visible;await assert.doesNotReject(async()=>{visible=await a.listFiles('files','');},'valid Supabase UUID listings must normalize into tenant paths');assert.deepEqual(visible.map(e=>e.id),['sample.txt']);assert.deepEqual(await b.listFiles('files',''),[]);assert.deepEqual(await other.listFiles('files',''),[]);
await assert.rejects(()=>b.get('files','sample.txt'),/deployment_storage_failed/);await assert.rejects(()=>a.get(bucket,'sample.txt'),/invalid_storage_scope/);await assert.rejects(()=>a.get('files','../tenant-b/sample.txt'),/invalid_storage_key/);
const link=await a.signedUrl('files','sample.txt',99999);assert.ok(link.startsWith(origin+'/storage/v1/object/sign/'+bucket+'/frontbase/v1/'));assert.ok(!link.includes('server-storage-private'));
await assert.rejects(()=>a.signedUploadUrl('files','sample.txt'),/signed_upload_unavailable/);assert.ok(!calls.some(c=>c.path.includes('/upload/sign/')),'provider-fixed upload TTL cannot bypass deployment cap');
await assert.rejects(()=>a.deleteBucket('files'),/deployment_storage_managed/);await a.delete('files','sample.txt');assert.equal(objects.size,0);
const modern=deploymentStorageFromEnv(JSON.stringify({...config,namespace:'installation-modern',token:'sb_secret_server_private'}),transport)('tenant-a');await modern.put({bucket:'files',key:'current.txt',bytes:new TextEncoder().encode('current')});assert.equal(new TextDecoder().decode((await modern.get('files','current.txt')).bytes),'current');await modern.delete('files','current.txt');
for(const bad of [{...config,url:'https://127.0.0.1'},{...config,url:origin+'/unexpected'},{...config,token:''}])assert.throws(()=>deploymentStorageFromEnv(JSON.stringify(bad),transport),/invalid_deployment_storage/);
console.log('PASS Supabase REST deployment storage: overwrite, UUID-list normalization, installation/tenant/path isolation, capped signed reads and authenticated uploads');
