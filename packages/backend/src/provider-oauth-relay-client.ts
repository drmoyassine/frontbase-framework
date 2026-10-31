import {Hono} from 'hono';
import type {SecretCipher} from './db/secret-cipher.js';
import type {OAuthActor,OAuthAuthorization,OAuthProvider,ProviderOAuthStore} from './provider-oauth.js';
import type {OAuthRelayTarget} from './provider-oauth-relay.js';
export interface ProviderRelayClientDeps {
    origin:string;relayOrigin:string;target:OAuthRelayTarget;fetch:typeof fetch;
    authorize(request:Request):Promise<OAuthActor|null>;store?:ProviderOAuthStore;cipher?:SecretCipher;
    mode:'authenticated'|'native-install';now?:()=>number;registrationKey?:string;enrollReceiver?:boolean;
    establish?:(authorization:OAuthAuthorization,request:Request,registrationKey:string)=>Promise<string>;
}
const base='/api/provider-oauth',random=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hash=async(value:string)=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const canonical=(value:any):string=>value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
async function json(request:Request|Response,max=65536){const reader=request.body?.getReader();if(!reader)throw Error('relay_refused');let length=0,text='';const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>max)throw Error('relay_refused');text+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(text+decoder.decode());}
export function createProviderRelayClient(deps:ProviderRelayClientDeps){
    if(new URL(deps.origin).origin!==deps.origin||!deps.origin.startsWith('https://')||new URL(deps.relayOrigin).origin!==deps.relayOrigin||!deps.relayOrigin.startsWith('https://')||deps.target.origin!==deps.origin||deps.mode==='authenticated'&&(!deps.cipher||!deps.store)||deps.mode==='native-install'&&(!deps.establish||deps.target.purpose!=='install'))throw Error('invalid_relay_client');
    const app=new Hono(),now=deps.now??Date.now;
    const seal=async(value:unknown)=>{const encoded=JSON.stringify(value);if(!deps.cipher)return encodeURIComponent(encoded);const encrypted=await deps.cipher.encrypt(encoded);if(!deps.cipher.isEncrypted(encrypted))throw Error('relay_cipher_required');return encodeURIComponent(encrypted);};
    const read=async(raw:string)=>{const value=decodeURIComponent(raw);if(deps.cipher&&!deps.cipher.isEncrypted(value))throw Error('relay_refused');return JSON.parse(deps.cipher?await deps.cipher.decrypt(value):value);};
    app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('X-Frame-Options','DENY');c.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");if(new URL(c.req.url).origin!==deps.origin)return c.json({error:'relay_refused'},403);return next();});
    const callbackFailure=deps.mode==='native-install'?'Setup could not be confirmed. Ask the operator to inspect this installation before trying again.':'Connection could not be completed. Return to Frontbase and reconnect.';
    const callbackErrors:Record<string,string>=deps.mode==='native-install'?{native_setup_database_rejected:'Cloudflare could not create the setup database. Check D1 capacity and database permissions. Ask the operator to recover this installation before trying again.'}:{};
    app.get(base+'/relay-callback.js',c=>c.body("const messages="+JSON.stringify(callbackErrors)+",u=new URL(location.href),p=u.pathname.split('/').at(-2),ticket=u.searchParams.get('ticket');history.replaceState(null,'',u.pathname);fetch('/api/provider-oauth/'+p+'/relay-finish',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({ticket})}).then(async r=>{const result=await r.json();if(!r.ok){document.getElementById('status').textContent=Object.hasOwn(messages,result.error)?messages[result.error]:"+JSON.stringify(callbackFailure)+";return;}location.replace(result.returnPath);}).catch(()=>{document.getElementById('status').textContent="+JSON.stringify(callbackFailure)+";});",200,{'content-type':'text/javascript'}));
    app.get(base+'/:provider/relay-callback',c=>{
        if(!['cloudflare','vercel','supabase'].includes((c.req.param('provider')??''))||c.req.url.length>4096)return c.text('Not found',404);
        return c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Frontbase</title></head><body><p id="status" role="status">Completing your connection…</p><script src="/api/provider-oauth/relay-callback.js"></script></body></html>');
    });
    app.get(base+'/receiver-proof',async c=>{
        if(deps.mode!=='authenticated'||!deps.enrollReceiver||!deps.registrationKey||!/^[\w-]{43}$/.test(deps.registrationKey))return c.text('Not found',404);
        return c.json({version:1,origin:deps.origin,host:deps.target.host,proof:await hash(deps.registrationKey)});
    });
    app.use(base+'/*',async(c,next)=>{if(!await deps.authorize(c.req.raw))return c.json({error:'oauth_operator_required'},403);if(c.req.method==='POST'&&(c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json'))return c.json({error:'relay_refused'},403);return next();});
    app.get(base+'/status',async c=>{
        const response=await deps.fetch(deps.relayOrigin+'/health',{redirect:'manual',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('relay_unavailable');const status=await json(response);const actor=await deps.authorize(c.req.raw);if(!actor)throw Error('relay_refused');
        return c.json({providers:['cloudflare','vercel','supabase'].map(provider=>({provider,available:Array.isArray(status.providers)&&status.providers.includes(provider)})),connections:deps.store?await deps.store.connections(actor):[]});
    });
    app.post(base+'/:provider/start',async c=>{
        const provider=c.req.param('provider')??'';if(!['cloudflare','vercel','supabase'].includes(provider))return c.json({error:'relay_refused'},400);
        const input=await json(c.req.raw,8192);if(typeof input.returnPath!=='string'||!input.returnPath.startsWith('/')||input.returnPath.startsWith('//')||/[\\\r\n#]/.test(input.returnPath)||Object.keys(input).some(k=>!['returnPath','accountId'].includes(k))||input.accountId!==undefined&&(typeof input.accountId!=='string'||input.accountId.length>256))throw Error('relay_refused');
        const actor=await deps.authorize(c.req.raw);if(!actor)throw Error('relay_refused');const verifier=deps.mode==='authenticated'&&deps.registrationKey?deps.registrationKey:random();if(!/^[\w-]{43}$/.test(verifier))throw Error('relay_refused');
        if(deps.enrollReceiver){
            if(deps.mode!=='authenticated'||!deps.registrationKey)throw Error('relay_refused');
            const enrolled=await deps.fetch(deps.relayOrigin+'/receivers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({target:deps.target,proof:await hash(verifier)}),redirect:'manual',signal:AbortSignal.timeout(15000)});
            if(!enrolled.ok)throw Error('relay_receiver_unavailable');await enrolled.body?.cancel().catch(()=>{});
        }
        const value=await seal({...actor,verifier,provider,expires:now()+600000,target:deps.target,returnPath:input.returnPath,accountId:input.accountId});if(value.length>4096)throw Error('relay_refused');
        c.header('Set-Cookie','__Host-fb_relay_client_'+provider+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
        const url=new URL('/connect',deps.relayOrigin);url.searchParams.set('provider',provider);url.searchParams.set('target',JSON.stringify(deps.target));url.searchParams.set('challenge',await hash(verifier));return c.json({url:url.href,relayOrigin:deps.relayOrigin});
    });
    app.post(base+'/:provider/relay-finish',async c=>{
        const provider=c.req.param('provider') as OAuthProvider;if(!['cloudflare','vercel','supabase'].includes(provider))throw Error('relay_refused');
        const input=await json(c.req.raw,8192);if(Object.keys(input).length!==1||typeof input.ticket!=='string'||!/^[\w-]{43}$/.test(input.ticket))throw Error('relay_refused');
        const name='__Host-fb_relay_client_'+provider,values=(c.req.header('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));if(values.length!==1)throw Error('relay_refused');
        const pending=await read(values[0]!.slice(name.length+1)),actor=await deps.authorize(c.req.raw);
        if(!actor||actor.tenant!==pending.tenant||actor.subject!==pending.subject||pending.provider!==provider||pending.expires<=now()||pending.expires>now()+600000||canonical(pending.target)!==canonical(deps.target)||typeof pending.verifier!=='string'||!/^[\w-]{43}$/.test(pending.verifier))throw Error('relay_refused');
        const response=await deps.fetch(deps.relayOrigin+'/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket:input.ticket,verifier:pending.verifier,origin:deps.origin}),redirect:'manual',signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw Error('relay_refused');const result=await json(response);
        if(canonical(result.target)!==canonical(deps.target)||result.authorization?.provider!==provider||typeof result.authorization?.accessToken!=='string'||!result.authorization.accessToken||!Array.isArray(result.authorization.accounts)||!result.authorization.accounts.length||result.authorization.expiresAt!==undefined&&result.authorization.expiresAt<=now())throw Error('relay_refused');
        let returnPath=pending.returnPath;
        if(deps.mode==='native-install')returnPath=await deps.establish!(result.authorization,c.req.raw,pending.verifier);
        else await deps.store!.save(actor,result.authorization,pending.accountId);
        if(typeof returnPath!=='string'||!returnPath.startsWith('/')||returnPath.startsWith('//')||/[\\\r\n]/.test(returnPath))throw Error('relay_refused');
        c.header('Set-Cookie',name+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return c.json({returnPath});
    });
    app.onError((error,c)=>c.json({error:deps.mode==='native-install'&&Object.hasOwn(callbackErrors,error.message)?error.message:'relay_connection_failed'},409));return app;
}
