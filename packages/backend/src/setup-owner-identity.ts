/** Identity-only recovery for an existing Vercel Integration installation.
 * Reuses the encrypted relay vault and enrolled receiver; never returns or saves
 * the identity provider's access/id/refresh tokens as management authorization. */
import {Hono} from 'hono';
import {createRemoteJWKSet,customFetch,jwtVerify} from 'jose';
import type {SecretCipher} from './db/secret-cipher.js';
import type {OAuthActor} from './provider-oauth.js';
import type {OAuthRelayTarget,OAuthRelayVault} from './provider-oauth-relay.js';
export interface SetupOwnerIdentity {provider:'vercel';subject:string;issuedAt:number;expiresAt:number;}
interface RelayDeps {
    origin:string;clientId:string;clientSecret?:string;cipher:SecretCipher;vault:OAuthRelayVault;fetch:typeof fetch;now?:()=>number;
    admit(target:OAuthRelayTarget,provider:'vercel'):boolean;
    verifyReceiver(target:OAuthRelayTarget,proof:string):Promise<boolean>;
}
const base='/setup-owner/vercel',callback=base+'/callback',cookie='__Host-fb_setup_owner';
const valid=(s:unknown):s is string=>typeof s==='string'&&/^[\w-]{43}$/.test(s);
const random=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hash=async(value:string)=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const canonical=(v:unknown)=>JSON.stringify(v);
function refuse():never{throw Error('setup_identity_refused');}
async function json(value:Request|Response,max=65536){const reader=value.body?.getReader();if(!reader)refuse();let size=0,text='';const decoder=new TextDecoder();try{for(;;){const p=await reader!.read();if(p.done)break;size+=p.value.length;if(size>max)refuse();text+=decoder.decode(p.value,{stream:true});}}finally{await reader!.cancel().catch(()=>{});}return JSON.parse(text+decoder.decode());}
function cookieValue(request:Request,name:string){const values=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));return values.length===1?values[0]!.slice(name.length+1):null;}
export function createSetupOwnerIdentityRelay(deps:RelayDeps){
    if(new URL(deps.origin).origin!==deps.origin||!deps.origin.startsWith('https://')||!deps.clientId)throw Error('invalid_setup_identity');
    const app=new Hono(),now=deps.now??Date.now,redirectUri=deps.origin+callback;
    const seal=async(value:unknown)=>{const encrypted=await deps.cipher.encrypt(JSON.stringify(value));if(!deps.cipher.isEncrypted(encrypted))refuse();return encrypted;};
    const read=async(raw:string)=>{if(!deps.cipher.isEncrypted(raw)||raw.length>16384)refuse();return JSON.parse(await deps.cipher.decrypt(raw));};
    const permitted=async(target:OAuthRelayTarget,proof:string)=>target?.host==='vercel'&&target.purpose==='connect'&&Object.keys(target).sort().join(',')==='host,origin,purpose'&&deps.admit(target,'vercel')&&await deps.verifyReceiver(target,proof);
    async function session(request:Request){const raw=cookieValue(request,cookie);if(!raw)refuse();const s=await read(decodeURIComponent(raw!));if(!valid(s.session)||!valid(s.proof)||!valid(s.challenge)||s.exp<=now()||s.exp>now()+600000||!await permitted(s.target,s.proof))refuse();return s;}
    const jwks=createRemoteJWKSet(new URL('https://vercel.com/.well-known/jwks'),{timeoutDuration:15000,[customFetch]:async(input,init)=>{
        if(String(input)!=='https://vercel.com/.well-known/jwks')refuse();const response=await deps.fetch(input,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)refuse();return Response.json(await json(response));
    }});
    app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");if(new URL(c.req.url).origin!==deps.origin)refuse();await deps.vault.purge();return next();});
    app.get(base+'/status',c=>c.json({available:true}));
    app.get(base,async c=>{
        const u=new URL(c.req.url);if(u.href.length>4096)refuse();let target:OAuthRelayTarget;try{target=JSON.parse(u.searchParams.get('target')??'null');}catch{return refuse();}
        const proof=u.searchParams.get('receiver'),challenge=u.searchParams.get('challenge');if(!valid(proof)||!valid(challenge)||!await permitted(target,proof))refuse();
        const s={session:random(),target,proof,challenge,exp:now()+600000};c.header('Set-Cookie',cookie+'='+encodeURIComponent(await seal(s))+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
        return c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renew Frontbase setup</title></head><body><h1>Renew setup access</h1><p>Sign in with Vercel. Frontbase will verify that you own the deployment’s team before reopening its existing setup. No deployment permissions are requested.</p><button id="continue">Continue to Vercel</button><p id="status" role="status"></p><script src="'+base+'/start.js"></script></body></html>');
    });
    app.get(base+'/start.js',c=>c.body("document.getElementById('continue').addEventListener('click',async()=>{const b=document.getElementById('continue');b.disabled=true;try{const r=await fetch('"+base+"/start',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw Error();location.assign((await r.json()).url);}catch{document.getElementById('status').textContent='This recovery session is unavailable. Return to the installation and renew setup access again.';}});",200,{'content-type':'text/javascript'}));
    app.post(base+'/start',async c=>{
        if(c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json'||Object.keys(await json(c.req.raw,64)).length)refuse();const s=await session(c.req.raw);
        const state=random(),nonce=random(),verifier=random();if(!await deps.vault.insert('owner-state:'+await hash(state),await seal({...s,state,nonce,verifier})))refuse();
        c.header('Set-Cookie',cookie+'='+encodeURIComponent(await seal({...s,state}))+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
        const u=new URL('https://vercel.com/oauth/authorize');for(const [key,value]of Object.entries({client_id:deps.clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid',state,nonce,code_challenge:await hash(verifier),code_challenge_method:'S256'}))u.searchParams.set(key,value);return c.json({url:u.href});
    });
    app.get(callback,c=>c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify setup owner</title></head><body><p id="status" role="status">Verifying deployment ownership…</p><script src="'+base+'/callback.js"></script></body></html>'));
    app.get(base+'/callback.js',c=>c.body("const u=new URL(location.href),code=u.searchParams.get('code'),state=u.searchParams.get('state');history.replaceState(null,'',u.pathname);fetch('"+base+"/finish',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({code,state})}).then(async r=>{if(!r.ok)throw Error();location.replace((await r.json()).returnPath);}).catch(()=>{document.getElementById('status').textContent='Vercel sign-in could not be verified. Return to your installation and renew setup access; no provisioning was repeated.';});",200,{'content-type':'text/javascript'}));
    app.post(base+'/finish',async c=>{
        if(c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json')refuse();const input=await json(c.req.raw,8192),s=await session(c.req.raw);
        if(Object.keys(input).sort().join(',')!=='code,state'||!valid(input.state)||input.state!==s.state||typeof input.code!=='string'||!input.code||input.code.length>4096)refuse();
        const key='owner-state:'+await hash(input.state),raw=await deps.vault.get(key);if(!raw)refuse();const pending=await read(raw!);
        if(pending.state!==input.state||pending.session!==s.session||pending.proof!==s.proof||pending.challenge!==s.challenge||canonical(pending.target)!==canonical(s.target)||pending.exp<=now()||!await deps.vault.take(key,raw!))refuse();
        const response=await deps.fetch('https://api.vercel.com/login/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:deps.clientId,...(deps.clientSecret?{client_secret:deps.clientSecret}:{}),redirect_uri:redirectUri,code:input.code,code_verifier:pending.verifier}).toString(),redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)refuse();const tokens=await json(response);
        if(typeof tokens.id_token!=='string'||tokens.id_token.length>16384||typeof tokens.access_token!=='string'||!tokens.access_token||tokens.access_token.length>16384||String(tokens.token_type).toLowerCase()!=='bearer')refuse();
        const {payload}=await jwtVerify(tokens.id_token,jwks,{issuer:'https://vercel.com',audience:deps.clientId,algorithms:['RS256'],requiredClaims:['sub','iat','exp','nonce'],maxTokenAge:300,clockTolerance:30,currentDate:new Date(now())});
        if(payload.nonce!==pending.nonce||Array.isArray(payload.aud)||typeof payload.sub!=='string'||!/^[-\w]{1,128}$/.test(payload.sub)||Number(payload.iat)*1000>now()+30000)refuse();
        const identity:SetupOwnerIdentity={provider:'vercel',subject:payload.sub,issuedAt:now(),expiresAt:Math.min(now()+120000,Number(payload.exp)*1000)};if(identity.expiresAt<=now())refuse();
        const ticket=random();if(!await deps.vault.insert('ticket:owner:'+ticket,await seal({identity,target:s.target,proof:s.proof,challenge:s.challenge,exp:identity.expiresAt})))refuse();
        c.header('Set-Cookie',cookie+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return c.json({returnPath:s.target.origin+'/api/provider-oauth/vercel/owner-callback?ticket='+ticket});
    });
    app.post(base+'/ticket',async c=>{
        if(c.req.header('origin')||c.req.header('content-type')?.split(';')[0]!=='application/json')refuse();const input=await json(c.req.raw,2048);if(Object.keys(input).sort().join(',')!=='origin,ticket,verifier'||!valid(input.ticket)||!valid(input.verifier))refuse();
        const key='ticket:owner:'+input.ticket,raw=await deps.vault.get(key);if(!raw)refuse();const record=await read(raw!);
        if(record.exp<=now()||record.exp>now()+120000||record.target.origin!==input.origin||record.challenge!==await hash(input.verifier)||!await permitted(record.target,record.proof)||!await deps.vault.take(key,raw!))refuse();
        return c.json({identity:record.identity,target:record.target});
    });
    app.onError((_error,c)=>c.json({error:'setup_identity_refused',message:'Setup owner sign-in could not be verified. Return to the installation and renew setup access; no provisioning was repeated.'},409));return app;
}

/** The installation consumes only a relay-verified identity, never an ID token.
 * The caller still proves current team OWNER and exact project/claim ownership. */
export function createSetupOwnerIdentityClient(deps:{origin:string;relayOrigin:string;target:OAuthRelayTarget;registrationKey:string;cipher:SecretCipher;fetch:typeof fetch;now?:()=>number;authorize(request:Request):Promise<OAuthActor|null>;establish(identity:SetupOwnerIdentity,actor:OAuthActor):Promise<string>}){
    if(new URL(deps.origin).origin!==deps.origin||!deps.origin.startsWith('https://')||new URL(deps.relayOrigin).origin!==deps.relayOrigin||!deps.relayOrigin.startsWith('https://')||deps.target.origin!==deps.origin||deps.target.host!=='vercel'||deps.target.purpose!=='connect'||!valid(deps.registrationKey))throw Error('invalid_setup_identity');
    const app=new Hono(),now=deps.now??Date.now,name='__Host-fb_owner_identity',path='/api/provider-oauth/vercel';
    app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");if(new URL(c.req.url).origin!==deps.origin)refuse();if(c.req.method==='POST'&&(c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json'))refuse();return next();});
    app.post(path+'/owner-start',async c=>{
        if(Object.keys(await json(c.req.raw,64)).length)refuse();const actor=await deps.authorize(c.req.raw);if(!actor)refuse();const verifier=random(),pending={actor,verifier,target:deps.target,expires:now()+600000},encrypted=await deps.cipher.encrypt(JSON.stringify(pending));if(!deps.cipher.isEncrypted(encrypted)||encrypted.length>4096)refuse();
        c.header('Set-Cookie',name+'='+encodeURIComponent(encrypted)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');const u=new URL(base,deps.relayOrigin);u.searchParams.set('target',JSON.stringify(deps.target));u.searchParams.set('receiver',await hash(deps.registrationKey));u.searchParams.set('challenge',await hash(verifier));return c.json({url:u.href});
    });
    app.get(path+'/owner-callback',c=>c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renew setup access</title></head><body><p id="status" role="status">Confirming setup access…</p><script src="'+path+'/owner-callback.js"></script></body></html>'));
    app.get(path+'/owner-callback.js',c=>c.body("const u=new URL(location.href),ticket=u.searchParams.get('ticket');history.replaceState(null,'',u.pathname);fetch('"+path+"/owner-finish',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({ticket})}).then(async r=>{const o=await r.json();if(!r.ok)throw Error(o.message);location.replace(o.returnPath);}).catch(e=>{document.getElementById('status').textContent=e.message||'Setup recovery could not be confirmed. Return to the installation; no provisioning was repeated.';});",200,{'content-type':'text/javascript'}));
    app.post(path+'/owner-finish',async c=>{
        const input=await json(c.req.raw,1024);if(Object.keys(input).join(',')!=='ticket'||!valid(input.ticket))refuse();const raw=cookieValue(c.req.raw,name);if(!raw)refuse();const encrypted=decodeURIComponent(raw!);if(!deps.cipher.isEncrypted(encrypted)||encrypted.length>4096)refuse();const pending=JSON.parse(await deps.cipher.decrypt(encrypted)),actor=await deps.authorize(c.req.raw);
        if(!actor||canonical(actor)!==canonical(pending.actor)||canonical(pending.target)!==canonical(deps.target)||pending.expires<=now()||pending.expires>now()+600000||!valid(pending.verifier))refuse();
        const response=await deps.fetch(deps.relayOrigin+base+'/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket:input.ticket,verifier:pending.verifier,origin:deps.origin}),redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)refuse();const result=await json(response),identity=result.identity as SetupOwnerIdentity;
        if(canonical(result.target)!==canonical(deps.target)||!identity||identity.provider!=='vercel'||typeof identity.subject!=='string'||!/^[-\w]{1,128}$/.test(identity.subject)||!Number.isFinite(identity.issuedAt)||!Number.isFinite(identity.expiresAt)||identity.issuedAt>now()+30000||identity.issuedAt<now()-120000||identity.expiresAt<=now()||identity.expiresAt>now()+120000)refuse();
        const returnPath=await deps.establish(identity,actor);if(!returnPath.startsWith('/frontbase-bootstrap/#claim='))refuse();c.header('Set-Cookie',name+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return c.json({returnPath});
    });
    app.onError((error,c)=>{const messages:Record<string,string>={setup_ownership_refused:'Sign in with an owner of the Vercel team that hosts this deployment. No provisioning was repeated.',setup_renewal_conflict:'Setup access changed during sign-in. Return to the wizard and check its current status.',setup_operation_held:'An installation operation is pending or uncertain. Inspect its status; recovery cannot repeat provisioning.',setup_already_installed:'This installation is configured. Sign in to Frontbase instead.',setup_access_unconfirmed:'The access update could not be confirmed. Ask the deployment owner to inspect it before another attempt.'};return c.json({error:Object.hasOwn(messages,error.message)?error.message:'setup_identity_refused',message:messages[error.message]??'Setup owner sign-in could not be confirmed. Return to the installation and renew setup access; no provisioning was repeated.'},409);});return app;
}
