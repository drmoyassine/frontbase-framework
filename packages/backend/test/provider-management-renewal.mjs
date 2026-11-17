import assert from 'node:assert/strict';
import {refreshOAuthAuthorization} from '../dist/provider-oauth-refresh.js';
import {providerManagementConfig} from '../dist/provider-management-renewal.js';
import {vercelRenewalProof,readVercelRenewalProof} from '../dist/provider-oauth-renewal-proof.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {providerAuthorizationConfig} from '../dist/provider-oauth-store.js';
import {createProviderOAuthRelay} from '../dist/provider-oauth-relay.js';
import {providerOAuthClients} from '../dist/provider-oauth-config.js';

const time=Date.parse('2026-11-18T00:00:00Z'),now=()=>new Date(time).toISOString();
const cipher=await createSecretCipher('renewal-proof-fixture-secret');
const target={origin:'https://app.example',host:'vercel',purpose:'connect'};
const vercel={provider:'vercel',accessToken:'expired',installationId:'icfg_fixture',accounts:[{id:'team_fixture',name:'Fixture'}],scopes:['deployment:write'],expiresAt:time-1};
vercel.renewalProof=await vercelRenewalProof(cipher,target,vercel);
assert.deepEqual(await readVercelRenewalProof(cipher,target,vercel.renewalProof),{installationId:'icfg_fixture',teamId:'team_fixture'});
for(const wrong of [{...target,origin:'https://other.example'},{...target,host:'cloudflare'}])await assert.rejects(readVercelRenewalProof(cipher,wrong,vercel.renewalProof));
await assert.rejects(readVercelRenewalProof(cipher,target,vercel.renewalProof+'x'));
assert.ok(providerOAuthClients({FRONTBASE_CLOUDFLARE_OAUTH_CLIENT_ID:'fixture',FRONTBASE_CLOUDFLARE_OAUTH_SCOPES:'account-settings.read offline_access'},'https://relay.example').cloudflare.scopes.includes('offline_access'));
assert.ok(!providerOAuthClients({FRONTBASE_CLOUDFLARE_OAUTH_CLIENT_ID:'fixture',FRONTBASE_CLOUDFLARE_OAUTH_SCOPES:'account-settings.read'},'https://relay.example').cloudflare.scopes.includes('offline_access'),'operator enables refresh scope only for a refresh-capable registration');
let relayCalls=0;
const relay=createProviderOAuthRelay({origin:'https://relay.example',cipher,vault:{purge:async()=>{}},clients:{vercel:{provider:'vercel',clientId:'client',clientSecret:'private',redirectUri:'https://relay.example/callback',scopes:[]}},
 admit:t=>t.origin===target.origin&&t.host===target.host,verifyReceiver:async(t,proof)=>proof===Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('r'.repeat(43)))).toString('base64url'),
 fetch:async(url,init)=>{relayCalls++;assert.equal(new URLSearchParams(init.body).get('installation_id'),'icfg_fixture');return Response.json({access_token:'relay-renewed',expires_in:3600,installation_id:'icfg_fixture',team_id:'team_fixture'});}});
const relayRequest=(body,headers={})=>relay.fetch(new Request('https://relay.example/vercel/refresh',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
const relayBody={target,verifier:'r'.repeat(43),renewalProof:vercel.renewalProof};
for(const [body,headers] of [[{...relayBody,verifier:'x'.repeat(43)},{}],[relayBody,{origin:target.origin}],[relayBody,{cookie:'browser=1'}],[{...relayBody,installationId:'icfg_foreign'},{}],[{...relayBody,renewalProof:await vercelRenewalProof(cipher,{...target,origin:'https://foreign.example'},vercel)},{}]]){
 assert.ok((await relayRequest(body,headers)).status>=400);
}
assert.equal(relayCalls,0,'admission and proof fences precede the provider exchange');
const relayResult=await (await relayRequest(relayBody)).json();
assert.equal(relayResult.accessToken,'relay-renewed');assert.equal(relayResult.installationId,'icfg_fixture');assert.equal(relayResult.renewalProof,vercel.renewalProof);assert.equal(relayCalls,1);
for(const provider of ['cloudflare','vercel']){
 let state=providerAuthorizationConfig(provider==='vercel'?vercel:{provider,accessToken:'expired',refreshToken:'refresh-old',expiresAt:time-1,accounts:[{id:'account',name:'Fixture'}],scopes:['offline_access']});
 state.project_settings={preserve:true};let calls=0;
 const client={provider,clientId:'client',clientSecret:'private',redirectUri:'https://relay.example/callback',scopes:[]};
 const fetch=async(url,init)=>{
  calls++;const body=new URLSearchParams(init.body);
  assert.equal(body.get('grant_type'),provider==='vercel'?'client_credentials':'refresh_token');
  if(provider==='vercel'){assert.equal(body.get('installation_id'),'icfg_fixture');assert.equal(new Headers(init.headers).get('authorization'),'Basic '+btoa('client:private'));}
  else{assert.equal(body.get('refresh_token'),'refresh-old');assert.equal(body.get('client_secret'),'private');}
  await new Promise(r=>setTimeout(r,30));
  return Response.json({access_token:'renewed',expires_in:3600,token_type:'bearer',...(provider==='vercel'?{installation_id:'icfg_fixture',team_id:'team_fixture'}:{refresh_token:'refresh-new'})});
 };
 const store={getEdgeResourceConfig:async()=>structuredClone(state),getEdgeResource:async()=>({kind:'provider',provider}),refreshOAuthAccountConfig:async(id,p,before,after)=>{assert.equal(p,provider);if(JSON.stringify(state)===JSON.stringify(before))state=structuredClone(after);}};
 const config=providerManagementConfig(()=>store,{clients:{[provider]:client},fetch,now});
 const results=await Promise.all([config('tenant','same-account'),config('tenant','same-account')]);
 assert.equal(calls,1);for(const result of results){assert.equal(result.access_token,'renewed');assert.deepEqual(result.project_settings,{preserve:true});assert.equal(result.oauth_refresh_lease,undefined);}
 assert.equal((await config('tenant','same-account')).access_token,'renewed');assert.equal(calls,1);
 if(provider==='vercel')for(const mismatch of [{installation_id:'icfg_foreign',team_id:'team_fixture'},{installation_id:'icfg_fixture',team_id:'team_foreign'}])await assert.rejects(refreshOAuthAuthorization(client,vercel,{fetch:async()=>Response.json({access_token:'wrong',expires_in:3600,...mismatch})}));
}
const durable={access_token:'bootstrap-expired',api_token:'durable-key',oauth:{provider:'upstash',expires_at:time-1,management:{email:'fixture@example.com',apiKey:'durable-key'}}};
const legacy={access_token:'legacy-vercel',oauth:{provider:'vercel'}};
for(const state of [durable,legacy]){
 const config=providerManagementConfig(()=>({getEdgeResourceConfig:async()=>state}),{fetch:async()=>{throw Error('Unnecessary exchange');},now});
 assert.equal(await config('tenant','account'),state);
}
console.log('Provider renewal: CF rotation, Vercel installation/team binding, receiver-bound sealed proof, concurrency, preserved settings, legacy Vercel and durable Upstash PASS');
