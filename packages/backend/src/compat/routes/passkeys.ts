import { bodyLimit } from 'hono/body-limit';
import { accountReauthLimited } from './account.js';

import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { verifyPassword, type DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { UserStore, PublicUser } from '../../db/users.js';

type App = Hono<{Variables:ConsoleAuthVars}>;
type Ctx = Context<{Variables:ConsoleAuthVars}>;
type Deps = {
    db:DbRunner; users:(tenant:string)=>UserStore; now:()=>string; origin:string;
    signIn:(c:Ctx,user:PublicUser,version:number)=>Promise<void>;
};
const roles = new Set(['master_admin','owner','tenant_admin','admin']);
const credential = z.object({
    id:z.string().regex(/^[A-Za-z0-9_-]{1,1024}$/),publicKey:z.array(z.number().int().min(0).max(255)).max(4096),
    counter:z.number().int().nonnegative(), userId:z.string(), tenant:z.string(), origin:z.string(),
    handle:z.string(), name:z.string(), createdAt:z.string(),
}).strict();
const challenge = z.object({challenge:z.string(),expires:z.string(),userId:z.string().optional(),tenant:z.string().optional(),version:z.number().optional()}).strict();
const enrollment = z.object({password:z.string().min(1).max(256),name:z.string().trim().min(1).max(80)}).strict();
const encoded = z.string().min(1).max(16384).regex(/^[A-Za-z0-9_-]+$/);
const envelope = z.object({id:credential.shape.id,rawId:credential.shape.id,type:z.literal('public-key'),clientExtensionResults:z.object({})});
const assertion = envelope.extend({response:z.object({clientDataJSON:encoded,authenticatorData:encoded,signature:encoded,userHandle:encoded})});
const attestation = envelope.extend({response:z.object({clientDataJSON:encoded,attestationObject:encoded})});
const namespace = '_global';
const credentialKey = (id:string) => 'admin_passkey:v1:'+id;
const challengeCookie = '__Host-frontbase-passkey';
const challengePattern = 'admin!_passkey!_challenge:v1:%';
const cookie = (value:string,seconds:number) => challengeCookie+'='+value+'; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age='+seconds;
const readCookie = (c:Ctx) => c.req.header('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(challengeCookie+'='))?.split('=')[1] ?? '';
function parse(value:unknown) { try { return typeof value==='string' ? JSON.parse(value) : null; } catch { return null; } }
const bad = {detail:'The passkey could not be verified. Start again or use your password.'};

export function registerPasskeyRoutes(app:App,deps:Deps,phase:'public'|'account') {
    let target:URL;
    try { target = new URL(deps.origin); } catch { return; }
    if(target.protocol !== 'https:' || target.origin !== deps.origin) return;
    const {db,users,now}=deps;
    const atomic = db.atomicWrite?.bind(db) ?? (db.transaction ? async (statements:ReadonlyArray<{sql:string;params?:unknown[]}>) =>
        db.transaction!(async runner=>{for(const {sql,params} of statements)await runner.exec(sql,params);}) : undefined);
    if(!atomic)return;
    const rpID=target.hostname;
    const key = (id:string) => 'admin_passkey_challenge:v1:'+id;
    const permitted = (c:Ctx) => new URL(c.req.url).origin===target.origin && c.req.header('origin')===target.origin
        && c.req.header('content-type')?.split(';')[0]==='application/json' && c.req.header('sec-fetch-site')!=='cross-site';
    // Five-minute browser challenges. Reuse the cookie slot for sequential retries.
    const begin = async (c:Ctx,value:Omit<z.infer<typeof challenge>,'expires'> & {name?:string}) => {
        const prior=readCookie(c);
        const id=/^[a-f0-9-]{36}$/.test(prior)?prior:crypto.randomUUID();
        const time=now();
        await db.exec('DELETE FROM settings WHERE tenant_slug=? AND key LIKE ? ESCAPE ? AND updated_at<=?',[namespace,challengePattern,'!',new Date(Date.parse(time)-300000).toISOString()]);
        const count=await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM settings WHERE tenant_slug=? AND key=?) OR (SELECT COUNT(*) FROM settings WHERE tenant_slug=? AND key LIKE ? ESCAPE ?)<256 ON CONFLICT(tenant_slug,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
            [namespace,key(id),JSON.stringify({...value,expires:new Date(Date.parse(time)+300000).toISOString()}),time,namespace,key(id),namespace,challengePattern,'!']);
        if(count!==1)return false;
        c.header('Set-Cookie',cookie(id,300));
        return true;
    };
    const consume = async (c:Ctx) => {
        const id=readCookie(c);
        if(!/^[a-f0-9-]{36}$/.test(id))return null;
        const rows=await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[namespace,key(id)]);
        const raw=rows[0]?.value;
        const pending=challenge.extend({name:z.string().optional()}).safeParse(parse(raw));
        if(!pending.success || pending.data.expires<=now())return null;
        if(await db.exec('DELETE FROM settings WHERE tenant_slug=? AND key=? AND value=?',[namespace,key(id),raw])!==1)return null;
        c.header('Set-Cookie',cookie('',0));
        return pending.data;
    };
    const account = async(c:Ctx) => {
        const user=c.get('principal').user as {id?:string;sub?:string};
        const id=user.id??user.sub;
        const row=id?await users(c.get('tenant')).findByIdForVerify(id):null;
        return row && roles.has(row.role) && row.passwordHash!=='supabase-managed' ? row : null;
    };
    const ownerPrefix='admin_passkey_owner:v1:';
    const ownerListKey=(id:string)=>ownerPrefix+id;
    const ownership=(owner:string)=>ownerListKey(owner).replace(/!/g,'!!').replace(/_/g,'!_').replace(/%/g,'!%')+':%';
    const handle = async(id:string,tenant:string) => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([target.origin,tenant,id]))));
    const limitBody=bodyLimit({maxSize:32768,onError:c=>c.json(bad,413)});
    if(phase==='public'){
        app.use('/api/passkeys/*',limitBody);
        app.get('/api/passkeys/availability/',c=>{c.header('Cache-Control','no-store');return c.json({enabled:new URL(c.req.url).origin===target.origin});});
        app.post('/api/passkeys/options/',async c=>{
            c.header('Cache-Control','no-store');
            if(!permitted(c))return c.json(bad,403);
            const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
            const options=await generateAuthenticationOptions({rpID,userVerification:'required'});
            if(!await begin(c,{challenge:options.challenge}))return c.json({detail:'Passkey sign-in is busy. Try again or use your password.'},429);
            return c.json(options);
        });
        app.post('/api/passkeys/verify/',async c=>{
            c.header('Cache-Control','no-store');
            if(!permitted(c))return c.json(bad,403);
            const input=assertion.safeParse(await c.req.json().catch(()=>null));
            const pending=await consume(c);
            if(!input.success||!pending||pending.userId)return c.json(bad,400);
            const raw=(await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[namespace,credentialKey(input.data.id)]))[0]?.value;
            const saved=credential.safeParse(parse(raw));
            if(!saved.success||saved.data.origin!==target.origin)return c.json(bad,400);
            const passkey=saved.data;
            if(input.data.response.userHandle!==passkey.handle)return c.json(bad,400);
            const user=await users(passkey.tenant).findByIdForVerify(passkey.userId);
            if(!user||!roles.has(user.role)||user.passwordHash==='supabase-managed')return c.json(bad,400);
            // Read the session generation before verification to avoid reissuing a session
            // at the new generation if a password reset completes during this request.
            const version=await users(user.tenantSlug).getSessionVersion(user.id);
            try{
                const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
                const result=await verifyAuthenticationResponse({response:input.data,expectedChallenge:pending.challenge,
                    expectedOrigin:target.origin,expectedRPID:rpID,requireUserVerification:true,
                    credential:{id:passkey.id,publicKey:Uint8Array.from(passkey.publicKey),counter:passkey.counter}});
                if(!result.verified)return c.json(bad,400);
                if(await db.exec('UPDATE settings SET value=?,updated_at=? WHERE tenant_slug=? AND key=? AND value=?',
                    [JSON.stringify({...passkey,counter:result.authenticationInfo.newCounter}),now(),namespace,credentialKey(passkey.id),raw])!==1)return c.json(bad,409);
                await deps.signIn(c,user,version);
                return c.json({success:true});
            }catch{return c.json(bad,400);}
        });
        return;
    }
    app.use('/api/account/passkeys/*',limitBody);
    app.get('/api/account/passkeys/',async c=>{
        c.header('Cache-Control','no-store');
        const user=await account(c);
        if(!user||new URL(c.req.url).origin!==target.origin)return c.json({enabled:false,passkeys:[]});
        const byOwner=await db.query('SELECT key FROM settings WHERE tenant_slug=? AND key LIKE ? ESCAPE ?',[user.tenantSlug,ownership(user.id),'!']);
        const passkeys=[];
        for(const {key:ownerKey} of byOwner){
            const id=String(ownerKey).slice(ownerListKey(user.id).length+1);
            const [row]=await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[namespace,credentialKey(id)]);
            const data=credential.safeParse(parse(row?.value));
            if(data.success&&data.data.userId===user.id&&data.data.tenant===user.tenantSlug&&data.data.origin===target.origin){
                const {name,createdAt}=data.data;passkeys.push({id,name,createdAt});
            }
        }
        return c.json({enabled:true,passkeys});
    });
    app.post('/api/account/passkeys/options/',async c=>{
        c.header('Cache-Control','no-store');
        if(!permitted(c))return c.json(bad,403);
        const user=await account(c),input=enrollment.safeParse(await c.req.json().catch(()=>null));
        if(!user||!input.success)return c.json(bad,403);
        if(await accountReauthLimited(db,now,user.tenantSlug,user.id))return c.json({detail:'Too many verification attempts. Try again in ten minutes.'},429);
        const version=await users(user.tenantSlug).getSessionVersion(user.id);
        if(!await verifyPassword(input.data.password,user.passwordHash))return c.json({detail:'The current password is incorrect.'},403);
        const ids=await db.query('SELECT key FROM settings WHERE tenant_slug=? AND key LIKE ? ESCAPE ? LIMIT 10',[user.tenantSlug,ownership(user.id),'!']);
        if(ids.length>=10)return c.json({detail:'Remove a passkey before adding another.'},409);
        const { generateRegistrationOptions } = await import('@simplewebauthn/server');
        const options=await generateRegistrationOptions({rpName:'Frontbase',rpID,userName:user.email,userID:await handle(user.id,user.tenantSlug),
            excludeCredentials:ids.map(row=>({id:String(row.key).slice(ownerListKey(user.id).length+1)})),
            attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},supportedAlgorithmIDs:[-7,-257]});
        if(!await begin(c,{challenge:options.challenge,userId:user.id,tenant:user.tenantSlug,version,name:input.data.name}))return c.json({detail:'Passkey enrollment is busy. Try again shortly.'},429);
        return c.json(options);
    });
    app.post('/api/account/passkeys/verify/',async c=>{
        c.header('Cache-Control','no-store');
        if(!permitted(c))return c.json(bad,403);
        const user=await account(c),input=attestation.safeParse(await c.req.json().catch(()=>null)),pending=await consume(c);
        if(!user||!input.success||!pending||pending.userId!==user.id||pending.tenant!==user.tenantSlug||!pending.name
            ||pending.version!==await users(user.tenantSlug).getSessionVersion(user.id))return c.json(bad,400);
        try{
            const { verifyRegistrationResponse } = await import('@simplewebauthn/server');
            const result=await verifyRegistrationResponse({response:input.data,expectedChallenge:pending.challenge,
                expectedOrigin:target.origin,expectedRPID:rpID,requireUserVerification:true});
            if(!result.verified||!result.registrationInfo)return c.json(bad,400);
            const registered=result.registrationInfo.credential;
            const data=credential.parse({id:registered.id,publicKey:[...registered.publicKey],counter:registered.counter,userId:user.id,
                tenant:user.tenantSlug,origin:target.origin,handle:encodeHandle(await handle(user.id,user.tenantSlug)),name:pending.name,createdAt:now()});
            const versionGuard='EXISTS(SELECT 1 FROM users WHERE id=? AND tenant_slug=? AND password_hash=? AND COALESCE((SELECT version FROM user_session_versions WHERE user_id=? AND tenant_slug=?),0)=?)';
            const guard=[user.id,user.tenantSlug,user.passwordHash,user.id,user.tenantSlug,pending.version];
            const insert='INSERT INTO settings (tenant_slug,key,value,updated_at) SELECT ?,?,?,? WHERE '+versionGuard;
            await atomic([
                {sql:insert,params:[namespace,credentialKey(data.id),JSON.stringify(data),data.createdAt,...guard]},
                {sql:insert,params:[user.tenantSlug,ownerListKey(user.id)+':'+data.id,'true',data.createdAt,...guard]},
            ]);
            if(!(await db.query('SELECT 1 FROM settings WHERE tenant_slug=? AND key=?',[user.tenantSlug,ownerListKey(user.id)+':'+data.id])).length)return c.json(bad,409);
            return c.json({success:true},201);
        }catch{return c.json(bad,400);}
    });
    app.post('/api/account/passkeys/remove/',async c=>{
        if(!permitted(c))return c.json(bad,403);
        const user=await account(c);
        const input=z.object({id:credential.shape.id,password:enrollment.shape.password}).strict().safeParse(await c.req.json().catch(()=>null));
        if(!user||!input.success)return c.json(bad,403);
        if(await accountReauthLimited(db,now,user.tenantSlug,user.id))return c.json({detail:'Too many verification attempts. Try again in ten minutes.'},429);
        if(!await verifyPassword(input.data.password,user.passwordHash))return c.json({detail:'The current password is incorrect.'},403);
        const id=input.data.id,ownerKey=ownerListKey(user.id)+':'+id;
        const raw=(await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[namespace,credentialKey(id)]))[0]?.value;
        const data=credential.safeParse(parse(raw));
        if(!data.success||data.data.userId!==user.id||data.data.tenant!==user.tenantSlug||data.data.origin!==target.origin)return c.json(bad,404);
        await atomic([
            {sql:'DELETE FROM settings WHERE tenant_slug=? AND key=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND tenant_slug=? AND password_hash=?)',params:[namespace,credentialKey(id),user.id,user.tenantSlug,user.passwordHash]},
            {sql:'DELETE FROM settings WHERE tenant_slug=? AND key=? AND NOT EXISTS(SELECT 1 FROM settings WHERE tenant_slug=? AND key=?)',params:[user.tenantSlug,ownerKey,namespace,credentialKey(id)]},
        ]);
        if((await db.query('SELECT 1 FROM settings WHERE tenant_slug=? AND key=?',[namespace,credentialKey(id)])).length)return c.json(bad,409);
        return c.json({success:true});
    });

}

function encodeHandle(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
