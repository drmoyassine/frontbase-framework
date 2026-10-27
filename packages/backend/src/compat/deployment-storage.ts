import {scopedDeploymentStorage,sigv4StorageProvider,type StorageProviderFactory} from '@frontbase/edge-infra';
import {checkedExternalUrl,guardedExternalFetch,type CompatFetch} from './external-http.js';
/** Parse private host configuration without logging values or falling back after an explicit disable. */
export function deploymentStorageFromEnv(raw:string|undefined,externalFetch:CompatFetch=globalThis.fetch):StorageProviderFactory|undefined {
 if(raw===undefined)return undefined;
 try {
  if(raw.length>32768)throw Error();const c=JSON.parse(raw) as Record<string,unknown>;
  if(!c||typeof c!=='object'||Array.isArray(c))throw Error();
  if(c.provider==='none'){if(Object.keys(c).length!==1)throw Error();return undefined;}
  if(c.provider!=='s3'||Object.keys(c).some(key=>!['provider','endpoint','region','bucket','accessKeyId','secretAccessKey','namespace'].includes(key)))throw Error();
  for(const key of ['endpoint','bucket','accessKeyId','secretAccessKey','namespace'])if(typeof c[key]!=='string'||!c[key]||c[key].length>8192)throw Error();
  const endpoint=checkedExternalUrl(c.endpoint as string);if(endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw Error();
  const region=c.region??'auto';if(typeof region!=='string'||!/^[a-z0-9-]{1,64}$/.test(region))throw Error();
  return scopedDeploymentStorage(sigv4StorageProvider({endpoint:endpoint.origin,region,accessKeyId:c.accessKeyId as string,secretAccessKey:c.secretAccessKey as string,fetch:(input,init)=>guardedExternalFetch(externalFetch,input,init)}),c.bucket as string,c.namespace as string);
 }catch{throw Error('invalid_deployment_storage');}
}

/** Explicit managed JSON, including none, takes precedence over legacy deployment credentials. */
export function deploymentStorageOptions(env:Record<string,string|undefined>,externalFetch:CompatFetch=globalThis.fetch) {
 if(env.FRONTBASE_STORAGE!==undefined)return {storageProviderFor:deploymentStorageFromEnv(env.FRONTBASE_STORAGE,externalFetch)};
 if(env.STORAGE_ACCESS_KEY_ID&&env.STORAGE_SECRET_ACCESS_KEY)return {storageProvider:sigv4StorageProvider({accessKeyId:env.STORAGE_ACCESS_KEY_ID,secretAccessKey:env.STORAGE_SECRET_ACCESS_KEY,endpoint:env.STORAGE_ENDPOINT,region:env.STORAGE_REGION,fetch:(input,init)=>guardedExternalFetch(externalFetch,input,init)})};
 return {};
}
