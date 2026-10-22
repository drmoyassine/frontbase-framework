import assert from 'node:assert/strict';
import {sqliteRunner,hashPassword,createResolvePrincipal} from '@frontbase/edge-infra';
import {createCompatApp} from '../dist/compat/app.js';
import {migrateUp} from '../dist/db/migrations.js';
import {UserStore} from '../dist/db/users.js';
import {createResendPasswordResetDelivery,passwordResetLink} from '../dist/compat/email/resend.js';
const secret='selfhost-reset-fixture-secret-0123456789',email='owner@example.com',password='Synthetic-original-1!';
const runner=sqliteRunner(':memory:');await migrateUp(runner);let time='2026-10-23T00:00:00Z',message=null,calls=0,fail=false;
const delivery=createResendPasswordResetDelivery({apiKey:'synthetic-fixture-key',from:'Frontbase <sender@example.com>',baseUrl:'https://selfhost.example',adminPath:'/frontbase-admin/reset-password',fetchImpl:async(input,init)=>{calls++;assert.equal(String(input),'https://api.resend.com/emails');assert.equal(init.redirect,'manual');assert.ok(init.signal instanceof AbortSignal);message=JSON.parse(init.body);if(fail)throw Error('PRIVATE_PROVIDER_CAUSE');return Response.json({id:'accepted-synthetic'});}});
const users=t=>new UserStore(runner,t);await users('_root').createUser({id:'owner',email,passwordHash:await hashPassword(password),role:'owner',now:time});
const app=await createCompatApp({makeRunner:()=>runner,userStoreFor:users,sessionSecret:secret,resolvePrincipal:createResolvePrincipal({jwtSecret:secret,jwtCookie:'frontbase_session'}),now:()=>time,passwordResetDelivery:delivery});
const request=(path,body,cookie)=>app.request(path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(cookie?{cookie}:{}),host:'attacker.invalid'},...(body?{body:JSON.stringify(body)}:{})});
const forgot=address=>request('/api/auth/forgot-password',{email:address}),reset=(token,value='Synthetic-replacement-2!')=>request('/api/auth/reset-password',{email,token,password:value});
const token=()=>new URL(message.html.match(/href="([^"]+)"/)[1]).searchParams.get('token');
try{
 const login=await request('/api/auth/login',{email,password});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const known=await forgot(email),unknown=await forgot('unknown@example.com');assert.deepEqual(await known.json(),await unknown.json());assert.equal(calls,1);assert.equal(message.from,'Frontbase <sender@example.com>');assert.ok(message.html.includes('https://selfhost.example/frontbase-admin/reset-password?'));assert.ok(!message.html.includes('attacker.invalid'));
 const first=token(),stored=await runner.query('SELECT token_hash FROM password_reset_tokens WHERE email = ?',[email]);assert.equal(stored.length,1);assert.equal(String(stored[0].token_hash).length,64);assert.ok(!JSON.stringify(stored).includes(first));
 assert.equal((await reset(first)).status,200);assert.equal((await reset(first)).status,400);assert.equal((await request('/api/auth/login',{email,password})).status,401);assert.equal((await request('/api/auth/login',{email,password:'Synthetic-replacement-2!'})).status,200);assert.equal((await request('/api/auth/me',undefined,cookie)).status,401);
 await forgot(email);const expired=token();time='2026-10-24T00:00:00Z';assert.equal((await reset(expired)).status,400);
 fail=true;const failed=await forgot(email);assert.equal(failed.status,200);assert.ok(!JSON.stringify(await failed.json()).includes('PRIVATE_PROVIDER_CAUSE'));
 for(const url of ['http://selfhost.example','https://user:secret@selfhost.example','https://selfhost.example/other','https://selfhost.example/?x=1'])assert.throws(()=>createResendPasswordResetDelivery({apiKey:'synthetic',baseUrl:url}),/reset_origin_invalid/);
 assert.throws(()=>passwordResetLink('https://selfhost.example',email,'synthetic','//attacker.invalid'),/reset_path_invalid/);
 console.log('selfhost-reset: host-owned console URL, guarded provider acceptance/failure, opaque lookup, hashed/expired/single-use tokens, password change and old-session revocation PASS; inbox delivery not claimed');
}finally{runner.close();}
