import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {sqlOAuthRelayVault,sqlOAuthNativeClaims} from '../dist/provider-oauth-relay-store.js';
import {nativeInstallationId} from '../../../scripts/deployment-setup/native-build-metadata.mjs';
const {createVercelNativeIntegration}=await import(process.env.FRONTBASE_VERCEL_NATIVE_TEST_MODULE??new URL('../dist/vercel-native-integration.js',import.meta.url));
const origin='https://relay.example',runtime='https://new-frontbase.vercel.app',callback='/api/provider-oauth/vercel/callback';
const client={provider:'vercel',clientId:'oac_fixture',clientSecret:'private-client-secret',integrationSlug:'frontbase',redirectUri:origin+callback,scopes:[]};
async function fixture(fault={}){
 let stamp=1900000000000,calls=[],established=0,verified=0;
 const db=new DatabaseSync(':memory:'),runner={query:async(s,p=[])=>db.prepare(s).all(...p),exec:async(s,p=[])=>{if(p.length)db.prepare(s).run(...p);else db.exec(s);}};
 const vault=await sqlOAuthRelayVault(runner,()=>stamp),cipher=await createSecretCipher('native-vercel-test-secret-'.repeat(3)),claim=await sqlOAuthNativeClaims(runner,()=>stamp);
 const deps={origin,client,vault,cipher,now:()=>stamp,claimInstallation:claim,verify:async(t,a)=>{verified++;assert.equal(t.project,'prj_fixture');assert.equal(a.accessToken,'private-management-grant');},establish:async(c,a)=>{established++;assert.equal(c.target.installationId,nativeInstallationId('vercel','team_fixture','prj_fixture'));assert.match(c.registrationKey,/^[\w-]{43}$/);assert.equal(a.accessToken,'private-management-grant');if(fault.lost)throw Error('lost');return{returnPath:'/frontbase-bootstrap/activation#claim='+'a'.repeat(64)};},fetch:async(input,init={})=>{
  const u=new URL(input);calls.push({url:u.href,method:init.method??'GET'});assert.equal(init.redirect,'manual');
  if(u.origin==='https://api.vercel.com'){
   if(u.pathname==='/v2/oauth/access_token'){assert.equal(new URLSearchParams(init.body).get('client_secret'),client.clientSecret);return Response.json({access_token:'private-management-grant',team_id:fault.team??'team_fixture',installation_id:fault.configuration??'icfg_fixture'});}
   assert.equal(init.headers.authorization,'Bearer private-management-grant');
   if(u.pathname==='/v1/integrations/configuration/icfg_fixture')return Response.json({id:'icfg_fixture',integrationId:fault.integration??client.clientId,teamId:'team_fixture',projects:[fault.project??'prj_fixture']});
   if(u.pathname==='/v2/teams/team_fixture')return Response.json({id:'team_fixture',name:'Fixture team'});
   if(u.pathname==='/v9/projects/prj_fixture')return Response.json({id:'prj_fixture',accountId:'team_fixture',name:'new-frontbase',rootDirectory:'examples/cf-full',createdAt:stamp-(fault.old?3600000:10000)});
   if(u.pathname==='/v13/deployments/new-frontbase.vercel.app')return Response.json({id:'dpl_fixture',teamId:'team_fixture',projectId:'prj_fixture',target:fault.preview?'preview':'production',readyState:'READY',alias:[fault.alias??'new-frontbase.vercel.app']});
  }
  if(u.origin===runtime&&u.pathname==='/frontbase-bootstrap/native-configuration')return fault.initialized?new Response('gone',{status:410}):Response.json({target:fault.native??'vercel'});
  throw Error('Unexpected egress '+u.origin+u.pathname);
 }};
 const {app,accepts}=createVercelNativeIntegration(deps),query=new URLSearchParams({source:'deploy-button','external-id':'frontbase-native-v1',teamId:'team_fixture',configurationId:'icfg_fixture',currentProjectId:'prj_fixture',next:'https://vercel.com/new/continue',code:'one-use-provider-code'});
 let cookie='';
 async function start(overrides={}){const q=new URLSearchParams(query);for(const[k,v]of Object.entries(overrides))v===null?q.delete(k):q.set(k,v);const response=await app.fetch(new Request(origin+callback+'?'+q));cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;return response;}
 const finish=(overrides={},headers={})=>app.fetch(new Request(origin+'/native-vercel/finish',{method:'POST',headers:{cookie,origin,'content-type':'application/json',...headers},body:JSON.stringify({deployment:runtime,...overrides})}));
 return{db,vault,app,accepts,start,finish,query,get cookie(){return cookie;},get established(){return established;},get verified(){return verified;},calls,advance(){stamp+=600001;}};
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
for(const fault of [{team:'team_other'},{configuration:'icfg_other'},{integration:'oac_other'},{project:'prj_other'},{old:true}]){const f=await fixture(fault);assert.equal((await f.start()).status,409,JSON.stringify(fault));assert.equal(f.established,0);}
for(const overrides of [{next:'https://attacker.example/new/'},{next:'https://vercel.com/account'},{'external-id':'wrong'},{currentProjectId:'wrong'}]){const f=await fixture();assert.equal((await f.start(overrides)).status,409);assert.equal(f.calls.length,0);}
for(const fault of [{preview:true},{alias:'other.vercel.app'},{initialized:true},{native:'cloudflare'}]){const f=await fixture(fault);assert.equal((await f.start()).status,302);assert.equal((await f.finish()).status,409);assert.equal(f.established,0);}
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
