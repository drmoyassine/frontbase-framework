/** Optional, explicitly deployed OAuth callback relay. Provider credentials never visit a browser. */
import {Hono} from 'hono';
import type {SecretCipher} from './db/secret-cipher.js';
import {createProviderOAuth,type OAuthAuthorization,type OAuthProvider,type ProviderOAuthClient,type OAuthActor} from './provider-oauth.js';
import {providerOAuthVault,type OAuthVault} from './provider-oauth-vault.js';
export interface OAuthRelayTarget {
    origin:string;host:'cloudflare'|'vercel'|'docker';purpose:'install'|'connect';
    account?:string;project?:string;installationId?:string;deploymentId?:string;
}
export interface OAuthRelayVault extends OAuthVault {
    /** Atomic delete only if the encrypted record still equals the inspected value. */
    take(key:string,expected:string):Promise<boolean>;
    purge():Promise<void>;
}
export interface OAuthRelayDeps {
    origin:string;clients:Partial<Record<OAuthProvider,ProviderOAuthClient>>;cipher:SecretCipher;
    vault:OAuthRelayVault;fetch:typeof fetch;now?:()=>number;
    /** Admission is data-only. Verify makes authenticated, fixed-provider ownership reads. */
    admit(target:OAuthRelayTarget,provider:OAuthProvider):boolean;
    verify(target:OAuthRelayTarget,authorization:OAuthAuthorization):Promise<void>;
    /** Durable create-only account/project claim, independent of aliases and installation IDs. */
    claimInstallation?:(target:OAuthRelayTarget,receiverProof:string)=>Promise<boolean>;
}
const token=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hash=async(value:string)=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const cookie='__Host-fb_oauth_relay',validToken=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{43}$/.test(v);
async function readBody(request:Request){const reader=request.body?.getReader();if(!reader)throw Error('relay_refused');let length=0,text='';const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>65536)throw Error('relay_refused');text+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(text+decoder.decode());}
export function createProviderOAuthRelay(deps:OAuthRelayDeps){
    if(new URL(deps.origin).origin!==deps.origin||!deps.origin.startsWith('https://'))throw Error('invalid_relay_origin');
    const app=new Hono(),now=deps.now??Date.now;
    const seal=async(value:unknown)=>{const text=await deps.cipher.encrypt(JSON.stringify(value));if(!deps.cipher.isEncrypted(text))throw Error('relay_vault_required');return text;};
    const read=async(value:string)=>{if(!deps.cipher.isEncrypted(value)||value.length>65536)throw Error('relay_refused');return JSON.parse(await deps.cipher.decrypt(value));};
    const session=async(request:Request)=>{
        const values=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookie+'='));if(values.length!==1)return null;
        try{const value=await read(decodeURIComponent(values[0]!.slice(cookie.length+1)));if(!validToken(value.subject)||value.exp<=now()||value.exp>now()+600000||!deps.admit(value.target,value.provider))return null;return value;}catch{return null;}
    };
    app.use('*',async(c,next)=>{
        c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('X-Frame-Options','DENY');c.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
        if(new URL(c.req.url).origin!==deps.origin)return c.json({error:'relay_refused'},403);
        await deps.vault.purge();return next();
    });
    app.get('/health',c=>c.json({status:'ok',providers:Object.keys(deps.clients)}));
    app.get('/privacy',c=>c.text('Frontbase isolated OAuth relay — privacy notice\n\nThis private test integration handles provider authorization codes, account/team identifiers, requested permissions and access/refresh grants solely to connect an approved Frontbase test installation. Tokens are exchanged server-side. Pending relay records are encrypted and expire after at most ten minutes; handoff tickets expire after at most two minutes and their credential record is deleted on successful redemption. Expired rows are purged on requests and by the deployed scheduled cleanup. Native first-install claims retain nonsecret account/project, installation, recipient origin and receiver-proof metadata to prevent a second owner after credential cleanup; these claims require operator inspection and explicit reset for recovery and do not expire automatically. Provider and Cloudflare database backup/Time Travel retention are separate from active-row deletion.\n\nThe selected installation retains its connection in its existing encrypted Connected Accounts store until disconnected. Disconnecting does not revoke provider authorization or erase historical deployment/database backups; revoke access at the provider to invalidate a grant. Automatic refresh is not currently claimed.\n\nThe relay has no analytics script. It uses a short-lived HttpOnly session cookie and stores a keyed hash of the request IP for a bounded rate-limit window. Hosting and authorization providers may independently process request metadata under their own policies. No passwords are requested by this relay. Test access is restricted by its operator-configured recipient policy.\n\nOperator and contact information are supplied in the private Vercel/Cloudflare integration registration. This notice describes the isolated test service, not a generally available hosted Frontbase service.'));
    app.get('/terms',c=>c.text('Frontbase isolated OAuth relay — software license\n\nFrontbase framework software is licensed under Apache License 2.0, including its existing warranty and liability provisions. The license is available at https://github.com/drmoyassine/frontbase-framework/blob/main/LICENSE . This relay is an operator-managed private test deployment. No paid Frontbase service or service-level commitment is offered through this test integration. Cloudflare, Vercel and other selected providers remain subject to their respective terms. Only authorize installations and resources you control.'));
    app.get('/connect',async c=>{
        const url=new URL(c.req.url);if(url.href.length>4096)return c.text('Connection unavailable',409);
        const provider=url.searchParams.get('provider') as OAuthProvider,proof=url.searchParams.get('challenge');let target:OAuthRelayTarget;
        try{target=JSON.parse(url.searchParams.get('target')??'null');}catch{return c.text('Connection unavailable',409);}
        if(!['cloudflare','vercel'].includes(provider)||!deps.clients[provider]||!validToken(proof)||!target||!deps.admit(target,provider))return c.text('Connection unavailable',409);
        c.header('Set-Cookie',cookie+'='+encodeURIComponent(await seal({subject:token(),tenant:'_relay',provider,target,proof,exp:now()+600000}))+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
        const escape=(s:string)=>s.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
        return c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Frontbase</title></head><body><h1>Connect '+escape(provider==='cloudflare'?'Cloudflare':'Vercel')+'</h1><p>Authorization will be delivered securely to <strong>'+escape(target.origin)+'</strong>.</p><button id="connect" type="button">Continue to provider</button><p id="status" role="status"></p><script src="/connect.js"></script></body></html>');
    });
    app.get('/connect.js',c=>c.body("document.getElementById('connect').addEventListener('click',async()=>{const p=new URL(location.href).searchParams.get('provider');const r=await fetch('/api/provider-oauth/'+p+'/start',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({returnPath:'/complete'})});if(!r.ok){document.getElementById('status').textContent='Connection unavailable. Return to Frontbase and reconnect.';return;}location.assign((await r.json()).url);});",200,{'content-type':'text/javascript'}));
    app.get('/complete',async c=>{
        const value=await session(c.req.raw),ticket=new URL(c.req.url).searchParams.get('ticket');if(!value||!validToken(ticket))return c.text('Connection expired. Please reconnect.',409);
        const raw=await deps.vault.get('ticket:'+ticket);if(!raw)return c.text('Connection expired. Please reconnect.',409);
        const record=await read(raw);if(record.session!==value.subject||record.exp<=now())return c.text('Connection expired. Please reconnect.',409);
        c.header('Set-Cookie',cookie+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
        return c.redirect(value.target.origin+'/api/provider-oauth/'+value.provider+'/relay-callback?ticket='+encodeURIComponent(ticket),302);
    });
    app.post('/ticket',async c=>{
        // Server-to-server only. Browser-origin requests receive no CORS permission or credentials.
        if(c.req.header('origin')||c.req.header('content-type')?.split(';')[0]!=='application/json')return c.json({error:'relay_refused'},403);
        const input=await readBody(c.req.raw);if(!validToken(input.ticket)||!validToken(input.verifier))return c.json({error:'relay_refused'},403);
        const raw=await deps.vault.get('ticket:'+input.ticket);if(!raw)return c.json({error:'relay_refused'},403);const record=await read(raw);
        if(record.exp<=now()||record.exp>now()+120000||record.proof!==await hash(input.verifier)||record.target.origin!==input.origin||!deps.admit(record.target,record.authorization.provider))return c.json({error:'relay_refused'},403);
        await deps.verify(record.target,record.authorization);
        if(!await deps.vault.take('ticket:'+input.ticket,raw))return c.json({error:'relay_refused'},403);
        if(record.target.purpose==='install'&&(!deps.claimInstallation||!await deps.claimInstallation(record.target,record.proof)))return c.json({error:'relay_refused'},403);
        return c.json({authorization:record.authorization,target:record.target});
    });
    app.all('/api/provider-oauth/*',async c=>{
        const value=await session(c.req.raw),path=new URL(c.req.url).pathname;
        if(!value&&!/\/(callback|callback.js)$/.test(path))return c.json({error:'relay_refused'},403);
        const actor:OAuthActor=value?{tenant:value.tenant,subject:value.subject}:{tenant:'_relay',subject:'invalid'};
        const scoped:OAuthVault={get:key=>deps.vault.get(actor.subject+':'+key),insert:(key,text)=>deps.vault.insert(actor.subject+':'+key,text),entries:async prefix=>(await deps.vault.entries(actor.subject+':'+prefix)).map(row=>({key:row.key.slice(actor.subject.length+1),value:row.value}))};
        const existing=providerOAuthVault(scoped,deps.cipher,actor,now);
        const store={...existing.store,save:async(_actor:OAuthActor,authorization:OAuthAuthorization)=>{
            if(!value||authorization.provider!==value.provider)throw Error('relay_refused');
            await deps.verify(value.target,authorization);
            const ticket=token();if(!await deps.vault.insert('ticket:'+ticket,await seal({session:value.subject,authorization,target:value.target,proof:value.proof,exp:Math.min(value.exp,now()+120000)})))throw Error('relay_refused');return ticket;
        }};
        const response=await createProviderOAuth({origin:deps.origin,clients:deps.clients,store,fetch:deps.fetch,now,authorize:async request=>{const current=await session(request);return current?{tenant:current.tenant,subject:current.subject}:null;}}).fetch(c.req.raw);
        if(response.ok&&path.endsWith('/finish')){const result=await response.json();return Response.json({...result,returnPath:'/complete?ticket='+encodeURIComponent(result.accountId)},{headers:response.headers});}
        return response;
    });
    app.onError((_error,c)=>c.json({error:'relay_connection_failed'},409));return app;
}
