import {selectSupabaseServerKey} from './compat/providers/supabase.js';
/** Fixed-origin provider calls shared by discovery and Apply. No upstream body or secret leaves this module. */
import {json,type OAuthAuthorization} from './provider-oauth.js';
export async function providerJson(fetcher:typeof fetch,url:string,token:string,init:RequestInit={}){
 try{return await json(await fetcher(url,{...init,headers:{...(token?{authorization:'Bearer '+token}:{}),...init.headers},redirect:'manual',signal:AbortSignal.timeout(15000)}),262144);}catch{throw Error('provider_resources_unavailable');}
}
export function ownsAccount(grant:OAuthAuthorization|null|undefined,id:string){if(!grant||grant.expiresAt!==undefined&&grant.expiresAt<=Date.now()||!grant.accounts.some(a=>a.id===id))throw Error('provider_account_unavailable');return grant;}
export async function supabaseStorageKey(fetcher:typeof fetch,grant:OAuthAuthorization,projectRef:string):Promise<string>{
 ownsAccount(grant,projectRef);if(!/^[a-z0-9]{4,30}$/.test(projectRef))throw Error('provider_account_unavailable');
 const keys=await providerJson(fetcher,'https://api.supabase.com/v1/projects/'+projectRef+'/api-keys?reveal=true',grant.accessToken);
 const key=selectSupabaseServerKey(keys);if(!key||key.length>8192)throw Error('storage_server_key_unavailable');return key;
}
export async function privateSupabaseBuckets(fetcher:typeof fetch,grant:OAuthAuthorization,projectRef:string){
 const token=await supabaseStorageKey(fetcher,grant,projectRef);
 const rows=await providerJson(fetcher,'https://'+projectRef+'.supabase.co/storage/v1/bucket',token.startsWith('sb_secret_')?'':token,{headers:{apikey:token}});
 if(!Array.isArray(rows)||rows.length>1000)throw Error('provider_resources_unavailable');
 return rows.filter((r:any)=>r.public===false&&typeof r.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(r.id)&&!r.id.includes('..')).map((r:any)=>({id:r.id,name:String(r.name??r.id).slice(0,200)}));
}
export async function cloudflareResources(fetcher:typeof fetch,grant:OAuthAuthorization,accountId:string,adapterId:string){
 ownsAccount(grant,accountId);if(!/^[a-f0-9]{32}$/.test(accountId))throw Error('provider_account_unavailable');
 const kinds:Record<string,{path:string;id:string;name:string;container?:string}>={
  'cloudflare-d1':{path:'d1/database',id:'uuid',name:'name'},'d1-http':{path:'d1/database',id:'uuid',name:'name'},
  'cloudflare-kv':{path:'storage/kv/namespaces',id:'id',name:'title'},'cloudflare-r2-http':{path:'r2/buckets',id:'name',name:'name',container:'buckets'},'cloudflare-r2':{path:'r2/buckets',id:'name',name:'name',container:'buckets'},
  'cloudflare-vectorize-http':{path:'vectorize/v2/indexes',id:'name',name:'name'},'cloudflare-queue':{path:'queues',id:'queue_id',name:'queue_name'}
 };const kind=kinds[adapterId];if(!kind)throw Error('provider_adapter_unavailable');
 const result:Array<{id:string;name:string}>=[],ids=new Set<string>();let cursor='';
 for(let page=1;page<=10;page++){
  const response=await providerJson(fetcher,'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/'+kind.path+'?per_page=100'+(kind.container?(cursor?'&cursor='+encodeURIComponent(cursor):''):'&page='+page),grant.accessToken);
  const rows=kind.container?response.result?.[kind.container]:response.result;
  if(response.success!==true||!Array.isArray(rows)||rows.length>1000)throw Error('provider_resources_unavailable');
  for(const row of rows){const id=row?.[kind.id],name=row?.[kind.name];if(typeof id!=='string'||!id||id.length>160||!/^[a-zA-Z0-9_.-]+$/.test(id)||typeof name!=='string'||!name||name.length>200)throw Error('provider_resources_unavailable');if(ids.has(id))throw Error('provider_resources_unavailable');ids.add(id);result.push({id,name});}
  if(kind.container){const next=response.result_info?.cursor;if(next===undefined||next===null||next==='')return result;if(typeof next!=='string'||next.length>2048||next===cursor)throw Error('provider_resources_unavailable');cursor=next;continue;}
  const pages=Number(response.result_info?.total_pages??(rows.length===100?page+1:page));if(!Number.isSafeInteger(pages)||pages<1||pages>10)throw Error('provider_resources_limit');if(page>=pages)return result;
 }throw Error('provider_resources_limit');
}

/** Upstash's existing resource strategy is deliberately best-effort for import. Setup needs strict,
 * bounded reads: a permission failure must not look like an empty inventory or partial credentials. */
export async function upstashResources(fetcher:typeof fetch,grant:OAuthAuthorization,adapterId:string,selectedId?:string):Promise<Array<{id:string;name:string;config:Record<string,string>;credentials:Record<string,string>}>>{
 const management=grant.management;if(management)ownsAccount(grant,management.email);if(grant.provider!=='upstash'||!management||!management.email||!management.apiKey)throw Error('upstash_reconnect_required');
 const bytes=new TextEncoder().encode(management.email+':'+management.apiKey);let raw='';for(const b of bytes)raw+=String.fromCharCode(b);
 const read=(url:string)=>providerJson(fetcher,url,'',{headers:{authorization:'Basic '+btoa(raw)}});
 if(adapterId==='upstash-http'){
  const rows=await read('https://api.upstash.com/v2/redis/databases');if(!Array.isArray(rows)||rows.length>1000)throw Error('provider_resources_unavailable');
  return rows.map((row:any)=>{const id=row.database_id,name=row.database_name,url=row.rest_url,token=row.rest_token;
   if(typeof id!=='string'||!id||id.length>160||typeof name!=='string'||typeof url!=='string'||!/^https:\/\/[a-zA-Z0-9.-]+\.upstash\.io\/?$/.test(url)||typeof token!=='string'||!token)throw Error('provider_resources_unavailable');
   return {id,name,config:{url},credentials:{token}};
  });
 }
 if(adapterId==='qstash-http'){
  const rows=await read('https://api.upstash.com/v2/qstash/users');if(!Array.isArray(rows)||rows.length>100)throw Error('provider_resources_unavailable');
  const result=[];
  for(const row of rows){if(row.active!==true)continue;
   if(typeof row.id!=='string'||!row.id||row.id.length>160||!/^[a-zA-Z0-9_-]+$/.test(row.id)||typeof row.token!=='string'||!row.token||!['eu-central-1','us-east-1'].includes(row.region))throw Error('provider_resources_unavailable');
   const endpoint='https://qstash-'+row.region+'.upstash.io';let credentials:Record<string,string>={};
   if(row.id===selectedId){const keys=await providerJson(fetcher,endpoint+'/v2/keys',row.token);if(typeof keys?.current!=='string'||!keys.current||typeof keys?.next!=='string'||!keys.next)throw Error('provider_resources_unavailable');credentials={token:row.token,signingKey:keys.current,nextSigningKey:keys.next};}
   result.push({id:row.id,name:'QStash · '+row.region,config:{endpoint},credentials});
  }return result;
 }throw Error('provider_adapter_unavailable');
}
