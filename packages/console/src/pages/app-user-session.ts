import {createClient,type SupabaseClient} from '@supabase/supabase-js';

export function createAppUserClient(provider:{type:string;url:string;publicKey:string;binding:string}):SupabaseClient{
    const url=new URL(provider.url);
    if(provider.type!=='supabase'||url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!provider.publicKey||provider.publicKey.startsWith('sb_secret_')||!/^[a-f0-9]{64}$/.test(provider.binding))throw Error('Authentication unavailable');
    return createClient(provider.url,provider.publicKey,{auth:{storageKey:`frontbase-app-user:${provider.binding}`,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}
/** Same-origin server bridge, explicitly using the VISITOR token rather than console auth. */
let pending:Promise<void>=Promise.resolve();
async function sendAppUserSession(token:string|null):Promise<void>{
    const response=await fetch('/api/app-users/session/',{method:token?'POST':'DELETE',credentials:'same-origin',...(token?{headers:{Authorization:`Bearer ${token}`}}:{})});
    if(!response.ok)throw Error('Your application login could not be confirmed. Please try again.');
}
export function syncAppUserSession(token:string|null):Promise<void>{pending=pending.catch(()=>{}).then(()=>sendAppUserSession(token));return pending;}
export function safeAppRedirect(value:unknown):string{
    if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return '/';
    try{const decoded=decodeURIComponent(value);return /[\\\x00-\x1f]/.test(decoded)||decoded.startsWith('//')||/^\/(api|frontbase-admin|frontbase-setup)(\/|$)/i.test(new URL(value,'https://app.invalid').pathname)?'/':value;}catch{return '/';}
}
