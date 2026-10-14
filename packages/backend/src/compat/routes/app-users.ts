import {z} from 'zod';
import type {Hono} from 'hono';
import {rateLimitGuard,type DbRunner} from '@frontbase/edge-infra';
import type {Principal} from '@frontbase/edge-core';
import type {ConsoleAuthVars} from '../../mw/auth.js';
import type {SecretCipher} from '../../db/secret-cipher.js';
import {KeyValueStore} from '../store.js';
import {APP_USER_COOKIE,AppUserSessions} from '../app-user-sessions.js';
import {appUserToken,configuredMenuAudienceAccounts} from '../menu-audience-host.js';
import {supabaseMenuAudiencePorts} from '../menu-audience-supabase.js';
import {resolveSupabase} from '../providers/supabase.js';
import {checkedExternalUrl,type CompatFetch} from '../external-http.js';
import {publicationHash} from '../publication-hash.js';
import {createD1RateLimitCache} from '../rate-limit-store.js';

/** Classify only PUBLIC key material. JWT decoding here never authenticates a visitor. */
export function publicAuthKey(value:unknown):string|null{
    if(typeof value!=='string'||!value.length||value.length>8192||/[\s\x00-\x1f]/.test(value))return null;
    if(/^sb_publishable_[a-zA-Z0-9_-]+$/.test(value))return value;
    try{const parts=value.split('.');if(parts.length!==3)return null;const payload=JSON.parse(atob(parts[1]!.replace(/-/g,'+').replace(/_/g,'/')));return payload.role==='anon'?value:null;}catch{return null;}
}
export function sameAppOrigin(request:Request):boolean{
    try{const value=request.headers.get('Origin');if(!value||request.headers.get('Sec-Fetch-Site')==='cross-site')return false;
        const origin=new URL(value),target=new URL(request.url);return origin.origin===value&&origin.host===target.host&&!origin.username&&!origin.password&&(origin.protocol==='https:'||origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname));
    }catch{return false;}
}
function safeRedirect(value:unknown):string{
    if(typeof value!=='string'||value.length>2000||!value.startsWith('/')||value.startsWith('//'))return '/';
    try{const decoded=decodeURIComponent(value),url=new URL(value,'https://app.invalid');if(/[\\\x00-\x1f]/.test(decoded)||decoded.startsWith('//')||url.origin!=='https://app.invalid'||/^\/(api|frontbase-admin|frontbase-setup)(\/|$)/i.test(url.pathname))return '/';return value;}catch{return '/';}
}
const formSettings=z.object({title:z.string().max(500).optional(),description:z.string().max(2000).optional(),logoUrl:z.string().max(2048).refine(v=>{if(!v)return true;try{const url=new URL(v,'https://app.invalid');return !/[\\\x00-\x20]/.test(v)&&url.protocol==='https:'&&!url.username&&!url.password&&(v.startsWith('/')&&!v.startsWith('//')||v.startsWith('https://'));}catch{return false;}}).optional(),primaryColor:z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),providers:z.array(z.enum(['google','github','discord','twitter','facebook','apple'])).max(6).optional(),socialLayout:z.enum(['horizontal','vertical']).optional(),showLinks:z.boolean().optional(),defaultView:z.enum(['sign_in','sign_up']).optional(),magicLink:z.boolean().optional()});
export function registerAppUserRoutes(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,cipher:SecretCipher,fetchImpl:CompatFetch,now:()=>string,requestOwner?:(request:Request)=>Promise<string|undefined>){
    const accounts=configuredMenuAudienceAccounts(db,cipher),ports=supabaseMenuAudiencePorts(accounts,fetchImpl),rateCache=createD1RateLimitCache(db,60,()=>Date.parse(now()));
    const ownerFor=async(request:Request)=>requestOwner?await requestOwner(request):'_root';
    async function context(owner:string){
        const project=await new KeyValueStore(db,owner).getJson('project',{}) as Record<string,any>,cfg=project?.usersConfig;
        if(cfg?.enabled!==true||typeof cfg.authDataSourceId!=='string')return null;
        const account=await accounts(owner,cfg.authDataSourceId);if(!account||account.provider!=='supabase')return null;
        const resolved=resolveSupabase(account.config),key=publicAuthKey(resolved.anonKey??account.config.anon_key??account.config.anonKey),url=checkedExternalUrl(String(resolved.url??''));
        if(!key||url.pathname!=='/'||url.search||url.hash)return null;
        return{cfg,account,providerId:cfg.authDataSourceId as string,url:url.origin,key};
    }
    app.get('/api/app-users/forms/:id/',async c=>{
        c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
        if(new URL(c.req.url).searchParams.size||!z.string().uuid().safeParse(c.req.param('id')).success)return c.json({detail:'Form unavailable'},404);
        try{const owner=await ownerFor(c.req.raw);if(!owner)return c.json({detail:'Form unavailable'},404);
            const rows=await db.query('SELECT id, name, type, config FROM auth_forms WHERE tenant_slug = ? AND id = ?',[owner,c.req.param('id')]);if(rows.length!==1)return c.json({detail:'Form unavailable'},404);
            const row=rows[0]!,raw=row.config?JSON.parse(String(row.config)):{};if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.is_active===false)return c.json({detail:'Form unavailable'},404);
            const selected=await context(owner);if(!selected)return c.json({detail:'Form unavailable'},404);
            const type=z.enum(['login','signup','both']).parse(row.type),config=formSettings.parse(raw);
            const allowed=z.array(z.string().min(1).max(100)).max(100).parse(raw.allowed_contact_types??[]).filter(k=>Object.hasOwn(selected.cfg.contactTypes??{},k));
            const target=typeof raw.target_contact_type==='string'&&Object.hasOwn(selected.cfg.contactTypes??{},raw.target_contact_type)?raw.target_contact_type:undefined;
            const keys=[...new Set([...allowed,...(target?[target]:[])])],labels=Object.fromEntries(keys.filter(k=>typeof selected.cfg.contactTypes[k]==='string'&&selected.cfg.contactTypes[k].length<=200).map(k=>[k,selected.cfg.contactTypes[k]]));
            return c.json({provider:{type:'supabase',url:selected.url,publicKey:selected.key,binding:await publicationHash([owner,selected.providerId,selected.url,selected.key])},form:{id:row.id,name:row.name,type,config,allowedContactTypes:allowed,...(target?{targetContactType:target}:{}),redirectUrl:safeRedirect(raw.redirect_url),isActive:true},contactTypes:labels});
        }catch{return c.json({detail:'Form unavailable'},404);}
    });
    app.post('/api/app-users/session/',async c=>{
        c.header('Cache-Control','no-store');if(new URL(c.req.url).searchParams.size||!sameAppOrigin(c.req.raw))return c.json({detail:'Session unavailable'},403);
        // A token proves provider identity; fields claiming a role/owner are not accepted.
        if(c.req.raw.body){const reader=c.req.raw.body.getReader(),part=await reader.read();await reader.cancel();if(!part.done)return c.json({detail:'Unexpected session body'},422);}
        const authorization=c.req.header('Authorization'),token=authorization&&/^Bearer ([^\s]{1,16384})$/.exec(authorization)?.[1];if(!token)return c.json({detail:'Session unavailable'},401);
        try{const owner=await ownerFor(c.req.raw);if(!owner)return c.json({detail:'Session unavailable'},404);
            const denial=await rateLimitGuard({limit:64,windowSeconds:60,cache:rateCache},{tenant:`app-user-session:${owner}`,user:{id:'shared'}} as Principal);if(denial)return c.json({detail:'Try again later'},429);
            const selected=await context(owner);if(!selected)return c.json({detail:'Session unavailable'},404);
            if(!await ports.verify(selected.account,token))return c.json({detail:'Session unavailable'},401);
            const sessions=new AppUserSessions(db,owner,cipher),created=await sessions.create(selected.providerId,token,Date.parse(now()));
            const previous=appUserToken(new Request(c.req.url,{headers:{cookie:c.req.header('cookie')??''}}));if(previous)await sessions.revoke(previous);
            c.header('Set-Cookie',`${APP_USER_COOKIE}=${created.handle}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`);
            return c.json({authenticated:true});
        }catch{return c.json({detail:'Session unavailable'},401);}
    });
    app.delete('/api/app-users/session/',async c=>{
        c.header('Cache-Control','no-store');if(new URL(c.req.url).searchParams.size||!sameAppOrigin(c.req.raw))return c.json({detail:'Session unavailable'},403);
        try{const owner=await ownerFor(c.req.raw);if(!owner)return c.json({detail:'Session unavailable'},404);
            const handle=appUserToken(new Request(c.req.url,{headers:{cookie:c.req.header('cookie')??''}}));if(handle)await new AppUserSessions(db,owner,cipher).revoke(handle);
            c.header('Set-Cookie',`${APP_USER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return c.json({authenticated:false});
        }catch{return c.json({detail:'Session unavailable'},503);}
    });
}
