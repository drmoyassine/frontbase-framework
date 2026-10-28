import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {createSecretCipher,noopCipher} from '../dist/db/secret-cipher.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
const {createProviderOAuth}=await import(process.env.FRONTBASE_OAUTH_TEST_MODULE??'../dist/provider-oauth.js');
const {providerOAuthStore}=await import(process.env.FRONTBASE_OAUTH_STORE_TEST_MODULE??'../dist/provider-oauth-store.js');
import {providerOAuthVault} from '../dist/provider-oauth-vault.js';
import {importProviderOAuth} from '../dist/provider-oauth-import.js';
import {resolveProviderOAuthCredentials} from '../dist/provider-oauth-bindings.js';
import {createCompatApp} from '../dist/compat/app.js';
const origin='https://setup.example',db=sqliteRunner(':memory:');await migrateUp(db);
let time=1800000000000,calls=0,failProvider=false;
const cipher=await createSecretCipher('synthetic-connection-encryption-key'),actor={tenant:'a',subject:'owner'};
const clients={cloudflare:{provider:'cloudflare',clientId:'cf-public',redirectUri:origin+'/api/provider-oauth/cloudflare/callback',scopes:['account:read']},vercel:{provider:'vercel',clientId:'vc-client',clientSecret:'vc-private',integrationSlug:'frontbase-test',redirectUri:origin+'/api/provider-oauth/vercel/callback',scopes:[]}};
let tokenBody;
const transport=async(url,init)=>{
 assert.equal(init.redirect,'manual');assert.ok(init.signal);
 if(String(url).endsWith('/token')||String(url).endsWith('/access_token')){calls++;tokenBody=new URLSearchParams(init.body);if(failProvider)return Response.json({access_token:'DO-NOT-LEAK',error:'private-provider-error'},{status:403});return Response.json({access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_in:3600,scope:'account:read',team_id:'team_example'});}
 assert.equal(init.headers.authorization,'Bearer synthetic-access-token');
 if(String(url).includes('cloudflare.com'))return Response.json({success:true,result:[{id:'a'.repeat(32),name:'Test CF account'}]});
 if(String(url).includes('api.supabase.com'))return Response.json([{id:'b'.repeat(32),ref:'testprojectref',name:'Test Supabase project'}]);
 assert.equal(String(url),'https://api.vercel.com/v2/teams/team_example');return Response.json({id:'team_example',name:'Test team'});
};
const make=(store=providerOAuthStore(db,cipher,()=>time))=>createProviderOAuth({origin,clients,store,fetch:transport,now:()=>time,authorize:async req=>{
 const raw=req.headers.get('x-actor');return raw?{tenant:raw.split('/')[0],subject:raw.split('/')[1]}:null;
}});
let app=make();
const request=(path,{body,cookie,who='a/owner',host=origin,requestOrigin=origin,method=body===undefined?'GET':'POST'}={})=>app.fetch(new Request(host+'/api/provider-oauth/'+path,{method,headers:{...(who?{'x-actor':who}:{}),...(cookie?{cookie}:{}),...(body===undefined?{}:{origin:requestOrigin,'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
const begin=async(provider='cloudflare',extra={})=>{
 const result=await request(provider+'/start',{body:{returnPath:'/frontbase-bootstrap/',...extra}});assert.equal(result.status,200);const data=await result.json();const url=new URL(data.url);return {state:url.searchParams.get('state'),cookie:result.headers.get('set-cookie').split(';')[0],url};
};
assert.equal((await request('status',{who:null})).status,403);
assert.equal((await request('status',{host:'https://other.example'})).status,403);
assert.equal((await request('cloudflare/start',{body:{returnPath:'/frontbase-bootstrap/'},requestOrigin:'https://bad.example'})).status,403);
for(const returnPath of ['https://bad.example','//bad.example','/\\bad.example','/ok\nwrong'])assert.equal((await request('cloudflare/start',{body:{returnPath}})).status,400);
assert.equal((await request('cloudflare/start',{body:{returnPath:'/'+'.'.repeat(70000)}})).status,409);
let pending=await begin();assert.equal(pending.url.origin,'https://dash.cloudflare.com');assert.equal(pending.url.searchParams.get('code_challenge_method'),'S256');assert.match(pending.cookie,/__Host-fb_oauth_cloudflare=/);
const finish=(p=pending,extra={})=>request('cloudflare/finish',{body:{code:'authorization-code',state:p.state},cookie:p.cookie,...extra});
assert.equal((await finish(pending,{cookie:pending.cookie+'; '+pending.cookie})).status,403);
assert.equal((await finish(pending,{cookie:pending.cookie.slice(0,-1)+'Z'})).status,403);
assert.equal((await finish(pending,{who:'b/owner'})).status,403);
assert.equal((await finish(pending,{who:'a/another'})).status,403);
assert.equal((await finish(pending,{requestOrigin:'https://bad.example'})).status,403);
assert.equal(calls,0);
// Another process/isolate can finish, and parallel callbacks consume the grant only once.
app=make();const results=await Promise.all([finish(),finish()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);assert.equal(calls,1);
const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tokenBody.get('code_verifier')))).toString('base64url');assert.equal(challenge,pending.url.searchParams.get('code_challenge'));
assert.equal(tokenBody.get('redirect_uri'),clients.cloudflare.redirectUri);
assert.equal((await finish()).status,403);
const accounts=new Phase2Store(db,'a',cipher),saved=(await accounts.listEdgeResources('provider'))[0];
assert.ok(saved);const raw=String((await db.query('SELECT config FROM edge_resources WHERE id = ? AND tenant_slug = ?',[saved.id,'a']))[0].config);assert.ok(cipher.isEncrypted(raw));assert.ok(!raw.includes('synthetic-access-token'));
assert.equal((await accounts.getEdgeResourceConfig(saved.id)).api_token,'synthetic-access-token');
assert.equal((await new Phase2Store(db,'b',cipher).listEdgeResources('provider')).length,0);
let status=await request('status');const statusText=await status.text();assert.ok(!statusText.includes('synthetic-access-token'));assert.ok(!statusText.includes('synthetic-refresh-token'));assert.match(statusText,/Test CF account/);
pending=await begin();time+=600001;assert.equal((await finish()).status,403);
pending=await begin();failProvider=true;const failed=await finish();assert.equal(failed.status,409);assert.ok(!(await failed.text()).includes('DO-NOT-LEAK'));assert.equal((await finish()).status,403);failProvider=false;
const vercel=await begin('vercel');assert.equal(vercel.url.pathname,'/integrations/frontbase-test/new');const vc=await request('vercel/finish',{body:{code:'vercel-code',state:vercel.state},cookie:vercel.cookie});assert.equal(vc.status,200);assert.equal(tokenBody.get('client_secret'),'vc-private');
clients.vercel.integrationTeamSlug='private-test-team';const privateVercel=await begin('vercel');assert.equal(privateVercel.url.pathname,'/private-test-team/~/integrations/frontbase-test');assert.equal(privateVercel.url.searchParams.get('redirect_uri'),clients.vercel.redirectUri);delete clients.vercel.integrationTeamSlug;assert.throws(()=>createProviderOAuth({origin,clients:{vercel:{...clients.vercel,integrationTeamSlug:'../escape'}},store:providerOAuthStore(db,cipher),fetch:transport,authorize:async()=>actor}));
// Supabase: standard OAuth2 authorize endpoint with PKCE, unconfigured until the operator sets a client.
assert.equal((await request('supabase/start',{body:{returnPath:'/'}})).status,409);
clients.supabase={provider:'supabase',clientId:'sb-public',redirectUri:origin+'/api/provider-oauth/supabase/callback',scopes:['projects.read','database.write']};
const supa=await begin('supabase');assert.equal(supa.url.origin+supa.url.pathname,'https://api.supabase.com/v1/oauth/authorize');assert.equal(supa.url.searchParams.get('client_id'),'sb-public');assert.equal(supa.url.searchParams.get('response_type'),'code');assert.equal(supa.url.searchParams.get('scope'),'projects.read database.write');assert.equal(supa.url.searchParams.get('code_challenge_method'),'S256');assert.equal(supa.url.searchParams.get('redirect_uri'),clients.supabase.redirectUri);assert.match(supa.cookie,/__Host-fb_oauth_supabase=/);
const supaFinish=await request('supabase/finish',{body:{code:'supabase-code',state:supa.state},cookie:supa.cookie});assert.equal(supaFinish.status,200);
assert.equal(tokenBody.get('grant_type'),'authorization_code');assert.equal(tokenBody.get('client_id'),'sb-public');assert.ok(tokenBody.get('code_verifier'));assert.equal(tokenBody.get('redirect_uri'),clients.supabase.redirectUri);assert.equal(tokenBody.get('client_secret'),null);
const supaStatus=await request('status');const supaJson=await supaStatus.json();
const supaConn=supaJson.connections.find(c=>c.provider==='supabase');assert.ok(supaConn,'supabase connection listed');assert.equal(supaConn.accountId,'testprojectref');assert.equal(supaConn.reconnectRequired,false);
assert.ok(!JSON.stringify(supaJson).includes('synthetic-access-token'));assert.ok(!JSON.stringify(supaJson).includes('synthetic-refresh-token'));assert.match(supaConn.label,/Test Supabase project/);
// Reconnect cannot mutate another provider/tenant or revive a deleted account.
pending=await begin('cloudflare',{accountId:saved.id});assert.equal((await finish()).status,200);
const rotatedRaw=String((await db.query('SELECT config FROM edge_resources WHERE id = ? AND tenant_slug = ?',[saved.id,'a']))[0].config);assert.ok(cipher.isEncrypted(rotatedRaw));assert.ok(!rotatedRaw.includes('synthetic-access-token'));
pending=await begin('cloudflare',{accountId:saved.id});await accounts.deleteEdgeResource(saved.id);assert.equal((await finish()).status,409);assert.equal(await accounts.getEdgeResource(saved.id),null);
app=make(providerOAuthStore(db,noopCipher,()=>time));assert.equal((await request('cloudflare/start',{body:{returnPath:'/frontbase-bootstrap/'}})).status,409);
// The callback document remains public, but contains no credential and finishes via authenticated POST.
app=make();const callback=await request('cloudflare/callback?code=private-code&state=anything',{who:null});assert.equal(callback.status,200);assert.ok(!(await callback.text()).includes('private-code'));assert.match(callback.headers.get('content-security-policy'),/connect-src 'self'/);
// Bootstrap vault also supports restart/concurrent consumption without an application schema.
const map=new Map(),vault={get:async key=>map.get(key)??null,insert:async(key,value)=>{if(map.has(key))return false;map.set(key,value);return true;},entries:async prefix=>[...map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({key,value}))};
let boot=providerOAuthVault(vault,cipher,actor,()=>time);await boot.store.put('once',{...actor,provider:'cloudflare',verifier:'pkce',expires:time+1000,returnPath:'/frontbase-bootstrap/'});
boot=providerOAuthVault(vault,cipher,actor,()=>time);const consumed=await Promise.all([boot.store.consume('once',actor,'cloudflare',time),boot.store.consume('once',actor,'cloudflare',time)]);assert.equal(consumed.filter(Boolean).length,1);
await boot.store.save(actor,{provider:'cloudflare',accessToken:'persisted-bootstrap-token',scopes:[],accounts:[{id:'account',name:'Bootstrap account'}]});assert.ok(!JSON.stringify([...map]).includes('persisted-bootstrap-token'));
const grants=await boot.grants(),envelope=await cipher.encrypt(JSON.stringify({installationId:'test-installation',grants}));
const bindingManifest={bindings:{state:{adapterId:'d1-http',mode:'connect',config:{accountId:'account'},secretRefs:{token:'oauth/cloudflare/token'}}}};
assert.equal(resolveProviderOAuthCredentials(bindingManifest,{},grants,time)['oauth/cloudflare/token'],'persisted-bootstrap-token');
assert.throws(()=>resolveProviderOAuthCredentials(bindingManifest,{'oauth/cloudflare/token':'browser-override'},grants,time));
assert.throws(()=>resolveProviderOAuthCredentials({...bindingManifest,bindings:{state:{...bindingManifest.bindings.state,config:{accountId:'another-account'}}}},{},grants,time));
assert.throws(()=>resolveProviderOAuthCredentials(bindingManifest,{},grants.map(g=>({...g,expiresAt:time-1})),time));
await Promise.all([importProviderOAuth(db,cipher,'a',envelope),importProviderOAuth(db,cipher,'a',envelope)]);
const imported=(await accounts.listEdgeResources('provider')).filter(a=>a.id.startsWith('oauth-setup:'));assert.equal(imported.length,1);
await accounts.deleteEdgeResource(imported[0].id);await importProviderOAuth(db,cipher,'a',envelope);assert.equal(await accounts.getEdgeResource(imported[0].id),null);
// Exercise the actual installed-app mount: its resolver/roles remain authoritative.
let role='owner';const installed=await createCompatApp({makeRunner:()=>db,sessionSecret:'synthetic-connection-encryption-key',resolvePrincipal:async()=>({tenant:'a',user:role?{id:'owner',role}:null}),providerOAuth:{origin,clients},externalFetch:transport});
assert.equal((await installed.fetch(new Request(origin+'/api/provider-oauth/status'))).status,200);
role='viewer';assert.equal((await installed.fetch(new Request(origin+'/api/provider-oauth/status'))).status,403);
role='';assert.equal((await installed.fetch(new Request(origin+'/api/provider-oauth/status'))).status,403);
assert.equal((await installed.fetch(new Request(origin+'/api/provider-oauth/cloudflare/callback?code=redacted&state=none'))).status,200);
console.log('PASS provider OAuth: CF PKCE / Vercel integration / Supabase PKCE + projects, encrypted SQL/vault restart and handoff, callback CSRF/role/tenant/actor/expiry, one-use concurrency, reconnect deletion and no credential projection');
