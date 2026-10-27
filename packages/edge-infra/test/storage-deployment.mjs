import assert from 'node:assert/strict';
const {scopedDeploymentStorage}=await import(process.env.FRONTBASE_STORAGE_SCOPE_MODULE??'../dist/storage/deployment.js');
const {sigv4StorageProvider}=await import('../dist/storage/providers.js');
const data=new Map(),calls=[];let foreign=false,fail=false;
const base={
 async put(o){calls.push(['put',o.bucket,o.key]);data.set(o.bucket+'/'+o.key,o.bytes);return {key:o.key};},
 async get(bucket,key){calls.push(['get',bucket,key]);if(fail||!data.has(bucket+'/'+key))throw Error('synthetic-private-provider-detail');return {bytes:data.get(bucket+'/'+key)};},
 async delete(bucket,key){calls.push(['delete',bucket,key]);data.delete(bucket+'/'+key);},
 async signedUrl(bucket,key,ttl){calls.push(['sign-get',bucket,key,ttl]);return 'https://storage.example/'+bucket+'/'+key+'?expires='+ttl;},
 async signedUploadUrl(bucket,key,type,ttl){calls.push(['sign-put',bucket,key,ttl]);return 'https://storage.example/'+bucket+'/'+key+'?expires='+ttl;},
 async listFiles(bucket,path){calls.push(['list',bucket,path]);if(foreign)return [{id:'foreign/other.txt',name:'other.txt',isFolder:false}];return [...data.keys()].filter(k=>k.startsWith(bucket+'/'+path+'/')).map(k=>({id:k.slice(bucket.length+1),name:k.slice((bucket+'/'+path+'/').length),isFolder:false}));},
};
const factory=scopedDeploymentStorage(base,'physical-bucket','project-a'),a=factory('tenant-a'),b=factory('tenant-b'),other=scopedDeploymentStorage(base,'physical-bucket','project-b')('tenant-a');
const bytes=new TextEncoder().encode('private-a');await a.put({bucket:'files',key:'sample.txt',bytes});
assert.equal(new TextDecoder().decode((await a.get('files','sample.txt')).bytes),'private-a');
await assert.rejects(b.get('files','sample.txt'));await assert.rejects(other.get('files','sample.txt'));
await b.put({bucket:'files',key:'sample.txt',bytes:new TextEncoder().encode('private-b')});await other.put({bucket:'files',key:'sample.txt',bytes});assert.equal(data.size,3);
assert.equal((await a.listFiles('files',''))[0].id,'sample.txt');assert.equal((await a.listFiles('files',''))[0].name,'sample.txt');
const buckets=await a.listBuckets();assert.deepEqual(buckets.map(x=>x.id),['files']);assert.equal(buckets[0].public,false);assert.equal(a.publicUrl,undefined);assert.equal(factory.deploymentBinding.id,'__frontbase_deployment_s3');
for(const value of ['../escape','/absolute','folder/../escape','folder\\escape','a\nb']){const before=calls.length;await assert.rejects(a.get('files',value));assert.equal(calls.length,before);}
let before=calls.length;await assert.rejects(a.get('physical-bucket','sample.txt'));await assert.rejects(a.createBucket({name:'new'}));await assert.rejects(a.deleteBucket('files'));await assert.rejects(a.emptyBucket('files'));await assert.rejects(a.updateBucket('files',{isPublic:true}));assert.equal(calls.length,before);
before=calls.length;await assert.rejects(a.deleteFiles('files',['sample.txt','../escape']));assert.equal(calls.length,before);
const getUrl=new URL(await a.signedUrl('files','sample.txt',86400));assert.equal(getUrl.searchParams.get('expires'),'3600');assert.ok(getUrl.pathname.includes('/physical-bucket/frontbase/v1/'));await a.signedUploadUrl('files','direct.txt','text/plain',86400);assert.equal(calls.at(-1)[3],3600);await assert.rejects(a.signedUrl('files','sample.txt',Infinity));
foreign=true;await assert.rejects(a.listFiles('files',''),e=>e.message==='deployment_storage_failed');foreign=false;
fail=true;await assert.rejects(a.get('files','sample.txt'),e=>!e.message.includes('synthetic-private'));fail=false;
await a.move('files','sample.txt','moved.txt');assert.equal(new TextDecoder().decode((await a.get('files','moved.txt')).bytes),'private-a');await a.deleteFiles('files',['moved.txt']);assert.equal((await a.listFiles('files','')).length,0);
assert.throws(()=>scopedDeploymentStorage(base,'physical-bucket',''));assert.throws(()=>factory(''));
const fetches=[];const adapter=sigv4StorageProvider({endpoint:'https://storage.example',accessKeyId:'synthetic-id',secretAccessKey:'synthetic-secret',fetch:async(input)=>{const u=new URL(input);fetches.push(u);const next=u.searchParams.get('continuation-token');return new Response('<ListBucketResult><IsTruncated>'+(!next)+'</IsTruncated>'+(!next?'<NextContinuationToken>next</NextContinuationToken>':'')+'<Contents><Key>prefix/'+(next?'match.txt':'first.txt')+'</Key><Size>3</Size></Contents></ListBucketResult>');}});
assert.equal((await adapter.listFiles('physical-bucket','prefix',{limit:1,offset:1}))[0].name,'match.txt');assert.equal(fetches.length,2);assert.equal(fetches[1].searchParams.get('continuation-token'),'next');fetches.length=0;assert.equal((await adapter.listFiles('physical-bucket','prefix',{limit:1,search:'match'}))[0].name,'match.txt');assert.equal(fetches.length,2);
console.log('PASS deployment storage: selected physical bucket, project/tenant namespaces, private grants, validation-before-transfer, denied management, opaque errors and S3 pagination');
