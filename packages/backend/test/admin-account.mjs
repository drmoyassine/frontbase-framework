
import assert from 'node:assert/strict';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import { createResolvePrincipal, hashPassword, sqliteRunner } from '@frontbase/edge-infra';

const db = sqliteRunner(':memory:');
const origin = 'https://account.example.test';
const sessionSecret = 'fixture-admin-account-secret-0123456789';
const delivered = [];
let resetMail;
const users = tenant => new UserStore(db,tenant);
const first = 'fixture-original-password';
const replacement = 'fixture-replacement-password';
const oldEmail = 'owner@example.test';
const newEmail = 'next@example.test';
const now = () => new Date().toISOString();
try {
    await migrateUp(db);
    const user = await users('alpha').createUser({email:oldEmail,passwordHash:await hashPassword(first),role:'owner',now:now()});
    const other = await users('beta').createUser({email:'other@example.test',passwordHash:await hashPassword(first),role:'tenant_admin',now:now()});
    const app = await createCompatApp({makeRunner:()=>db,userStoreFor:users,sessionSecret,adminPasskeyOrigin:origin,
        resolvePrincipal:createResolvePrincipal({jwtSecret:sessionSecret,jwtCookie:'frontbase_session'}),
        passwordResetDelivery:async (email,token)=>{resetMail={email,token};},
        accountMail:{
            verifyAddress:async (email,code)=>delivered.push({email,code}),
            notifyOldAddress:async email=>delivered.push({email,notice:true}),
        }});
    const req = (path,body,cookie,requestOrigin=origin) => app.request(origin+path,{
        method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{origin:requestOrigin,'content-type':'application/json'})},
        body:body===undefined?undefined:JSON.stringify(body),
    });
    async function login(email,password) {
        const r=await req('/api/auth/login',{email,password});
        assert.equal(r.status,200,await r.clone().text());
        return r.headers.get('set-cookie').split(';')[0];
    }
    assert.equal((await req('/api/account/')).status,401);
    const session=await login(oldEmail,first);
    const otherSession=await login('other@example.test',first);
    assert.deepEqual(await (await req('/api/account/',undefined,session)).json(),{email:oldEmail,changePassword:true,changeEmail:true});
    assert.equal((await req('/api/account/password/',{currentPassword:first,newPassword:replacement},session,'https://foreign.example')).status,403);
    assert.equal((await req('/api/account/password/',{currentPassword:'wrong',newPassword:replacement},session)).status,403);
    const pw=await req('/api/account/password/',{currentPassword:first,newPassword:replacement},session);
    assert.equal(pw.status,200,await pw.clone().text());
    assert.equal((await req('/api/account/',undefined,session)).status,401);
    assert.equal((await req('/api/account/',undefined,otherSession)).status,200);
    assert.equal((await req('/api/auth/login',{email:oldEmail,password:first})).status,401);
    const current=await login(oldEmail,replacement);
    const start=await req('/api/account/email/',{newEmail,currentPassword:replacement},current);
    assert.equal(start.status,200,await start.clone().text());
    assert.equal((await users('alpha').findById(user.id)).email,oldEmail);
    assert.equal(delivered[0].email,newEmail);
    const code=delivered[0].code;
    assert.ok(!(await db.query('SELECT value FROM settings WHERE tenant_slug=?',['alpha'])).some(row=>String(row.value).includes(code)));
    assert.equal((await req('/api/account/email/confirm/',{code,currentPassword:first},otherSession)).status,409);
    const changed=await req('/api/account/email/confirm/',{code,currentPassword:replacement},current);
    assert.equal(changed.status,200,await changed.clone().text());
    assert.equal(delivered.at(-1).email,oldEmail);
    assert.equal((await req('/api/account/',undefined,current)).status,401);
    assert.equal((await users('alpha').findById(user.id)).email,newEmail);
    assert.equal((await users('beta').findById(other.id)).email,'other@example.test');
    const renewed=await login(newEmail,replacement);
    assert.equal((await req('/api/account/email/confirm/',{code,currentPassword:replacement},renewed)).status,409);
    const passkeys=await req('/api/account/passkeys/',undefined,renewed);
    assert.equal(passkeys.status,200,await passkeys.clone().text());
    assert.deepEqual(await passkeys.json(),{enabled:true,passkeys:[]});
    const options=await req('/api/account/passkeys/options/',{name:'Test key',password:replacement},renewed);
    assert.equal(options.status,200,await options.clone().text());
    const cookie=options.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await options.json()).authenticatorSelection).residentKey,'required');
    assert.equal((await req('/api/passkeys/verify/',{id:'forged',response:{}},cookie)).status,400);
    assert.equal((await req('/api/passkeys/verify/',{id:'forged',response:{}},cookie)).status,400);
    assert.equal((await req('/api/account/passkeys/options/',{name:'Test key',password:replacement})).status,401);
    assert.equal((await req('/api/auth/forgot-password',{email:newEmail})).status,200);
    assert.equal(resetMail.email,newEmail);
    const recovered='fixture-recovered-password';
    const reset=await req('/api/auth/reset-password',{email:newEmail,token:resetMail.token,password:recovered});
    assert.equal(reset.status,200,await reset.clone().text());
    assert.equal((await req('/api/auth/reset-password',{email:newEmail,token:resetMail.token,password:first})).status,400);
    assert.equal((await req('/api/account/',undefined,renewed)).status,401);
    assert.match(await login(newEmail,recovered),/^frontbase_session=/);
    console.log('Administrator account: credential change, email verification, recovery, session invalidation and passkey challenge fences passed');
} finally { db.close(); }
