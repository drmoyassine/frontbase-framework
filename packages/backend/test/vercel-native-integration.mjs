import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {sqlOAuthRelayVault,sqlOAuthNativeClaims} from '../dist/provider-oauth-relay-store.js';
import {nativeInstallationId} from '../../../scripts/deployment-setup/native-build-metadata.mjs';
const {createVercelNativeIntegration}=await import(process.env.FRONTBASE_VERCEL_NATIVE_TEST_MODULE??new URL('../dist/vercel-native-integration.js',import.meta.url));
const origin='https://relay.example',runtime='https://new-frontbase.vercel.app',callback='/api/provider-oauth/vercel/callback';
const client={provider:'vercel',clientId:'oac_fixture',clientSecret:'private-client-secret',integrationSlug:'frontbase',redirectUri:origin+callback,scopes:[]};
async function fixture(fault={}){
 let stamp=1900000000000,calls=[],refusals=[],established=0,verified=0;
 const createdAt=stamp-(fault.old?3600000:fault.ageMs??10000);
 const db=new DatabaseSync(':memory:'),runner={query:async(s,p=[])=>db.prepare(s).all(...p),exec:async(s,p=[])=>{if(p.length)db.prepare(s).run(...p);else db.exec(s);}};
 const vault=await sqlOAuthRelayVault(runner,()=>stamp),cipher=await createSecretCipher('native-vercel-test-secret-'.repeat(3)),claim=await sqlOAuthNativeClaims(runner,()=>stamp);
 const deps={origin,client,vault,cipher,now:()=>stamp,onRefusal:reason=>{assert.match(reason,/^native_vercel_[a-z_]+$/);refusals.push(reason);},claimInstallation:claim,verify:async(t,a)=>{verified++;assert.equal(t.project,'prj_fixture');assert.equal(a.accessToken,'private-management-grant');},establish:async(c,a)=>{established++;assert.equal(c.target.installationId,nativeInstallationId('vercel','team_fixture','prj_fixture'));assert.match(c.registrationKey,/^[\w-]{43}$/);assert.equal(a.accessToken,'private-management-grant');if(fault.lost)throw Error('lost');return{returnPath:'/frontbase-bootstrap/activation#claim='+'a'.repeat(64)};},fetch:async(input,init={})=>{
  const u=new URL(input);calls.push({url:u.href,method:init.method??'GET'});assert.equal(init.redirect,'manual');
  if(u.origin==='https://api.vercel.com'){
   if(u.pathname==='/v2/oauth/access_token'){assert.equal(new URLSearchParams(init.body).get('client_secret'),client.clientSecret);return fault.codeRefused?Response.json({error:'private-provider-body'},{status:403}):Response.json({access_token:'private-management-grant',team_id:fault.team??'team_fixture',installation_id:fault.configuration??'icfg_fixture'});}
   assert.equal(init.headers.authorization,'Bearer private-management-grant');
   if(u.pathname==='/v1/integrations/configuration/icfg_fixture')return Response.json({id:'icfg_fixture',integrationId:fault.integration??client.clientId,teamId:'team_fixture',projects:[fault.project??'prj_fixture']});
   if(u.pathname==='/v2/teams/team_fixture')return Response.json({id:'team_fixture',name:'Fixture team',slug:'fixture-team'});
   if(u.pathname==='/v9/projects/prj_fixture')return Response.json({id:'prj_fixture',accountId:'team_fixture',name:'new-frontbase',rootDirectory:'examples/cf-full',createdAt,targets:{production:{id:'dpl_fixture',alias:['new-frontbase.vercel.app']}}});
   if(u.pathname==='/v13/deployments/new-frontbase.vercel.app')return Response.json({id:'dpl_fixture',...(fault.legacyOwner?{teamId:'team_fixture'}:{ownerId:fault.owner??'team_fixture'}),projectId:'prj_fixture',target:fault.preview?'preview':'production',readyState:'READY',alias:[fault.alias??'new-frontbase.vercel.app']});
  }
  if(u.origin===runtime&&u.pathname==='/frontbase-bootstrap/native-configuration')return fault.initialized?new Response('gone',{status:410}):Response.json({target:fault.native??'vercel'});
  throw Error('Unexpected egress '+u.origin+u.pathname);
 }};
 const {app,accepts}=createVercelNativeIntegration(deps),query=new URLSearchParams({source:'deploy-button','external-id':'frontbase-native-v1',teamId:'team_fixture',configurationId:'icfg_fixture',currentProjectId:'prj_fixture',next:'https://vercel.com/new/continue',code:'one-use-provider-code'});
 let cookie='';
 async function start(overrides={}){const q=new URLSearchParams(query);for(const[k,v]of Object.entries(overrides))v===null?q.delete(k):q.set(k,v);const response=await app.fetch(new Request(origin+callback+'?'+q));cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;return response;}
 const finish=(overrides={},headers={})=>app.fetch(new Request(origin+'/native-vercel/finish',{method:'POST',headers:{cookie,origin,'content-type':'application/json',...headers},body:JSON.stringify({deployment:runtime,...overrides})}));
 const resume=(headers={})=>app.fetch(new Request(origin+'/native-vercel/resume',{method:'POST',headers:{cookie,origin,'content-type':'application/json',...headers},body:'{}'}));
 return{db,vault,app,accepts,start,finish,resume,query,get cookie(){return cookie;},get established(){return established;},get verified(){return verified;},calls,refusals,allowProject(){delete fault.project;},elapse(ms){stamp+=ms;},advance(){stamp+=600001;}};
}
{
 const f=await fixture(),r=await f.start();assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://vercel.com/new/continue');assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 assert.equal(f.established,0,'callback never mutates deployment');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM _frontbase_native_claims').get().n,0);
 assert.ok(f.db.prepare('SELECT value FROM _frontbase_oauth_relay').all().every(r=>r.value.startsWith('enc:')&&!r.value.includes('private-management-grant')));
 assert.equal(f.accepts(new Request(origin+callback+'?code=standard&state=normal')),false,'installed-app OAuth stays separate');
 assert.equal((await f.finish({}, {origin:'https://other.example'})).status,403);
 assert.equal((await f.finish({}, {cookie:f.cookie+'; '+f.cookie})).status,403);
 assert.equal((await f.finish({deployment:'https://127.0.0.1'})).status,409);assert.equal(f.established,0);
 const result=await f.finish();assert.equal(result.status,200);assert.equal((await result.json()).url,runtime+'/frontbase-bootstrap/activation#claim='+'a'.repeat(64));assert.equal(f.established,1);assert.equal(f.verified,1);
 assert.equal((await f.finish()).status,200);assert.equal(f.established,1,'repeat receipt never repeats provider writes');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM _frontbase_native_claims').get().n,1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM _frontbase_oauth_relay WHERE key LIKE 'vercel-native:%'").get().n,0,'grant removed after handoff');
 f.advance();assert.equal((await f.finish()).status,403);
}
{
 const f=await fixture();await f.start();assert.equal((await f.finish()).status,200);
 await f.start();assert.equal((await f.finish()).status,409,'project ownership claim survives a different continuation');assert.equal(f.established,1);
}
for(const fault of [{team:'team_other'},{configuration:'icfg_other'},{integration:'oac_other'}]){const f=await fixture(fault);assert.equal((await f.start()).status,409,JSON.stringify(fault));assert.equal(f.established,0);}
for(const fault of [{project:'prj_other'},{old:true}]){const f=await fixture(fault);assert.equal((await f.start()).status,302);assert.equal((await f.finish()).status,409,JSON.stringify(fault));assert.equal(f.established,0);}
{const f=await fixture({ageMs:19*60000});await f.start();f.elapse(2*60000);assert.equal((await f.finish()).status,200,'provider build does not shift authorization-time project freshness');}
{
 const f=await fixture({project:'prj_other'}),start=await f.start();assert.equal(start.headers.get('location'),'/native-vercel/permissions');
 const page=await f.app.fetch(new Request(origin+'/native-vercel/permissions',{headers:{cookie:f.cookie}}));assert.equal(page.status,200);const html=await page.text();assert(html.includes('https://vercel.com/fixture-team/~/integrations/icfg_fixture'));assert(!html.includes('private-management-grant'));
 assert.equal((await f.resume({origin:'https://attacker.example'})).status,403);assert.equal((await f.resume()).status,409,'cannot resume before provider selection');assert.equal(f.established,0);
 f.allowProject();const resumed=await f.resume();assert.equal(resumed.status,200);assert.equal((await resumed.json()).url,'https://vercel.com/new/continue');assert.equal(f.established,0);assert.equal((await f.finish()).status,200);
}
{const f=await fixture({codeRefused:true}),r=await f.start(),body=await r.text();assert.equal(r.status,409);assert(body.includes('native_vercel_authorization_code_refused'));assert(!body.includes('private-provider-body'));assert.deepEqual(f.refusals,['native_vercel_authorization_code_refused']);}
for(const overrides of [{next:'https://attacker.example/new/'},{next:'https://vercel.com/account'},{'external-id':'wrong'},{currentProjectId:'wrong'}]){const f=await fixture();assert.equal((await f.start(overrides)).status,409);assert.equal(f.calls.length,0);}
{const f=await fixture();const r=await f.start({next:'https://vercel.com/new?native=1'});assert.equal(r.status,302);assert.equal((await(await f.resume()).json()).url,'https://vercel.com/new?native=1');}
{const f=await fixture();const next='https://vercel.com/fixture-team/~/integrations/icfg_fixture/installed';const r=await f.start({next});assert.equal(r.status,302);assert.equal((await(await f.resume()).json()).url,next);assert.equal((await f.finish()).status,200);}
for(const next of ['https://vercel.com/other-team/~/integrations/icfg_fixture/installed','https://vercel.com/fixture-team/~/integrations/icfg_other/installed']){const f=await fixture();assert.equal((await f.start({next})).status,409,'installed continuation is bound to team/configuration');}
for(const fault of [{owner:'team_other'},{preview:true},{alias:'other.vercel.app'},{initialized:true},{native:'cloudflare'}]){const f=await fixture(fault);assert.equal((await f.start()).status,302);assert.equal((await f.finish()).status,409);assert.equal(f.established,0);}
{const f=await fixture({legacyOwner:true});await f.start();assert.equal((await f.finish()).status,200,'legacy teamId deployment shape stays supported');}
{
 const f=await fixture(),get=path=>f.app.fetch(new Request(origin+path,{headers:{cookie:f.cookie}}));
 assert.equal((await get('/native-vercel/status')).status,403);
 assert.equal((await get('/native-vercel/complete')).status,409);
 await f.start();
 const status=await(await get('/native-vercel/status')).json();assert.deepEqual(status,{state:'pending',project:'new-frontbase',productionId:'dpl_fixture'});
 for(const path of ['/native-vercel/complete','/native-vercel/complete?deployment-url=new-frontbase.vercel.app','/native-vercel/complete?deploymentUrl=new-frontbase.vercel.app']){
  const page=await get(path),html=await page.text();assert.equal(page.status,200);assert(html.includes('data-deployment="new-frontbase.vercel.app"'));assert(!html.includes('private-management-grant'));assert(!html.includes('claim='));
 }
 assert.equal(f.established,0,'refresh/status never write provider state');
 assert.equal((await f.finish()).status,200);
 const receipt=await(await get('/native-vercel/complete')).text();assert(receipt.includes('data-deployment="'+runtime+'"'));assert(!receipt.includes('claim='));assert(!receipt.includes('private-management-grant'));
 assert.deepEqual(await(await get('/native-vercel/status')).json(),{state:'setup-ready',projectId:'prj_fixture'});
 const hostile=await(await get('/native-vercel/complete?deploymentUrl=%22%3E%3Cscript%3E')).text();assert(!hostile.includes('<script>'));assert.equal((await f.finish({deployment:'https://other.vercel.app'})).status,409);assert.equal(f.established,1);
 f.advance();assert.equal((await get('/native-vercel/status')).status,403);
}
{
 const f=await fixture({lost:true});await f.start();assert.equal((await f.finish()).status,409);assert.equal((await f.finish()).status,409);assert.equal(f.established,1,'lost result cannot replay');
}
{
 const f=await fixture();const first=await f.start({code:null});assert.equal(first.status,302);const oauth=new URL(first.headers.get('location'));assert.equal(oauth.origin,'https://vercel.com');assert.match(oauth.searchParams.get('state'),/^native\./);assert.equal(f.established,0);
 const finish=state=>f.app.fetch(new Request(origin+callback+'?'+new URLSearchParams({source:'external',state,code:'new-code'}),{headers:{cookie:f.cookie}}));
 assert.equal((await finish('native.'+'x'.repeat(43))).status,409);
 assert.equal((await finish(oauth.searchParams.get('state'))).status,302);assert.equal((await finish(oauth.searchParams.get('state'))).status,409);assert.equal((await f.finish()).status,200);
}
{
 const f=await fixture();const first=new URL((await f.start({code:null})).headers.get('location')).searchParams.get('state');
 await f.start({code:null});const r=await f.app.fetch(new Request(origin+callback+'?'+new URLSearchParams({source:'external',state:first,code:'new-code'}),{headers:{cookie:f.cookie}}));assert.equal(r.status,409,'pending state belongs to one browser continuation');assert.equal(f.established,0);
}
{
 const f=await fixture();await f.start();const responses=await Promise.all([f.finish(),f.finish()]);assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(f.established,1,'concurrent handoff single-use');
}
console.log('PASS Vercel initial integration → encrypted continuation → verified fresh native claim → inherited grant; reconnect isolation, expiry, team/config/project fences, same-origin POST, lost-result and concurrent no-replay');
