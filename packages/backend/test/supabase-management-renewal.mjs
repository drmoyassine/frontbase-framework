import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {createCompatApp} from '../dist/compat/app.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {migrateUp} from '../dist/db/migrations.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
import {providerAuthorizationConfig} from '../dist/provider-oauth-store.js';
import {createProviderOAuthRelay} from '../dist/provider-oauth-relay.js';
import {sqlOAuthRelayVault} from '../dist/provider-oauth-relay-store.js';
import {supabaseManagementConfig} from '../dist/supabase-management-renewal.js';

const db=sqliteRunner(':memory:');await migrateUp(db);
const relayDb=sqliteRunner(':memory:');
const secret='installed-app-secret';
const cipher=await createSecretCipher(secret),storeFor=tenant=>new Phase2Store(db,tenant,cipher);
const origin='https://app.example',relayOrigin='https://relay.example',target={origin,host:'cloudflare',purpose:'connect'};
const registrationKey='r'.repeat(43);
const digest=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');
const proof=await digest(registrationKey);
const client={provider:'supabase',clientId:'relay-client',clientSecret:'server-only-client-secret',scopes:[],
 redirectUri:relayOrigin+'/api/provider-oauth/supabase/callback'};
let time=Date.parse('2026-11-17T12:00:00Z'),rotations=0,reads=0,tenant='owner',permits=true;
const installed={provider:'supabase',accessToken:'old-access',refreshToken:'old-refresh',expiresAt:time-1,
 scopes:['projects:read'],accounts:[{id:'fixture-organization',name:'Fixture'}]};
const now=()=>new Date(time).toISOString();
const save=async(tenant,id,authorization)=>storeFor(tenant).upsertEdgeResource({id,provider:'supabase',kind:'provider',name:'Fixture',
 config:JSON.stringify({...providerAuthorizationConfig(authorization),supabase_project_credentials:{fixture:{service_role_key:'retained-key'}}})},now());
await save(tenant,'existing-account',installed);
const upstream=async(input,init)=>{
 const url=new URL(String(input)),headers=new Headers(init?.headers);
 if(url.pathname.endsWith('/oauth/token')){
    assert.equal(headers.get('authorization'),'Basic '+btoa('relay-client:server-only-client-secret'));
    const body=new URLSearchParams(init.body);
    assert.equal(body.get('grant_type'),'refresh_token');
    assert.equal(body.get('refresh_token'),rotations===0?'old-refresh':'refresh-'+rotations);
    assert.equal(body.get('client_secret'),null);
    await new Promise(resolve=>setTimeout(resolve,50));
    rotations++;
    return Response.json({access_token:'access-'+rotations,refresh_token:'refresh-'+rotations,token_type:'Bearer',expires_in:3600});
 }
 assert.equal(url.pathname,'/v1/projects');
 reads++;
 if(!permits||headers.get('authorization')!=='Bearer access-'+rotations)return Response.json({}, {status:401});
 return Response.json([{id:'fixture',ref:'fixture',name:'Fixture Supabase project',organization_id:'fixture-organization'}]);
};
const relay=createProviderOAuthRelay({origin:relayOrigin,clients:{supabase:client},cipher:await createSecretCipher('relay-secret'),
 vault:await sqlOAuthRelayVault(relayDb,()=>time),fetch:upstream,now:()=>time,admit:t=>t?.origin===origin&&t.host===target.host,
 verify:async()=>{},verifyReceiver:async(t,value)=>t.origin===origin&&value===proof});
const relayRequest=(body,headers={})=>relay.request(relayOrigin+'/supabase/refresh',{method:'POST',
 headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
const request={target,verifier:registrationKey,refreshToken:'old-refresh'};
for(const [body,headers] of [[{...request,verifier:'z'.repeat(43)},{}],[request,{origin}],[request,{cookie:'session=x'}],
 [{...request,target:{...target,origin:'https://foreign.example'}},{}]]){
 assert.equal((await relayRequest(body,headers)).status,403);
}
assert.equal(rotations,0);

const externalFetch=(url,init)=>String(url).startsWith(relayOrigin+'/')?relay.fetch(new Request(url,init)):upstream(url,init);
const options={makeRunner:async()=>db,sessionSecret:secret,externalFetch,now,
 resolvePrincipal:async()=>({tenant,user:{id:'admin',role:'owner'}}),
 providerOAuth:{origin,clients:{},relay:{target,relayOrigin,registrationKey}}};
const app=await createCompatApp(options);
const discover=app=>app.request(origin+'/api/edge-providers/discover-by-account/existing-account',{method:'POST'});
const [one,two]=await Promise.all([discover(app),discover(app)]);
for(const response of [one,two]){
 const text=await response.text();const value=JSON.parse(text);
 assert.equal(value.success,true,text);
 assert.match(text,/Fixture Supabase project/);
 assert.doesNotMatch(text,/access-1|refresh-1|retained-key|server-only-client-secret/);
}
assert.equal(rotations,1,'concurrent discovery redeems the rotating token once');
let existing=await storeFor('owner').getEdgeResourceConfig('existing-account');
assert.equal(existing.oauth.refresh_token,'refresh-1');
assert.deepEqual(existing.oauth.scopes,['projects:read']);
assert.equal(existing.supabase_project_credentials.fixture.service_role_key,'retained-key');
assert.equal(existing.supabase_refresh_lease,undefined);
const stored=(await db.query('SELECT config FROM edge_resources WHERE tenant_slug=? AND id=?',['owner','existing-account']))[0].config;
assert.ok(cipher.isEncrypted(stored));
assert.doesNotMatch(stored,/access-1|refresh-1|retained-key/);
tenant='foreign';
assert.equal((await discover(app)).status,404);
assert.equal(rotations,1);

tenant='owner';time+=3601000;
const restarted=await createCompatApp(options);
assert.equal((await (await discover(restarted)).json()).success,true);
assert.equal(rotations,2,'a fresh application instance uses the rotated grant');
existing=await storeFor(tenant).getEdgeResourceConfig('existing-account');
assert.equal(existing.oauth.refresh_token,'refresh-2');

const local=supabaseManagementConfig(storeFor,{client,fetch:upstream,now});
time+=3601000;
assert.equal((await local(tenant,'existing-account')).access_token,'access-3','operator-owned OAuth client can refresh directly');
assert.equal(rotations,3);
assert.ok(reads>=3);
await db.close?.();await relayDb.close?.();
console.log('Supabase management renewal: installed discovery, concurrent rotation, encrypted readback, restart, existing account ID, relay admission and direct client PASS');
