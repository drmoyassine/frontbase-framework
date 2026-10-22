import type {StorageProvider,StorageProviderFactory,FileEntry} from './providers.js';
export const DEPLOYMENT_S3_PROVIDER_ID='__frontbase_deployment_s3';
const encoder=new TextEncoder();
const segment=(value:string):string=>{let binary='';for(const byte of encoder.encode(value))binary+=String.fromCharCode(byte);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
/** Trusted host wrapper: one existing physical bucket, private logical files per tenant.
 * The supplied HTTP adapter owns signing and transport; no raw adapter escapes this factory. */
export function scopedDeploymentStorage(base:StorageProvider,physicalBucket:string,namespace:string):StorageProviderFactory {
 if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(physicalBucket)||physicalBucket.includes('..'))throw Error('invalid_deployment_storage');
 if(!namespace||namespace.length>256||/[\x00-\x1f]/.test(namespace))throw Error('invalid_deployment_storage');
 const factory:StorageProviderFactory=(tenant:string)=>{
  if(!tenant||tenant.length>256||/[\x00-\x1f]/.test(tenant))throw Error('invalid_storage_scope');
  const prefix='frontbase/v1/'+segment(namespace)+'/'+segment(tenant)+'/files/';
  function scope(bucket:string):void {if(bucket!=='files')throw Error('invalid_storage_scope');}
  function key(bucket:string,value:string):string {
   scope(bucket);
   if(!value||value.startsWith('/')||value.includes('\\')||/[\x00-\x1f]/.test(value)||value.split('/').some(p=>p==='.'||p==='..')||encoder.encode(prefix+value).length>1024)throw Error('invalid_storage_key');
   return prefix+value;
  }
  const safe=async<T>(work:()=>Promise<T>):Promise<T>=>{try{return await work();}catch{throw Error('deployment_storage_failed');}};
  const denied=async():Promise<never>=>{throw Error('deployment_storage_managed');};
  const expiry=(seconds=900):number=>{if(!Number.isSafeInteger(seconds)||seconds<1)throw Error('invalid_storage_expiry');return Math.min(seconds,3600);};
  const provider:StorageProvider={
   async put(opts){const physical=key(opts.bucket,opts.key);return safe(async()=>{await base.put({...opts,bucket:physicalBucket,key:physical});return {key:opts.key};});},
   async get(bucket,value){const physical=key(bucket,value);return safe(()=>base.get(physicalBucket,physical));},
   async delete(bucket,value){const physical=key(bucket,value);return safe(()=>base.delete(physicalBucket,physical));},
   async signedUrl(bucket,value,seconds){const physical=key(bucket,value),ttl=expiry(seconds);return safe(()=>base.signedUrl(physicalBucket,physical,ttl));},
   async signedUploadUrl(bucket,value,type,seconds){const physical=key(bucket,value),ttl=expiry(seconds);return safe(()=>base.signedUploadUrl(physicalBucket,physical,type,ttl));},
   async listBuckets(){return [{id:'files',name:'files',public:false,deployment_managed:true,can_empty:false,max_signed_url_expiry:3600}];},
   async getBucket(bucket){scope(bucket);return {id:'files',name:'files',public:false,deployment_managed:true,can_empty:false};},
   createBucket:denied,updateBucket:denied,deleteBucket:denied,emptyBucket:denied,
   async listFiles(bucket,path,options){
    scope(bucket);const directory=path?key(bucket,path).replace(/\/$/,''):prefix.replace(/\/$/,'');
    return safe(async()=>{
     if(!base.listFiles)throw Error('listing_not_supported');
     const entries=await base.listFiles(physicalBucket,directory,options);
     return entries.map((entry):FileEntry=>{
      if(typeof entry.id!=='string'||!entry.id.startsWith(prefix))throw Error('invalid_storage_listing');
      const relative=entry.id.slice(prefix.length);key(bucket,relative);
      if(!entry.name||entry.name.includes('/')||entry.name.includes('\\')||/[\x00-\x1f]/.test(entry.name))throw Error('invalid_storage_listing');
      return {...entry,id:relative};
     });
    });
   },
   async createFolder(bucket,path){const value=key(bucket,path.replace(/\/$/,''))+'/.folder';return safe(async()=>{await base.put({bucket:physicalBucket,key:value,bytes:new Uint8Array(0),contentType:'application/x-directory'});});},
   async deleteFiles(bucket,paths){if(paths.length>1000)throw Error('invalid_storage_batch');const keys=paths.map(path=>key(bucket,path));return safe(async()=>{for(const value of keys)await base.delete(physicalBucket,value);});},
   async move(bucket,source,destination){const from=key(bucket,source),to=key(bucket,destination);return safe(async()=>{const object=await base.get(physicalBucket,from);await base.put({bucket:physicalBucket,key:to,...object});await base.delete(physicalBucket,from);});},
  };
  return provider;
 };
 factory.deploymentBinding={id:DEPLOYMENT_S3_PROVIDER_ID,name:'S3-compatible (deployment)',provider:'s3',maxSignedUrlExpiry:3600};
 return factory;
}
