/** Native private R2 storage. No Cloudflare account token or S3 credential. */
import type { StorageProvider, FileEntry } from './providers.js';
export const NATIVE_R2_PROVIDER_ID = '__frontbase_native_r2';
export const NATIVE_R2_ACCESS_PATH = '/_frontbase/storage/object';
export interface R2ObjectBinding {
    key:string;size:number;uploaded?:Date;httpMetadata?:{contentType?:string};arrayBuffer():Promise<ArrayBuffer>;
}
export interface R2BucketBinding {
    put(key:string,value:Uint8Array,options?:{httpMetadata?:{contentType?:string}}):Promise<unknown>;
    get(key:string):Promise<R2ObjectBinding|null>;
    delete(key:string|string[]):Promise<void>;
    list(options:{prefix:string;delimiter?:string;cursor?:string;limit?:number}):Promise<{objects:Array<{key:string;size:number;uploaded?:Date;httpMetadata?:{contentType?:string}}>;delimitedPrefixes:string[];truncated:boolean;cursor?:string}>;
}
const encoder=new TextEncoder();
const b64=(bytes:Uint8Array):string=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
const unb64=(s:string):Uint8Array=>{if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('invalid_capability');return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));};
const segment=(value:string):string=>b64(encoder.encode(value));
const mime=(value:string):string=>{if(!value || value.length>256 || /[\r\n\x00]/.test(value))throw Error('invalid_content_type');return value;};
interface Access {v:1;tenant:string;bucket:string;key:string;origin:string;method:'GET'|'PUT';iat:number;exp:number;contentType?:string;}
/** Trusted host factory. Authenticated callers supply tenant; public requests only redeem signed scope. */
export function createNativeR2Storage(rawBinding:R2BucketBinding,secret:string,{now=Date.now,maxBytes=10*1024*1024}:{now?:()=>number;maxBytes?:number}={}) {
    if(!secret || !Number.isSafeInteger(maxBytes) || maxBytes<1 || maxBytes>100*1024*1024)throw Error('invalid_native_storage_config');
    const shield=async<T>(work:()=>Promise<T>):Promise<T>=>{try{return await work();}catch{throw Error('native_storage_failed');}};
    const binding:R2BucketBinding={
        get:key=>shield(()=>rawBinding.get(key)),
        put:(key,value,options)=>shield(()=>rawBinding.put(key,value,options)),
        delete:keys=>shield(()=>rawBinding.delete(keys)),
        list:options=>shield(()=>rawBinding.list(options)),
    };
    // Domain separation: these two-part capabilities cannot be replayed as session JWTs.
    const cryptoKey=crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
    const signedBytes=(payload:string)=>encoder.encode('frontbase:r2-access:v1\0'+payload);
    function prefix(tenant:string,bucket:string):string {
        if(!tenant || tenant.length>256 || /[\x00-\x1f]/.test(tenant) || bucket!=='files')throw Error('invalid_storage_scope');
        return 'frontbase/v1/'+segment(tenant)+'/'+segment(bucket)+'/';
    }
    function objectKey(tenant:string,bucket:string,key:string):string {
        const p=prefix(tenant,bucket);
        if(!key || key.startsWith('/') || key.includes('\\') || /[\x00-\x1f]/.test(key) || key.split('/').some(x=>x==='.'||x==='..') || encoder.encode(p+key).length>1024)throw Error('invalid_object_key');
        return p+key;
    }
    async function sign(access:Access):Promise<string>{const payload=b64(encoder.encode(JSON.stringify(access)));const sig=new Uint8Array(await crypto.subtle.sign('HMAC',await cryptoKey,signedBytes(payload)));return payload+'.'+b64(sig);}
    async function verify(token:string):Promise<Access|null>{
        try {
            if(token.length>8192)return null;const parts=token.split('.');if(parts.length!==2)return null;
            const [payload,signature]=parts;if(!payload||!signature)return null;const valid=await crypto.subtle.verify('HMAC',await cryptoKey,unb64(signature) as BufferSource,signedBytes(payload));if(!valid)return null;
            const a=JSON.parse(new TextDecoder().decode(unb64(payload))) as Access;const seconds=Math.floor(now()/1000);
            if(a.v!==1 || !['GET','PUT'].includes(a.method) || !Number.isSafeInteger(a.iat) || !Number.isSafeInteger(a.exp) || a.iat>seconds+5 || a.exp<=seconds || a.exp<=a.iat || a.exp-a.iat>3600 || typeof a.origin!=='string' || typeof a.tenant!=='string' || typeof a.bucket!=='string' || typeof a.key!=='string')return null;
            objectKey(a.tenant,a.bucket,a.key);if(a.method==='PUT')mime(a.contentType??'');return a;
        }catch{return null;}
    }
    const denied=(status=403)=>new Response(status===413?'payload_too_large':'storage_access_denied',{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
    async function boundedBody(request:Request):Promise<Uint8Array>{
        const header=request.headers.get('content-length');if(header && (!/^\d+$/.test(header)||Number(header)>maxBytes))throw Error('payload_too_large');
        const reader=request.body?.getReader();if(!reader)return new Uint8Array();let length=0;const chunks:Uint8Array[]=[];
        try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>maxBytes)throw Error('payload_too_large');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
    }
    function providerFor(tenant:string,request?:Request):StorageProvider {
        prefix(tenant,'files');
        const signed=async(bucket:string,key:string,method:'GET'|'PUT',ttl=900,contentType?:string)=>{
            objectKey(tenant,bucket,key);if(!request)throw Error('storage_request_required');const origin=new URL(request.url).origin;
            if(!/^https?:$/.test(new URL(origin).protocol) || !Number.isFinite(ttl) || ttl<1)throw Error('invalid_storage_access');
            const iat=Math.floor(now()/1000),exp=iat+Math.min(3600,Math.max(1,Math.floor(ttl)));
            return origin+NATIVE_R2_ACCESS_PATH+'?token='+await sign({v:1,tenant,bucket,key,origin,method,iat,exp,...(method==='PUT'?{contentType:mime(contentType??'application/octet-stream')}:{})});
        };
        const deletePrefix=async(p:string):Promise<void>=>{for(let page=0;page<32;page++){const listed=await binding.list({prefix:p,limit:1000});if(!listed.objects.length)return;await binding.delete(listed.objects.map(object=>object.key));if(!listed.truncated)return;}throw Error('storage_delete_limit');};
        const get=async(bucket:string,key:string)=>{const object=await binding.get(objectKey(tenant,bucket,key));if(!object)throw Error('object_not_found');if(object.size>maxBytes)throw Error('object_too_large');return {bytes:new Uint8Array(await object.arrayBuffer()),contentType:object.httpMetadata?.contentType};};
        const provider:StorageProvider={
            async put({bucket,key,bytes,contentType}){const physical=objectKey(tenant,bucket,key);if(bytes.byteLength>maxBytes)throw Error('payload_too_large');await binding.put(physical,bytes,{httpMetadata:{contentType:mime(contentType??'application/octet-stream')}});return {key};},
            get,
            async delete(bucket,key){await binding.delete(objectKey(tenant,bucket,key));},
            signedUrl:(bucket,key,ttl)=>signed(bucket,key,'GET',ttl),
            signedUploadUrl:(bucket,key,type,ttl)=>signed(bucket,key,'PUT',ttl,type),
            async listBuckets(){return [{id:'files',name:'files',public:false}];},
            async getBucket(id){prefix(tenant,id);return {id,name:id,public:false};},
            async createBucket(){throw Error('native_bucket_managed_at_deploy');},
            async deleteBucket(){throw Error('native_bucket_managed_at_deploy');},
            async updateBucket(id,opts){prefix(tenant,id);if(opts.isPublic!==undefined && opts.isPublic!==false || opts.fileSizeLimit!==undefined || opts.allowedMimeTypes!==undefined)throw Error('native_bucket_settings_not_supported');},
            async listFiles(bucket,path,opts={}){
                const p=prefix(tenant,bucket);if(path)objectKey(tenant,bucket,path);const relative=path?path.replace(/\/$/,'')+'/':'';
                const limit=opts.limit??100,offset=opts.offset??0;if(!Number.isSafeInteger(limit)||limit<1||limit>3000||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error('invalid_list_range');
                const entries:FileEntry[]=[];let cursor:string|undefined;
                for(let page=0;page<32;page++){
                    const listed=await binding.list({prefix:p+relative,delimiter:'/',limit:1000,...(cursor?{cursor}:{})});
                    for(const key of listed.delimitedPrefixes)entries.push({name:key.slice((p+relative).length).replace(/\/$/,''),id:key.slice(p.length),isFolder:true});
                    for(const object of listed.objects){const name=object.key.slice((p+relative).length);if(name==='.frontbase-folder')continue;entries.push({name,id:object.key.slice(p.length),size:object.size,updated_at:object.uploaded?.toISOString(),mimetype:object.httpMetadata?.contentType,isFolder:false});}
                    const matched=opts.search?entries.filter(e=>e.name.includes(opts.search!)):entries;
                    if(matched.length>=offset+limit || !listed.truncated)return matched.slice(offset,offset+limit);
                    if(!listed.cursor || listed.cursor===cursor)throw Error('invalid_storage_cursor');cursor=listed.cursor;
                }throw Error('storage_listing_limit');
            },
            async createFolder(bucket,path){await provider.put({bucket,key:path.replace(/\/$/,'')+'/.frontbase-folder',bytes:new Uint8Array()});},
            async deleteFiles(bucket,paths){if(paths.length>1000)throw Error('too_many_objects');const physical=paths.map(key=>objectKey(tenant,bucket,key));for(const key of physical){if(key.endsWith('/'))await deletePrefix(key);else await binding.delete(key);}},
            async emptyBucket(bucket){await deletePrefix(prefix(tenant,bucket));},
            async move(bucket,source,destination){if(source===destination){objectKey(tenant,bucket,source);return;}const got=await get(bucket,source);await provider.put({bucket,key:destination,...got});await provider.delete(bucket,source);},
        };
        return provider;
    }
    async function fetchAccess(request:Request):Promise<Response>{
        const url=new URL(request.url);if(url.pathname!==NATIVE_R2_ACCESS_PATH || url.searchParams.getAll('token').length!==1)return denied();
        const a=await verify(url.searchParams.get('token')??'');if(!a || a.origin!==url.origin || a.method!==request.method)return denied();
        if(request.headers.get('origin') && request.headers.get('origin')!==url.origin)return denied();
        try{
            const provider=providerFor(a.tenant);
            if(a.method==='PUT'){
                if(request.headers.get('content-type')!==a.contentType)return denied();const bytes=await boundedBody(request);await provider.put({bucket:a.bucket,key:a.key,bytes,contentType:a.contentType});
                return Response.json({ok:true},{headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
            }
            const got=await provider.get(a.bucket,a.key);
            return new Response(got.bytes as BodyInit,{headers:{'content-type':got.contentType??'application/octet-stream','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(a.key.split('/').pop()??'file'),'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
        }catch(error){return denied((error as Error).message==='payload_too_large'?413:404);}
    }
    return {providerFor,fetchAccess};
}
