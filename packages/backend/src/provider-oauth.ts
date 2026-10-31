/** Server-only provider connection protocol shared by setup and installed hosts. */
import { Hono } from 'hono';
import { timingSafeEqual } from '@frontbase/edge-infra';
export type OAuthProvider = 'cloudflare' | 'vercel' | 'supabase';
export interface ProviderOAuthClient {
    provider: OAuthProvider; clientId: string; clientSecret?: string; integrationSlug?:string; integrationTeamSlug?:string;
    /** Exact registered callback; derived from the trusted host origin, never request headers. */
    redirectUri: string; scopes: string[];
}
export interface OAuthActor { tenant: string; subject: string; }
export interface OAuthPending extends OAuthActor {
    provider: OAuthProvider; verifier: string; expires: number; returnPath: string; accountId?: string;
}
export interface OAuthAuthorization {
    provider: OAuthProvider; accessToken: string; refreshToken?: string; expiresAt?: number;
    /** Server-probed optional capabilities; never accepted from a wizard snapshot. */
    capabilities?: Array<'vectorize'>;
    scopes: string[]; accounts: Array<{id:string;name:string}>;
}
export interface ProviderOAuthStore {
    connections(actor:OAuthActor):Promise<Array<{id:string;provider:OAuthProvider;label:string;accountId:string;reconnectRequired:boolean;capabilities?:Array<'vectorize'>}>>;
    put(id: string, pending: OAuthPending): Promise<void>;
    /** Atomic one-use claim; include actor/provider/expiry in the storage predicate. */
    consume(id: string, actor: OAuthActor, provider: OAuthProvider, now: number): Promise<OAuthPending | null>;
    save(actor: OAuthActor, authorization: OAuthAuthorization, accountId?: string): Promise<string>;
}
export interface ProviderOAuthDeps {
    origin: string; clients: Partial<Record<OAuthProvider,ProviderOAuthClient>>;
    authorize(request: Request): Promise<OAuthActor | null>;
    store: ProviderOAuthStore; fetch: typeof fetch; now?: ()=>number;
}
const providers: OAuthProvider[] = ['cloudflare','vercel','supabase'];
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(raw:string)=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))));
const same=(a:string,b:string)=>timingSafeEqual(new TextEncoder().encode(a),new TextEncoder().encode(b));
export const endpoints={cloudflare:{authorize:'https://dash.cloudflare.com/oauth2/auth',token:'https://dash.cloudflare.com/oauth2/token'},vercel:{authorize:'https://vercel.com/integrations/',token:'https://api.vercel.com/v2/oauth/access_token'},supabase:{authorize:'https://api.supabase.com/v1/oauth/authorize',token:'https://api.supabase.com/v1/oauth/token'}};
const base='/api/provider-oauth';
const safePath=(value:unknown):value is string=>typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n#]/.test(value)&&new URL(value,'https://frontbase.invalid').origin==='https://frontbase.invalid';
/** Body and provider responses are bounded; provider errors/tokens never enter responses or logs. */
export async function json(response:Response,limit=65536):Promise<any>{
    const reader=response.body?.getReader();if(!reader)throw Error('oauth_refused');let length=0,text='';const decoder=new TextDecoder();
    try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit)throw Error('oauth_refused');text+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
    if(!response.ok)throw Error('oauth_refused');return JSON.parse(text+decoder.decode());
}
function validClient(client:ProviderOAuthClient,origin:string){
    if(!providers.includes(client.provider)||!client.clientId||client.clientId.length>256||client.redirectUri!==origin+base+'/'+client.provider+'/callback'||!Array.isArray(client.scopes)||client.scopes.some(s=>!s||/\s/.test(s)))throw Error('invalid_oauth_configuration');
    // Vercel deployment permissions use an Integration, not an OIDC identity token.
    if(client.provider==='vercel'&&(!client.clientSecret||!client.integrationSlug||!/^[a-z0-9-]{1,100}$/.test(client.integrationSlug)))throw Error('invalid_oauth_configuration');
    if(client.integrationTeamSlug!==undefined&&(client.provider!=='vercel'||!/^[a-z0-9-]{1,100}$/.test(client.integrationTeamSlug)))throw Error('invalid_oauth_configuration');
}
export function createProviderOAuth(deps:ProviderOAuthDeps){
    const origin=new URL(deps.origin),now=deps.now??Date.now;
    if(origin.origin!==deps.origin||(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname))))throw Error('invalid_oauth_origin');
    for(const [provider,client] of Object.entries(deps.clients)){if(client?.provider!==provider)throw Error('invalid_oauth_configuration');validClient(client,deps.origin);}
    const app=new Hono();
    app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('X-Frame-Options','DENY');c.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");if(new URL(c.req.url).origin!==deps.origin)return c.json({error:'oauth_refused'},403);return next();});
    // Returning through a same-origin POST restores Strict session cookies. Only an authorization
    // code visits the browser; access/refresh tokens are exchanged and persisted server-side.
    app.get(base+'/callback.js',c=>c.body("const u=new URL(location.href),p=u.pathname.split('/').at(-2),body={code:u.searchParams.get('code'),state:u.searchParams.get('state')};history.replaceState(null,'',u.pathname);fetch('/api/provider-oauth/'+p+'/finish',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(async r=>{if(!r.ok)throw Error();const v=await r.json();location.replace(v.returnPath);}).catch(()=>{document.getElementById('status').textContent='Connection could not be completed. Return to setup or Connected Accounts and reconnect.';});",200,{'content-type':'text/javascript; charset=utf-8'}));
    app.get(base+'/:provider/callback',c=>{
        if(!providers.includes(c.req.param('provider') as OAuthProvider)||c.req.url.length>8192)return c.text('Connection unavailable',404);
        return c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect provider</title></head><body><p id="status" role="status">Completing your connection…</p><script src="/api/provider-oauth/callback.js"></script></body></html>');
    });
    app.use(base+'/*',async(c,next)=>{
        const actor=await deps.authorize(c.req.raw);if(!actor?.tenant||!actor.subject)return c.json({error:'oauth_operator_required'},403);
        if(c.req.method==='POST'&&(c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json'))return c.json({error:'oauth_refused'},403);
        return next();
    });
    app.get(base+'/status',async c=>{const actor=await deps.authorize(c.req.raw);if(!actor)throw Error('oauth_refused');return c.json({providers:providers.map(provider=>({provider,available:!!deps.clients[provider]})),connections:await deps.store.connections(actor)});});
    app.post(base+'/:provider/start',async c=>{
        const provider=c.req.param('provider') as OAuthProvider,client=deps.clients[provider];if(!providers.includes(provider)||!client)return c.json({error:'oauth_unconfigured'},409);
        const input=await json(new Response(c.req.raw.body));if(!safePath(input.returnPath)||Object.keys(input).some(k=>!['returnPath','accountId'].includes(k))||(input.accountId!==undefined&&(typeof input.accountId!=='string'||input.accountId.length>256)))return c.json({error:'oauth_refused'},400);
        const actor=await deps.authorize(c.req.raw);if(!actor)throw Error('oauth_refused');
        const state=random(),verifier=random(),expires=now()+600000;
        await deps.store.put(await digest(state),{...actor,provider,verifier,expires,returnPath:input.returnPath,accountId:input.accountId});
        const cookie=(origin.protocol==='https:'?'__Host-':'')+'fb_oauth_'+provider;
        c.header('Set-Cookie',cookie+'='+state+'; Path=/; HttpOnly; '+(origin.protocol==='https:'?'Secure; ':'')+'SameSite=Lax; Max-Age=600');
        const url=new URL(provider==='cloudflare'?endpoints.cloudflare.authorize:provider==='supabase'?endpoints.supabase.authorize:client.integrationTeamSlug?'https://vercel.com/'+client.integrationTeamSlug+'/~/integrations/'+client.integrationSlug:endpoints.vercel.authorize+client.integrationSlug+'/new');
        url.searchParams.set('state',state);url.searchParams.set('redirect_uri',client.redirectUri);
        if(provider!=='vercel'){url.searchParams.set('client_id',client.clientId);url.searchParams.set('response_type','code');/* Supabase scopes are fixed at app registration; the authorize-time scope parameter is deprecated there. */if(client.scopes.length)url.searchParams.set('scope',client.scopes.join(' '));url.searchParams.set('code_challenge',await digest(verifier));url.searchParams.set('code_challenge_method','S256');}
        return c.json({url:url.href});
    });
    app.post(base+'/:provider/finish',async c=>{
        const provider=c.req.param('provider') as OAuthProvider,client=deps.clients[provider];if(!providers.includes(provider)||!client)return c.json({error:'oauth_unconfigured'},409);
        const input=await json(new Response(c.req.raw.body));if(Object.keys(input).sort().join(',')!=='code,state'||typeof input.state!=='string'||!/^[\w-]{43}$/.test(input.state)||typeof input.code!=='string'||!input.code||input.code.length>4096)return c.json({error:'oauth_refused'},400);
        const cookie=(origin.protocol==='https:'?'__Host-':'')+'fb_oauth_'+provider;
        const values=(c.req.header('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookie+'='));
        if(values.length!==1||!same(values[0]!.slice(cookie.length+1),input.state))return c.json({error:'oauth_refused'},403);
        const actor=await deps.authorize(c.req.raw);if(!actor)throw Error('oauth_refused');
        const pending=await deps.store.consume(await digest(input.state),actor,provider,now());if(!pending)return c.json({error:'oauth_refused'},403);
        c.header('Set-Cookie',cookie+'=; Path=/; HttpOnly; '+(origin.protocol==='https:'?'Secure; ':'')+'SameSite=Lax; Max-Age=0');
        const params=new URLSearchParams({grant_type:'authorization_code',code:input.code,client_id:client.clientId,redirect_uri:client.redirectUri});
        if(provider!=='vercel')params.set('code_verifier',pending.verifier);
        if(client.clientSecret)params.set('client_secret',client.clientSecret);
        const token=await json(await deps.fetch(endpoints[provider].token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)}));
        if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>16384||(token.token_type&&token.token_type.toLowerCase()!=='bearer'))throw Error('oauth_refused');
        const headers={authorization:'Bearer '+token.access_token};let accounts:Array<{id:string;name:string}>;
        if(provider==='cloudflare'){
            const result=await json(await deps.fetch('https://api.cloudflare.com/client/v4/accounts?per_page=50',{headers,redirect:'manual',signal:AbortSignal.timeout(15000)}));
            if(result.success!==true||!Array.isArray(result.result))throw Error('oauth_refused');accounts=result.result.map((a:any)=>({id:a.id,name:a.name}));
        }else if(provider==='supabase'){
            // A management API call, not an identity-only response, proves usable authorization.
            // Projects carry both an id and the ref used by every other Management API path.
            const result=await json(await deps.fetch('https://api.supabase.com/v1/projects',{headers,redirect:'manual',signal:AbortSignal.timeout(15000)}));
            if(!Array.isArray(result))throw Error('oauth_refused');accounts=result.map((p:any)=>({id:String(p.ref??p.id),name:String(p.name)}));
        }else{
            // A management API call, not an identity-only userinfo response, proves usable authorization.
            if(typeof token.team_id!=='string'||!/^team_[a-zA-Z0-9]+$/.test(token.team_id))throw Error('oauth_team_required');
            const result=await json(await deps.fetch('https://api.vercel.com/v2/teams/'+encodeURIComponent(token.team_id),{headers,redirect:'manual',signal:AbortSignal.timeout(15000)}));
            const team=result.team??result;if(team.id!==token.team_id||typeof team.name!=='string')throw Error('oauth_refused');accounts=[{id:team.id,name:team.name}];
        }
        if(!accounts.length||accounts.length>50||accounts.some(a=>typeof a.id!=='string'||!a.id||typeof a.name!=='string'))throw Error('oauth_refused');
        const scopes=typeof token.scope==='string'?token.scope.split(' ').filter(Boolean):[];
        const authorization:OAuthAuthorization={provider,accessToken:token.access_token,scopes,accounts};
        if(typeof token.refresh_token==='string'&&token.refresh_token.length<=16384)authorization.refreshToken=token.refresh_token;
        if(Number.isFinite(token.expires_in)&&token.expires_in>0)authorization.expiresAt=now()+token.expires_in*1000;
        const accountId=await deps.store.save(actor,authorization,pending.accountId);
        return c.json({accountId,returnPath:pending.returnPath});
    });
    app.onError((_error,c)=>c.json({error:'oauth_connection_failed'},409));
    return app;
}
