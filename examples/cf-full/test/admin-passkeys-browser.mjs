
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createResolvePrincipal,hashPassword,sqliteRunner} from '@frontbase/edge-infra';
import {createCompatApp,UserStore,migrateUp} from '@frontbase/backend';
const origin='https://account.example.test';
const sessionSecret='test-passkeys-session-secret-000000000';
const db=sqliteRunner(':memory:');
const users=tenant=>new UserStore(db,tenant);
let browser;
try {
 await migrateUp(db);
 const password='fixture-admin-password-001!';
 const user=await users('fixture').createUser({email:'owner@example.test',passwordHash:await hashPassword(password),role:'owner',now:new Date().toISOString()});
 const app=await createCompatApp({makeRunner:()=>db,userStoreFor:users,sessionSecret,adminPasskeyOrigin:origin,resolvePrincipal:createResolvePrincipal({jwtSecret:sessionSecret,jwtCookie:'frontbase_session'})});
 browser=await chromium.launch(process.env.BOOKING_TEST_BROWSER ? {channel:process.env.BOOKING_TEST_BROWSER} : {});
 const page=await browser.newPage();
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('WebAuthn.enable');
 const firstAuthenticator=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 const jar=new Map();
 const request=async(path,body,cookie)=> {
  const r=await app.request(origin+path,{method:body===undefined?'GET':'POST',headers:{cookie:cookie??[...jar].map(([k,v])=>k+'='+v).join('; '),...(body===undefined?{}:{origin,'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  for(const header of r.headers.getSetCookie()){
   const [name,value]=header.split(';')[0].split('=');
   if(value)jar.set(name,value);else jar.delete(name);
  }
  return r;
 };
 const json=async(path,body)=>{const r=await request(path,body);assert.ok(r.ok,path+' '+r.status+' '+await r.clone().text());return r.json();};
 await page.route(origin+'/**',route=>route.fulfill({body:'<html><title>Passkey fixture</title></html>',contentType:'text/html'}));
 await page.goto(origin);
 assert.equal((await json('/api/auth/login',{email:user.email,password})).user.id,user.id);
 const register=options=>page.evaluate(async options=>{
    const key=await navigator.credentials.create({publicKey:PublicKeyCredential.parseCreationOptionsFromJSON(options)});
    return key.toJSON();
 },options);
 const get=options=>page.evaluate(async options=>{
    const key=await navigator.credentials.get({publicKey:PublicKeyCredential.parseRequestOptionsFromJSON(options)});
    return key.toJSON();
 },options);
 for(const name of ['First key','Second key']){
    const enrollment=await json('/api/account/passkeys/options/',{name,password});
    if(name==='Second key'){
      await cdp.send('WebAuthn.removeVirtualAuthenticator',firstAuthenticator);
      await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    }
    const proof=await register(enrollment);
    assert.equal((await json('/api/account/passkeys/verify/',proof)).success,true);
    assert.equal((await request('/api/account/passkeys/verify/',proof)).status,400,'enrollment replay must fail');
 }
 const list=await json('/api/account/passkeys/');
 assert.equal(list.passkeys.length,2);
 jar.delete('frontbase_session');
 const options=await json('/api/passkeys/options/',{});
 const challengeCookie='__Host-frontbase-passkey='+jar.get('__Host-frontbase-passkey');
 const proof=await get(options);
 const result=await json('/api/passkeys/verify/',proof);
 assert.equal(result.success,true);
 assert.ok(jar.get('frontbase_session'));
 assert.equal(jar.get('__Host-frontbase-passkey'),undefined);
 assert.equal((await json('/api/account/')).email,user.email);
 assert.equal((await request('/api/passkeys/verify/',proof,challengeCookie)).status,400,'assertion replay must fail');
 await json('/api/account/passkeys/remove/',{id:list.passkeys[0].id,password});
 assert.equal((await json('/api/account/passkeys/')).passkeys.length,1);
 jar.clear();
 assert.equal((await json('/api/auth/login',{email:user.email,password})).user.id,user.id);
 console.log('Chrome passkeys: add two, sign in, reject replay, remove and recover with password passed');
}finally{
 await browser?.close();
 db.close();
}
