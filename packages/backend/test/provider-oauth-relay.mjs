import assert from 'node:assert/strict';import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';import {createSecretCipher} from '../dist/db/secret-cipher.js';
const {createProviderOAuthRelay}=await import(process.env.FRONTBASE_RELAY_TEST_MODULE??'../dist/provider-oauth-relay.js');
const {sqlOAuthRelayVault,sqlOAuthNativeClaims}=await import(process.env.FRONTBASE_RELAY_STORE_TEST_MODULE??'../dist/provider-oauth-relay-store.js');
const {createProviderRelayClient}=await import(process.env.FRONTBASE_RELAY_CLIENT_TEST_MODULE??'../dist/provider-oauth-relay-client.js');
import {providerOAuthStore} from '../dist/provider-oauth-store.js';import {Phase2Store} from '../dist/db/phase2-store.js';
const relayOrigin='https://relay.example',origin='https://installation.example',target={origin,host:'docker',purpose:'connect'};
const db=sqliteRunner(':memory:'),appDB=sqliteRunner(':memory:');await migrateUp(appDB);let clock=Date.now(),verified=0,exchanges=0,refuseOwner=false;
const cipher=await createSecretCipher('relay-vault-fixture-key'),appCipher=await createSecretCipher('installed-app-fixture-key');
const clients={cloudflare:{provider:'cloudflare',clientId:'private-fixture',scopes:['account:read'],redirectUri:relayOrigin+'/api/provider-oauth/cloudflare/callback'}};
const provider=async(url,init)=>{
 assert.equal(init.redirect,'manual');
 if(String(url).endsWith('/token')){exchanges++;const p=new URLSearchParams(init.body);assert.ok(p.get('code_verifier'));return Response.json({access_token:'fixture-sensitive-provider-token',refresh_token:'fixture-sensitive-refresh-token',token_type:'bearer',expires_in:3600});}
 assert.equal(new URL(String(url)).origin,'https://api.cloudflare.com');return Response.json({success:true,result:[{id:'a'.repeat(32),name:'Isolated account'}]});
};
const deps={origin:relayOrigin,clients,cipher,vault:await sqlOAuthRelayVault(db,()=>clock),fetch:provider,now:()=>clock,admit:t=>t?.origin===origin&&t.host==='docker'&&t.purpose==='connect',verify:async(t,a)=>{verified++;if(refuseOwner||t.origin!==origin||a.provider!=='cloudflare')throw Error('wrong owner');}};
let relay=createProviderOAuthRelay(deps);
const dispatch=(app,host,path,{body,cookie,owner=true,requestOrigin=host,headers={}}={})=>app.fetch(new Request(host+path,{method:body===undefined?'GET':'POST',headers:{...(owner?{'x-owner':'yes'}:{}),...(cookie?{cookie}:{}),...(body===undefined?{}:{origin:requestOrigin,'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}));
const call=(path,opts)=>dispatch(relay,relayOrigin,path,opts);
const store=providerOAuthStore(appDB,appCipher,()=>clock);
const receiver=createProviderRelayClient({origin,relayOrigin,target,mode:'authenticated',cipher:appCipher,store,now:()=>clock,authorize:async r=>r.headers.get('x-owner')==='yes'?{tenant:'test',subject:'owner'}:null,fetch:async(input,init)=>relay.fetch(new Request(String(input),init))});
const client=(path,opts)=>dispatch(receiver,origin,path,opts);
const cookie=r=>r.headers.get('set-cookie').split(';')[0];
async function flow(clientFor=client){
 const start=await clientFor('/api/provider-oauth/cloudflare/start',{body:{returnPath:'/frontbase-admin/settings?tab=accounts'}});assert.equal(start.status,200);const clientCookie=cookie(start),url=new URL((await start.json()).url);
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
const nativeClient=t=>{const app=createProviderRelayClient({origin,relayOrigin,target:t,mode:'native-install',now:()=>clock,authorize:async r=>r.headers.get('x-owner')==='yes'?{tenant:'native',subject:'installation'}:null,fetch:async(input,init)=>relay.fetch(new Request(String(input),init)),establish:async grant=>{assert.equal(grant.provider,'cloudflare');established++;return '/frontbase-bootstrap/activation#claim=fixture-only';}});return (path,options)=>dispatch(app,origin,path,options);};
const firstNative=nativeClient(nativeTarget);f=await flow(firstNative);assert.equal((await firstNative('/api/provider-oauth/cloudflare/relay-finish',{cookie:f.clientCookie,body:{ticket:f.ticket}})).status,409);assert.equal(established,0,'native claims are mandatory');
deps.claimInstallation=await sqlOAuthNativeClaims(db,()=>clock);const secondNative=nativeClient({...nativeTarget,installationId:'00000000-0000-4000-a000-000000000002'});const firstFlow=await flow(firstNative),secondFlow=await flow(secondNative);
const nativeResults=await Promise.all([[firstNative,firstFlow],[secondNative,secondFlow]].map(([call,flow])=>call('/api/provider-oauth/cloudflare/relay-finish',{cookie:flow.clientCookie,body:{ticket:flow.ticket}})));assert.deepEqual(nativeResults.map(r=>r.status).sort(),[200,409]);assert.equal(established,1,'different installation IDs cannot establish two owners of one provider project');
clock+=600001;await deps.vault.purge();const claims=await db.query('SELECT * FROM _frontbase_native_claims');assert.equal(claims.length,1,'nonsecret ownership claim survives credential expiry');assert.ok(!JSON.stringify(claims).includes('fixture-sensitive'));
const proof='a'.repeat(43);
assert.equal(await deps.claimInstallation({...nativeTarget,origin:'https://another-alias.example',installationId:'00000000-0000-4000-a000-000000000003'},proof),false,'a new alias cannot acquire a second owner');
for(const change of [{account:'bad'},{project:'../escape'},{origin:'http://installation.example'},{origin:origin+'/path'},{installationId:'invalid'}])await assert.rejects(()=>deps.claimInstallation({...nativeTarget,...change},proof));
const vercelTarget={...nativeTarget,host:'vercel',account:'team_fixture',project:'prj_fixture'};assert.equal(await deps.claimInstallation(vercelTarget,proof),true);assert.equal(await deps.claimInstallation({...vercelTarget,origin:'https://production-alias.example',deploymentId:'dpl_next'},proof),false,'Vercel redeploys and aliases retain one project owner');
console.log('PASS native relay redemption requires durable account/project CAS; concurrent build IDs produce one owner; nonsecret ledger survives grant cleanup');
