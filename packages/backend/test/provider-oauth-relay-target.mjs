import assert from 'node:assert/strict';
const {relayTargetPolicy}=await import(process.env.FRONTBASE_RELAY_TARGET_TEST_MODULE??'../dist/provider-oauth-relay-target.js');
import {providerOAuthRelay} from '../dist/provider-oauth-config.js';
const account='a'.repeat(32),team='team_fixture',installationId='00000000-0000-4000-a000-000000000001';
let settings={success:true,result:{bindings:[{name:'FRONTBASE_INSTALLATION_ID',text:installationId},{name:'FRONTBASE_HOSTED_SETUP',text:'1'},{name:'FRONTBASE_BOOTSTRAP',text:'native'}]}},deployment={projectId:'prj_fixture',readyState:'READY',target:'production',url:'fixture.vercel.app'},calls=[];
const {admit,verify}=relayTargetPolicy({cloudflareAccount:account,cloudflareSubdomain:'fixture',vercelTeam:team,connectedOrigins:['https://installed.example']},async(url,init)=>{calls.push(String(url));assert.equal(init.redirect,'manual');assert.equal(init.headers.authorization,'Bearer fixture-token');return Response.json(String(url).includes('cloudflare.com')?settings:String(url).includes('/deployments/')?deployment:{targets:{production:{alias:['stable.vercel.app']}}});});
const target={origin:'https://test.fixture.workers.dev',host:'cloudflare',purpose:'install',account,project:'test',installationId},grant={provider:'cloudflare',accessToken:'fixture-token',accounts:[{id:account,name:'Fixture'}],scopes:[]};
assert.equal(admit(target,'cloudflare'),true);await verify(target,grant);assert.equal(calls.length,1);
for(const patch of [{origin:'https://attacker.example'},{origin:target.origin+':8443'},{account:'b'.repeat(32)},{installationId:'bad'},{project:'../other'},{extra:'field'}])assert.equal(admit({...target,...patch},'cloudflare'),false);
assert.equal(admit(target,'vercel'),false);
await assert.rejects(verify(target,{...grant,accounts:[{id:'b'.repeat(32)}]}));
settings.result.bindings.push({name:'DB',type:'d1'});await assert.rejects(verify(target,grant));settings.result.bindings.pop();
settings.result.bindings[0].text='00000000-0000-4000-a000-000000000002';await assert.rejects(verify(target,grant));settings.result.bindings[0].text=installationId;
settings.result.bindings[1].text='0';await assert.rejects(verify(target,grant));settings.result.bindings[1].text='1';
settings.result.bindings[2].text='0';await assert.rejects(verify(target,grant));settings.result.bindings[2].text='native';
await assert.rejects(verify(target,{...grant,expiresAt:Date.now()-1}));
const v={origin:'https://stable.vercel.app',host:'vercel',purpose:'install',account:team,project:'prj_fixture',deploymentId:'dpl_fixture',installationId},vg={...grant,provider:'vercel',accounts:[{id:team}]};await verify(v,vg);
await assert.rejects(verify({...v,origin:'https://other.vercel.app'},vg));
for(const patch of [{projectId:'prj_other'},{readyState:'BUILDING'},{target:'preview'}]){const previous=deployment;deployment={...previous,...patch};await assert.rejects(verify(v,vg));deployment=previous;}
const enrolled={origin:'https://installed.example',host:'docker',purpose:'connect'};assert.equal(admit(enrolled,'cloudflare'),true);const before=calls.length;await verify(enrolled,grant);assert.equal(calls.length,before);assert.equal(admit({...enrolled,origin:'https://other.example'},'cloudflare'),false);
const env={FRONTBASE_OAUTH_RELAY_URL:'https://relay.example',FRONTBASE_OAUTH_RELAY_TARGET:JSON.stringify(enrolled)};assert.equal(providerOAuthRelay(env,enrolled.origin).relayOrigin,'https://relay.example');assert.equal(providerOAuthRelay({},enrolled.origin),undefined);
for(const patch of [{FRONTBASE_OAUTH_RELAY_URL:'http://relay.example'},{FRONTBASE_OAUTH_RELAY_URL:'https://relay.example/path'},{FRONTBASE_OAUTH_RELAY_TARGET:JSON.stringify({...enrolled,origin:'https://other.example'})},{FRONTBASE_OAUTH_RELAY_TARGET:JSON.stringify({...enrolled,purpose:'install'})}])assert.throws(()=>providerOAuthRelay({...env,...patch},enrolled.origin));
console.log('PASS relay account/deployment/alias/native-state ownership, enrolled origins and trusted operator configuration');

for(const patch of [{connectedOrigins:'https://installed.example'},{connectedOrigins:['http://installed.example']},{connectedOrigins:['https://installed.example','https://installed.example']},{cloudflareAccount:'wrong'},{vercelTeam:'wrong'}])assert.throws(()=>relayTargetPolicy({cloudflareAccount:account,cloudflareSubdomain:'fixture',vercelTeam:team,connectedOrigins:[],...patch},async()=>Response.json({})));
