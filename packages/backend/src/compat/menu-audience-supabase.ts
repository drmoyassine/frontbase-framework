import {checkedExternalUrl,guardedExternalFetch,type CompatFetch} from './external-http.js';
import {resolveSupabase} from './providers/supabase.js';
import type {MenuAudienceAccount,MenuAudiencePorts} from './menu-audience.js';
import {z} from 'zod';

async function boundedJson(response:Response):Promise<unknown>{
    if(!response.ok){await response.body?.cancel();throw Error('audience_unavailable');}
    const reader=response.body?.getReader();if(!reader)throw Error('audience_unavailable');
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;if((size+=part.value.length)>64*1024){await reader.cancel();throw Error('audience_unavailable');}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder().decode(bytes));
}
function settings(account:MenuAudienceAccount){
    if(account.provider!=='supabase')throw Error('audience_provider_unsupported');
    const resolved=resolveSupabase(account.config),base=checkedExternalUrl(String(resolved.url??''));
    if(base.search||base.hash||base.pathname!=='/')throw Error('audience_provider_invalid');
    return{base:base.origin,publicKey:String(resolved.anonKey??account.config.anon_key??account.config.anonKey??''),serverKey:String(resolved.serviceKey??''),schema:String(resolved.schema??'public')};
}
/** Uses the existing guarded transport. Keys stay server-side, no enrichment or writes. */
export function supabaseMenuAudiencePorts(account:MenuAudiencePorts['account'],fetchImpl:CompatFetch):MenuAudiencePorts{
    return{account,async verify(account,token){
        const cfg=settings(account);if(!cfg.publicKey)throw Error('audience_public_key_missing');
        const response=await guardedExternalFetch(fetchImpl,`${cfg.base}/auth/v1/user`,{headers:{apikey:cfg.publicKey,Authorization:`Bearer ${token}`}});
        const value=z.object({id:z.string().uuid(),is_anonymous:z.boolean().optional()}).passthrough().parse(await boundedJson(response));
        return value.is_anonymous===true?null:{id:value.id};
    },async contacts(_owner,account,query){
        z.object({table:z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),authColumn:z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),authId:z.string().uuid(),columns:z.array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)).min(1).max(2),limit:z.literal(2)}).strict().parse(query);
        const cfg=settings(account);if(!cfg.serverKey||!/^\w+$/.test(cfg.schema))throw Error('audience_contacts_unavailable');
        const url=new URL(`${cfg.base}/rest/v1/${query.table}`);
        url.searchParams.set('select',query.columns.join(','));url.searchParams.set(query.authColumn,`eq.${query.authId}`);url.searchParams.set('limit','2');
        const headers:Record<string,string>={apikey:cfg.serverKey,'Accept-Profile':cfg.schema};
        // New Supabase keys are API keys, not JWTs. Legacy service keys remain JWTs.
        if(!cfg.serverKey.startsWith('sb_'))headers.Authorization=`Bearer ${cfg.serverKey}`;
        return z.array(z.record(z.unknown())).max(2).parse(await boundedJson(await guardedExternalFetch(fetchImpl,url,{headers})));
    }};
}
