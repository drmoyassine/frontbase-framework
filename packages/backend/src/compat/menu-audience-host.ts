import type {DbRunner} from '@frontbase/edge-infra';
import {Phase2Store} from '../db/phase2-store.js';
import {KeyValueStore} from './store.js';
import {resolveMenuAudience} from './menu-audience.js';
import {supabaseMenuAudiencePorts} from './menu-audience-supabase.js';
import type {CompatFetch} from './external-http.js';
import {AppUserSessions} from './app-user-sessions.js';

/** App-user credentials have their own namespace. Console session cookies are ignored. */
export function appUserToken(request:Request):string|null{
    const authorization=request.headers.get('Authorization');
    if(authorization){const match=/^Bearer ([^\s]+)$/.exec(authorization);return match?.[1]??null;}
    const entries=(request.headers.get('cookie')??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith('__Host-fb-app-session='));
    if(entries.length!==1)return null;
    try{return decodeURIComponent(entries[0]!.slice('__Host-fb-app-session='.length));}catch{return null;}
}
/** Host supplies its existing at-rest cipher and transport; no credential discovery or mutation. */
export function configuredMenuAudienceAccounts(db:DbRunner,cipher:ConstructorParameters<typeof Phase2Store>[2]){
    return async(owner:string,id:string)=>{
        const store=new Phase2Store(db,owner,cipher),resource=await store.getEdgeResource(id);
        if(!resource||resource.kind!=='provider'||String(resource.status??'active')!=='active'||typeof resource.provider!=='string')return null;
        const config=await store.getEdgeResourceConfig(id);return config?{provider:resource.provider,config}:null;
    };
}
export function configuredMenuAudienceResolver(db:DbRunner,cipher:ConstructorParameters<typeof Phase2Store>[2],fetchImpl:CompatFetch,now:()=>number=Date.now,includeUserId=false){
    const ports=supabaseMenuAudiencePorts(configuredMenuAudienceAccounts(db,cipher),fetchImpl);
    return async(owner:string,request:Request)=>{
        try{const project=await new KeyValueStore(db,owner).getJson('project',{}) as Record<string,unknown>,cfg=project?.usersConfig as Record<string,unknown>|undefined;
            const raw=appUserToken(request),token=request.headers.has('Authorization')?raw:raw&&cipher&&typeof cfg?.authDataSourceId==='string'?await new AppUserSessions(db,owner,cipher).get(raw,cfg.authDataSourceId,now()):null;
            return await resolveMenuAudience(owner,cfg,token,ports,includeUserId);
        }catch{return{authenticated:false};}
    };
}
