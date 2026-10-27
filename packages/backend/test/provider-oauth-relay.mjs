import assert from 'node:assert/strict';import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';import {createSecretCipher} from '../dist/db/secret-cipher.js';
const {createProviderOAuthRelay}=await import(process.env.FRONTBASE_RELAY_TEST_MODULE??'../dist/provider-oauth-relay.js');
const {sqlOAuthRelayVault,sqlOAuthNativeClaims,sqlOAuthNativeReceiver}=await import(process.env.FRONTBASE_RELAY_STORE_TEST_MODULE??'../dist/provider-oauth-relay-store.js');
const {createProviderRelayClient}=await import(process.env.FRONTBASE_RELAY_CLIENT_TEST_MODULE??'../dist/provider-oauth-relay-client.js');
import {publicNativeRelayTargetPolicy} from '../dist/provider-oauth-relay-target.js';
import {providerOAuthStore} from '../dist/provider-oauth-store.js';import {Phase2Store} from '../dist/db/phase2-store.js';
const relayOrigin='https://relay.example',origin='https://installation.example',target={origin,host:'docker',purpose:'connect'};
const db=sqliteRunner(':memory:'),appDB=sqliteRunner(':memory:');await migrateUp(appDB);let clock=Date.now(),verified=0,exchanges=0,refuseOwner=false,establishedKey;
const cipher=await createSecretCipher('relay-vault-fixture-key'),appCipher=await createSecretCipher('installed-app-fixture-key');
const clients={cloudflare:{provider:'cloudflare',clientId:'private-fixture',scopes:['account:read'],redirectUri:relayOrigin+'/api/provider-oauth/cloudflare/callback'}};
const provider=async(url,init)=>{
 assert.equal(init.redirect,'manual');
 if(String(url).endsWith('/token')){exchanges++;const p=new URLSearchParams(init.body);assert.ok(p.get('code_verifier'));return Response.json({access_token:'fixture-sensitive-provider-token',refresh_token:'fixture-sensitive-refresh-token',token_type:'bearer',expires_in:3600});}
 assert.equal(new URL(String(url)).origin,'https://api.cloudflare.com');return Response.json({success:true,result:[{id:'a'.repeat(32),name:'Isolated account'}]});
};
const deps={origin:relayOrigin,clients,cipher,vault:await sqlOAuthRelayVault(db,()=>clock),fetch:provider,now:()=>clock,admit:t=>t?.origin===origin&&t.host==='docker'&&t.purpose==='connect',verify:async(t,a)=>{verified++;if(refuseOwner||t.origin!==origin||a.provider!=='cloudflare')throw Error('wrong owner');}};
assert.throws(()=>createProviderOAuthRelay({...deps,requireReceiverProof:true,verifyReceiver:undefined,notices:{privacy:'privacy '.repeat(12),terms:'terms '.repeat(16)}}));
let relay=createProviderOAuthRelay(deps);
const dispatch=(app,host,path,{body,cookie,owner=true,requestOrigin=host,headers={}}={})=>app.fetch(new Request(host+path,{method:body===undefined?'GET':'POST',headers:{...(owner?{'x-owner':'yes'}:{}),...(cookie?{cookie}:{}),...(body===undefined?{}:{origin:requestOrigin,'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}));
const call=(path,opts)=>dispatch(relay,relayOrigin,path,opts);
const store=providerOAuthStore(appDB,appCipher,()=>clock);
const receiver=createProviderRelayClient({origin,relayOrigin,target,mode:'authenticated',cipher:appCipher,store,now:()=>clock,authorize:async r=>r.headers.get('x-owner')==='yes'?{tenant:'test',subject:'owner'}:null,fetch:async(input,init)=>relay.fetch(new Request(String(input),init))});
const client=(path,opts)=>dispatch(receiver,origin,path,opts);
const cookie=r=>r.headers.get('set-cookie').split(';')[0];
async function flow(clientFor=client){
 const start=await clientFor('/api/provider-oauth/cloudflare/start',{body:{returnPath:'/frontbase-admin/settings?tab=accounts'}});assert.equal(start.status,200);const clientCookie=cookie(start),url=new URL((await start.json()).url);if(establishedKey)assert.ok(!url.href.includes(establishedKey),'registration secret never enters browser URL');
 const opened=await call(url.pathname+url.search);assert.equal(opened.status,200);const relayCookie=cookie(opened);assert.ok(!(await opened.text()).includes('fixture-sensitive'));
 const begin=await call('/api/provider-oauth/cloudflare/start',{cookie:relayCookie,body:{returnPath:'/complete'}});assert.equal(begin.status,200);const state=new URL((await begin.json()).url).searchParams.get('state'),stateCookie=cookie(begin);
 // Another isolate resumes the same durable encrypted transaction.
 relay=createProviderOAuthRelay({...deps,vault:await sqlOAuthRelayVault(db,()=>clock)});
 const finish=await call('/api/provider-oauth/cloudflare/finish',{cookie:relayCookie+'; '+stateCookie,body:{state,code:'test-code'}});assert.equal(finish.status,200);const text=await finish.text();assert.ok(!text.includes('fixture-sensitive'));const complete=await call(JSON.parse(text).returnPath,{cookie:relayCookie});assert.equal(complete.status,302);const ticket=new URL(complete.headers.get('location')).searchParams.get('ticket');return {ticket,clientCookie};
}
assert.equal((await client('/api/provider-oauth/status',{owner:false})).status,403);
assert.equal((await call('/connect?provider=cloudflare&challenge='+'a'.repeat(43)+'&target='+encodeURIComponent(JSON.stringify({...target,origin:'https://attacker.example'})))).status,409);
assert.equal((await client('/api/provider-oauth/cloudflare/start',{body:{returnPath:'/ok'},requestOrigin:'https://attacker.example'})).status,403);
let f=await flow();assert.equal(exchanges,1);assert.equal(verified,1);
const raw=await db.query('SELECT value FROM _frontbase_oauth_relay');assert.ok(raw.every(r=>String(r.value).startsWith('enc:')));assert.ok(!JSON.stringify(raw).includes('fixture-sensitive'));
const ticketRequest=async payload=>relay.fetch(new Request(relayOrigin+'/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}));
assert.equal((await ticketRequest({ticket:f.ticket,verifier:'wrong'.padEnd(43,'x'),origin})).status,403);
assert.equal((await client('/api/provider-oauth/cloudflare/relay-finish',{cookie:f.clientCookie+'; '+f.clientCookie,body:{ticket:f.ticket}})).status,409);
assert.equal((await client('/api/provider-oauth/cloudflare/relay-finish',{owner:false,cookie:f.clientCookie,body:{ticket:f.ticket}})).status,403);
const responses=await Promise.all([1,2].map(()=>client('/api/provider-oauth/cloudflare/relay-finish',{cookie:f.clientCookie,body:{ticket:f.ticket}})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
assert.equal((await db.query("SELECT key FROM _frontbase_oauth_relay WHERE key LIKE 'ticket:%'")).length,0,'handoff credential removed after redemption');
const accounts=new Phase2Store(appDB,'test',appCipher);const rows=await accounts.listEdgeResources('provider');assert.equal(rows.length,1);assert.equal((await accounts.getEdgeResourceConfig(rows[0].id)).api_token,'fixture-sensitive-provider-token');assert.ok(!(await(await client('/api/provider-oauth/status')).text()).includes('fixture-sensitive'));
f=await flow();refuseOwner=true;assert.equal((await client('/api/provider-oauth/cloudflare/relay-finish',{cookie:f.clientCookie,body:{ticket:f.ticket}})).status,409,'ownership rechecked at redemption');refuseOwner=false;
clock+=120001;await deps.vault.purge();assert.equal((await client('/api/provider-oauth/cloudflare/relay-finish',{cookie:f.clientCookie,body:{ticket:f.ticket}})).status,409);
assert.equal((await db.query("SELECT key FROM _frontbase_oauth_relay WHERE key LIKE 'ticket:%'")).length,0);
await assert.rejects(deps.vault.insert('plaintext','provider-token'));
console.log('PASS relay → callback → PKCE handoff → installed encrypted account; restart/concurrency, CSRF, recipient/owner binding, replay, expiry and physical credential deletion');

// Zero-state receivers may establish an owner only after a durable project claim.
let established=0;const nativeTarget={origin,host:'cloudflare',purpose:'install',account:'a'.repeat(32),project:'native-fixture',installationId:'00000000-0000-4000-a000-000000000001'};
deps.admit=t=>t?.origin===origin&&(t.purpose==='connect'&&t.host==='docker'||t.purpose==='install'&&t.host==='cloudflare'&&t.account===nativeTarget.account&&t.project===nativeTarget.project);
relay=createProviderOAuthRelay(deps);
const nativeClient=t=>{const app=createProviderRelayClient({origin,relayOrigin,target:t,mode:'native-install',now:()=>clock,authorize:async r=>r.headers.get('x-owner')==='yes'?{tenant:'native',subject:'installation'}:null,fetch:async(input,init)=>relay.fetch(new Request(String(input),init)),establish:async (grant,_request,key)=>{assert.equal(grant.provider,'cloudflare');assert.match(key,/^[\w-]{43}$/);establishedKey=key;established++;return '/frontbase-bootstrap/activation#claim=fixture-only';}});return (path,options)=>dispatch(app,origin,path,options);};
const firstNative=nativeClient(nativeTarget);f=await flow(firstNative);assert.equal((await firstNative('/api/provider-oauth/cloudflare/relay-finish',{cookie:f.clientCookie,body:{ticket:f.ticket}})).status,409);assert.equal(established,0,'native claims are mandatory');
for(const limit of [0,100001,1.5])await assert.rejects(()=>sqlOAuthNativeClaims(db,()=>clock,limit));
deps.claimInstallation=await sqlOAuthNativeClaims(db,()=>clock);const secondNative=nativeClient({...nativeTarget,installationId:'00000000-0000-4000-a000-000000000002'});const firstFlow=await flow(firstNative),secondFlow=await flow(secondNative);
const nativeResults=await Promise.all([[firstNative,firstFlow],[secondNative,secondFlow]].map(([call,flow])=>call('/api/provider-oauth/cloudflare/relay-finish',{cookie:flow.clientCookie,body:{ticket:flow.ticket}})));assert.deepEqual(nativeResults.map(r=>r.status).sort(),[200,409]);assert.equal(established,1,'different installation IDs cannot establish two owners of one provider project');
clock+=600001;await deps.vault.purge();const claims=await db.query('SELECT * FROM _frontbase_native_claims');assert.equal(claims.length,1,'nonsecret ownership claim survives credential expiry');assert.ok(!JSON.stringify(claims).includes('fixture-sensitive'));
const proof='a'.repeat(43);
assert.equal(await deps.claimInstallation({...nativeTarget,origin:'https://another-alias.example',installationId:'00000000-0000-4000-a000-000000000003'},proof),false,'a new alias cannot acquire a second owner');
for(const change of [{account:'bad'},{project:'../escape'},{origin:'http://installation.example'},{origin:origin+'/path'},{installationId:'invalid'}])await assert.rejects(()=>deps.claimInstallation({...nativeTarget,...change},proof));
const vercelTarget={...nativeTarget,host:'vercel',account:'team_fixture',project:'prj_fixture'};assert.equal(await deps.claimInstallation(vercelTarget,proof),true);assert.equal(await deps.claimInstallation({...vercelTarget,origin:'https://production-alias.example',deploymentId:'dpl_next'},proof),false,'Vercel redeploys and aliases retain one project owner');
console.log('PASS native relay redemption requires durable account/project CAS; concurrent build IDs produce one owner; nonsecret ledger survives grant cleanup');

// A reconnect reuses the receiver's server-side registration secret. The relay
// knows only its digest, bound to the original claimed origin and host.
const registered={origin,host:'cloudflare',purpose:'connect'};
const verifyReceiver=await sqlOAuthNativeReceiver(db);
const keyDigest=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');
const digest=await keyDigest(establishedKey);
assert.equal(await verifyReceiver(registered,digest),true);
for(const bad of [{...registered,origin:'https://attacker.example'},{...registered,host:'vercel'},{...registered,purpose:'install'}])assert.equal(await verifyReceiver(bad,digest),false);
assert.equal(await verifyReceiver(registered,'x'.repeat(43)),false);
assert.ok(!JSON.stringify(await db.query('SELECT * FROM _frontbase_native_claims')).includes(establishedKey));
Object.assign(deps,publicNativeRelayTargetPolicy(async()=>{throw Error('no provider call for reconnect');},verifyReceiver),{notices:{privacy:'fixture privacy '.repeat(8),terms:'fixture terms '.repeat(8)}});
relay=createProviderOAuthRelay(deps);
const registeredReceiver=createProviderRelayClient({origin,relayOrigin,target:registered,mode:'authenticated',registrationKey:establishedKey,cipher:appCipher,store,now:()=>clock,authorize:async r=>r.headers.get('x-owner')==='yes'?{tenant:'test',subject:'owner'}:null,fetch:async(input,init)=>relay.fetch(new Request(String(input),init))});
const rc=(path,opts)=>dispatch(registeredReceiver,origin,path,opts);
assert.equal((await call('/connect?provider=cloudflare&challenge='+'x'.repeat(43)+'&target='+encodeURIComponent(JSON.stringify(registered)))).status,409,'unregistered receiver refused before consent');
let registeredFlow=await flow(rc);
assert.equal((await rc('/api/provider-oauth/cloudflare/relay-finish',{cookie:registeredFlow.clientCookie,body:{ticket:registeredFlow.ticket}})).status,200,'registered receiver reconnects');
registeredFlow=await flow(rc);
await db.exec('UPDATE _frontbase_native_claims SET receiver_proof = ? WHERE origin = ?',['z'.repeat(43),origin]);
assert.equal((await rc('/api/provider-oauth/cloudflare/relay-finish',{cookie:registeredFlow.clientCookie,body:{ticket:registeredFlow.ticket}})).status,409,'receiver registration rechecked before redemption');
console.log('PASS registered receiver reconnect, host/origin/proof isolation and revocation before redemption');

// Exercise public installation followed by registered reconnect as one flow.
const publicOrigin='https://production-fixture.fixture.workers.dev';
const publicTarget={...nativeTarget,origin:publicOrigin,project:'production-fixture',installationId:'00000000-0000-4000-a000-000000000011'};
const publicTransport=async(url,init)=>{
 assert.equal(init.redirect,'manual');assert.equal(init.headers.authorization,'Bearer fixture-sensitive-provider-token');
 if(String(url).endsWith('/workers/subdomain'))return Response.json({success:true,result:{subdomain:'fixture'}});
 return Response.json({success:true,result:{bindings:[{name:'FRONTBASE_INSTALLATION_ID',text:publicTarget.installationId},{name:'FRONTBASE_HOSTED_SETUP',text:'1'},{name:'FRONTBASE_BOOTSTRAP',text:'native'}]}});
};
Object.assign(deps,publicNativeRelayTargetPolicy(publicTransport,verifyReceiver));
relay=createProviderOAuthRelay(deps);
let publicKey;
const publicInstall=createProviderRelayClient({origin:publicOrigin,relayOrigin,target:publicTarget,mode:'native-install',now:()=>clock,authorize:async r=>r.headers.get('x-owner')==='yes'?{tenant:'native',subject:'installation'}:null,fetch:async(input,init)=>relay.fetch(new Request(String(input),init)),establish:async(_grant,_request,key)=>{publicKey=key;return '/frontbase-bootstrap/activation#claim=fixture-only';}});
const pc=(path,opts)=>dispatch(publicInstall,publicOrigin,path,opts);
const pf=await flow(pc);assert.equal((await pc('/api/provider-oauth/cloudflare/relay-finish',{cookie:pf.clientCookie,body:{ticket:pf.ticket}})).status,200);
assert.ok(publicKey);assert.equal(await verifyReceiver({origin:publicOrigin,host:'cloudflare',purpose:'connect'},await keyDigest(publicKey)),true);
const publicReconnect=createProviderRelayClient({origin:publicOrigin,relayOrigin,target:{origin:publicOrigin,host:'cloudflare',purpose:'connect'},mode:'authenticated',registrationKey:publicKey,cipher:appCipher,store,now:()=>clock,authorize:async r=>r.headers.get('x-owner')==='yes'?{tenant:'test',subject:'owner'}:null,fetch:async(input,init)=>relay.fetch(new Request(String(input),init))});
const pr=(path,opts)=>dispatch(publicReconnect,publicOrigin,path,opts);
const prf=await flow(pr);assert.equal((await pr('/api/provider-oauth/cloudflare/relay-finish',{cookie:prf.clientCookie,body:{ticket:prf.ticket}})).status,200);
console.log('PASS public provider-verified native installation followed by registered reconnect');
