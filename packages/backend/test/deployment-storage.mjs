import assert from 'node:assert/strict';
import {sqliteRunner,DEPLOYMENT_S3_PROVIDER_ID} from '@frontbase/edge-infra';
const {deploymentStorageFromEnv,deploymentStorageOptions}=await import(process.env.FRONTBASE_DEPLOYMENT_STORAGE_TEST_MODULE??'../dist/compat/deployment-storage.js');
import {createCompatApp} from '../dist/compat/app.js';
import {migrateUp} from '../dist/db/migrations.js';
const data=new Map(),calls=[];
const config={provider:'s3',endpoint:'https://storage.example',region:'auto',bucket:'physical-bucket',namespace:'vercel:team_fixture:profile:preview',accessKeyId:'synthetic-id',secretAccessKey:'synthetic-secret'};
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const transport=async(input,init={})=>{
 const req=new Request(input,init),url=new URL(req.url),path=decodeURIComponent(url.pathname.slice(1));calls.push({url,method:req.method});
 assert.equal(url.hostname,'storage.example');assert.ok(path.startsWith('physical-bucket/')||path==='physical-bucket'&&url.searchParams.has('list-type'),'only the configured physical bucket may be accessed');
 assert.ok(req.headers.has('authorization')||url.searchParams.has('X-Amz-Signature'),'existing SigV4 signer is used');
 if(url.searchParams.has('list-type')){const prefix=url.searchParams.get('prefix');return new Response('<ListBucketResult>'+[...data].filter(([k])=>k.startsWith('physical-bucket/'+prefix)).map(([k,v])=>'<Contents><Key>'+xml(k.slice('physical-bucket/'.length))+'</Key><Size>'+v.length+'</Size></Contents>').join('')+'</ListBucketResult>');}
 if(req.method==='PUT'){data.set(path,new Uint8Array(await req.arrayBuffer()));return new Response(null,{status:200});}
 if(req.method==='DELETE'){data.delete(path);return new Response(null,{status:204});}
 return data.has(path)?new Response(data.get(path),{headers:{'content-type':'text/plain'}}):new Response(null,{status:404});
};
assert.equal(deploymentStorageFromEnv(undefined),undefined);assert.equal(deploymentStorageFromEnv('{"provider":"none"}'),undefined);
for(const changes of [{endpoint:'https://127.0.0.1'}, {endpoint:'http://storage.example'}, {endpoint:'https://storage.example/path'}, {namespace:''}, {bucket:'../bad'}, {secretAccessKey:''}, {extra:'synthetic-forbidden'}])assert.throws(()=>deploymentStorageFromEnv(JSON.stringify({...config,...changes})),e=>e.message==='invalid_deployment_storage');
const legacy={STORAGE_ACCESS_KEY_ID:'synthetic-legacy-id',STORAGE_SECRET_ACCESS_KEY:'synthetic-legacy-secret'};assert.ok(deploymentStorageOptions(legacy).storageProvider);assert.equal(deploymentStorageOptions({...legacy,FRONTBASE_STORAGE:'{"provider":"none"}'}).storageProvider,undefined);assert.throws(()=>deploymentStorageOptions({...legacy,FRONTBASE_STORAGE:'malformed'}),/invalid_deployment_storage/);
const factory=deploymentStorageFromEnv(JSON.stringify(config),transport),runner=sqliteRunner(':memory:');await migrateUp(runner);
const app=await createCompatApp({makeRunner:()=>runner,sessionSecret:'storage-deployment-backend-test',storageProviderFor:factory,resolvePrincipal:async req=>{const tenant=req.headers.get('x-test-tenant');return ['a','b'].includes(tenant)?{user:{id:'owner-'+tenant,role:'admin'},tenant}:{user:null,tenant:''};}});
async function request(tenant,path,{method='GET',body,expected=200}={}){const response=await app.fetch(new Request('https://app.example'+path,{method,headers:{...(tenant?{'x-test-tenant':tenant}:{}),...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined}));assert.equal(response.status,expected,path+': '+await response.clone().text());return response.json();}
await request(null,'/api/storage/providers/',{expected:401});const providers=await request('a','/api/storage/providers/');assert.ok(providers.some(p=>p.id===DEPLOYMENT_S3_PROVIDER_ID&&p.provider==='s3'&&p.deployment_managed));assert.ok(!JSON.stringify(providers).includes('synthetic-secret'));const query='?provider_id='+DEPLOYMENT_S3_PROVIDER_ID;
const selectedBucket=(await request('a','/api/storage/buckets'+query)).buckets[0];assert.equal(selectedBucket.id,'files');assert.equal(selectedBucket.can_empty,false);await request('a','/api/storage/providers/'+DEPLOYMENT_S3_PROVIDER_ID,{method:'DELETE',expected:409});
const form=new FormData();form.set('provider_id',DEPLOYMENT_S3_PROVIDER_ID);form.set('bucket','files');form.set('path','sample.txt');form.set('file',new File(['private-a'],'sample.txt',{type:'text/plain'}));const upload=await request('a','/api/storage/upload',{method:'POST',body:form});assert.equal(upload.success,true);const signed=new URL(upload.publicUrl);assert.ok(signed.searchParams.has('X-Amz-Signature'));assert.equal(signed.searchParams.get('X-Amz-Expires'),'3600');assert.equal(await (await transport(signed)).text(),'private-a');
const list='/api/storage/list'+query+'&bucket=files';assert.ok((await request('a',list)).files.some(f=>f.name==='sample.txt'&&f.id==='sample.txt'));assert.equal((await request('b',list)).files.length,0);
const foreign=await request('b','/api/storage/signed-url'+query+'&bucket=files&path=sample.txt');assert.equal((await transport(foreign.signedUrl)).status,404);
const grant=await request('a','/api/storage/upload-url',{method:'POST',body:{provider_id:DEPLOYMENT_S3_PROVIDER_ID,bucket:'files',path:'direct.txt',contentType:'text/plain'}});assert.equal((await transport(grant.url,{method:grant.method,headers:grant.headers,body:'direct'})).status,200);
const own=await request('a','/api/storage/signed-url'+query+'&bucket=files&path=direct.txt');assert.equal(await (await transport(own.signedUrl)).text(),'direct');await request('a','/api/storage/signed-url?provider_id=missing&bucket=files&path=direct.txt',{expected:404});
assert.ok(calls.every(c=>c.url.pathname.startsWith('/physical-bucket/')||c.url.pathname==='/physical-bucket'&&c.url.searchParams.has('list-type')));console.log('PASS authenticated deployment S3 discovery, exact bucket, SigV4 transfer/grants and tenant isolation through existing HTTP routes');
