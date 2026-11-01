import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,readFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const output=new URL('../.native-cloud-test/setup-renewal.mjs',import.meta.url);mkdirSync(new URL('.',output),{recursive:true});
const faults={
 'team-owner':['setup-renewal-owner.ts',"matches[0].role!=='OWNER'",'false'],
 'confirmed':['setup-renewal-owner.ts',"matches[0].confirmed!==true",'false'],
 'held':['hosted-cloud.ts',"phase&&phase!=='reviewed'",'false'],
 'account':['setup-renewal-owner.ts','destination.accountId!==account','false'],
 'canonical-origin':['setup-renewal-owner.ts','!destination.targets?.production?.alias?.includes(new URL(origin).hostname)','false'],
 'cf-closed':['setup-renewal-owner.ts',"b.name==='FRONTBASE_BOOTSTRAP'&&b.text==='1'","b.name==='FRONTBASE_BOOTSTRAP'"],
 'cf-root':['setup-renewal-owner.ts','!metadata||JSON.parse(metadata.text).ownerHash!==hash','!metadata'],
};
const mutations={name:'renewal-faults',setup(b){b.onLoad({filter:/(hosted-cloud|setup-renewal-owner)\.ts$/},args=>{let source=readFileSync(args.path,'utf8');const fault=process.env.HOSTED_RENEWAL_FAULT;if(fault){const item=faults[fault];assert.ok(item,'known fault');if(args.path.endsWith(item[0])){assert.equal(source.split(item[1]).length,2,'unique fault anchor');source=source.replace(item[1],item[2]);}}return {contents:source,loader:'ts'};});}};
try{
await build({entryPoints:[fileURLToPath(new URL('../src/hosted-cloud.ts',import.meta.url))],outfile:fileURLToPath(output),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[mutations,{name:'assets',setup(b){b.onResolve({filter:/packages\/edge-core\/dist\/deployment\.js$/},()=>({path:'@frontbase/edge-core/deployment',external:true}));b.onResolve({filter:/packages\/backend\/dist\/compat\/deployment-storage\.js$/},()=>({path:'@frontbase/backend',external:true}));b.onResolve({filter:/packages\/edge-infra\/dist\/index\.js$/},()=>({path:'@frontbase/edge-infra',external:true}));b.onResolve({filter:/packages\/edge-infra\/dist\/providers\/supabase-http\.js$/},()=>({path:'@frontbase/edge-infra/supabase-http',external:true}));b.onResolve({filter:/^virtual:bootstrap-assets$/},()=>({path:'assets',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default {}'}));}}]});
const {createCloudBootstrap}=await import(output.href);
const proofOutput=new URL('renewal-owner.mjs',output);
await build({entryPoints:[fileURLToPath(new URL('../src/setup-renewal-owner.ts',import.meta.url))],outfile:fileURLToPath(proofOutput),bundle:true,platform:'node',format:'esm',plugins:[mutations]});
const {verifySetupRenewalOwner}=await import(proofOutput.href);
const origin='https://renewal-fixture.vercel.app',installation='11111111-2222-4333-8444-555555555555',root='synthetic-root-fixture-'.repeat(3),registration='a'.repeat(43),account='team_fixture',project='prj_fixture';
const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(root))),b=>b.toString(16).padStart(2,'0')).join('');
const cfAccount='a'.repeat(32),cfOrigin='https://renewal-fixture.fixture.workers.dev',cfContext={installationId:installation,target:'cloudflare',destination:cfAccount+'/renewal-fixture/production'},cfGrant={provider:'cloudflare',accessToken:'fresh-cf-fixture',accounts:[{id:cfAccount,name:'Fixture'}],scopes:[]};
let cfState='1',cfIdentity=installation,cfOwnerHash=hash,cfActualOrigin=cfOrigin,cfRedirect=false;
const cfTransport=async(input,init)=>{assert.equal(String(input),'https://api.cloudflare.com/client/v4/accounts/'+cfAccount+'/workers/scripts/renewal-fixture/settings');assert.equal(init.redirect,'manual');assert.ok(init.signal);assert.equal(init.headers.authorization,'Bearer '+cfGrant.accessToken);assert.ok(!init.method||init.method==='GET');return Response.json({success:true,result:{bindings:[{name:'FRONTBASE_BOOTSTRAP',text:cfState},{name:'FRONTBASE_INSTALLATION_ID',text:cfIdentity},{name:'FRONTBASE_PUBLIC_ORIGIN',text:cfActualOrigin},{name:'FRONTBASE_SETUP_METADATA',text:JSON.stringify({ownerHash:cfOwnerHash})}]}},{status:cfRedirect?302:200});};
await verifySetupRenewalOwner(cfContext,cfOrigin,root,cfGrant,cfTransport);
for(const field of ['state','identity','root','origin','redirect']){cfState=field==='state'?'0':'1';cfIdentity=field==='identity'?'other':installation;cfOwnerHash=field==='root'?'other':hash;cfActualOrigin=field==='origin'?'https://other.fixture.workers.dev':cfOrigin;cfRedirect=field==='redirect';await assert.rejects(()=>verifySetupRenewalOwner(cfContext,cfOrigin,root,cfGrant,cfTransport),/setup_ownership_refused/);}
await assert.rejects(()=>verifySetupRenewalOwner(cfContext,cfOrigin,root,{...cfGrant,accounts:[{id:'b'.repeat(32)}]},cfTransport),/setup_ownership_refused/);
const target={origin,host:'vercel',purpose:'connect'},env={FRONTBASE_BOOTSTRAP:'1',FRONTBASE_INSTALLATION_ID:installation,FRONTBASE_PUBLIC_ORIGIN:origin,FRONTBASE_BOOTSTRAP_TOKEN:root,FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN:'retained-fixture-management',FRONTBASE_BOOTSTRAP_EXPIRES_AT:new Date(Date.now()-10000).toISOString(),FRONTBASE_BOOTSTRAP_ACCOUNT:account,FRONTBASE_BOOTSTRAP_PROJECT:project,FRONTBASE_BOOTSTRAP_ENVIRONMENT:'production',FRONTBASE_OAUTH_RELAY_URL:'https://relay.example',FRONTBASE_OAUTH_RELAY_TARGET:JSON.stringify(target),FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY:registration};
const {createSecretCipher}=await import('../../../packages/backend/dist/db/secret-cipher.js');
env.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS=await(await createSecretCipher(root)).encrypt(JSON.stringify([{provider:'vercel',accessToken:'retained-fixture-management',accounts:[{id:account,name:'Fixture'}],scopes:[]}]));
let id=0,owner=true,alias=true,viewer=false,confirmed=true,wrongAccount=false,providerWrites=0,envs=[{id:'claim',key:'FB_NATIVE_'+installation.replaceAll('-','').toUpperCase(),value:JSON.stringify({installationId:installation,ownerHash:hash}),type:'plain',target:['production']}];
const transport=async(input,init={})=>{
 const url=new URL(String(input));assert.equal(init.redirect,'manual');assert.ok(init.signal);
 if(url.origin==='https://relay.example'){if(url.pathname==='/setup-owner/vercel/status')return Response.json({available:true});assert.equal(url.pathname,'/setup-owner/vercel/ticket');return Response.json({target,identity:{provider:'vercel',subject:wrongAccount?'other-user':'owner-user',issuedAt:Date.now(),expiresAt:Date.now()+120000}});}
 assert.equal(url.origin,'https://api.vercel.com');
 if(url.pathname==='/v2/teams/'+account+'/members')return Response.json({members:[{uid:'owner-user',role:viewer?'VIEWER':'OWNER',confirmed}],pagination:{next:null}});
 if(url.pathname==='/v9/projects/'+project)return Response.json({id:project,accountId:owner?account:'team_other',targets:{production:{alias:alias?[new URL(origin).hostname]:[]}}});
 if(url.pathname==='/v9/projects/'+project+'/env')return Response.json({envs});
 if(url.pathname==='/v10/projects/'+project+'/env'&&init.method==='POST'){
  assert.equal(init.headers.authorization,'Bearer retained-fixture-management','identity is never a deployment credential');
  const body=JSON.parse(init.body);assert.ok(!Array.isArray(body));assert.ok(body.key.startsWith('FB_OAUTH_'),'only encrypted vault metadata may be written');if(JSON.parse(body.value).key.startsWith('setup-access:'))providerWrites++;
  if(envs.some(e=>e.key===body.key))return Response.json({error:{code:'ENV_CONFLICT'}},{status:400});envs.push({id:'env-'+(++id),...body});return Response.json({id:'env-'+id});
 }throw Error('Unexpected provider operation '+url.pathname);
};
const host=createCloudBootstrap(env,'vercel',transport);
const call=(path,body,cookie,otherOrigin=origin)=>host.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{origin:otherOrigin,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined}));
const cookie=response=>response.headers.get('set-cookie').split(';')[0];
assert.equal((await call('/frontbase-bootstrap/api/configuration')).status,410);
assert.equal((await call('/frontbase-bootstrap/api/renew',{},undefined,'https://attacker.example')).status,403);assert.equal(providerWrites,0);
async function start(){const response=await call('/frontbase-bootstrap/api/renew',{});assert.equal(response.status,200);const result=await response.json();assert.equal(new URL(result.url).origin,'https://relay.example');return cookie(response);}
const finish=c=>call('/api/provider-oauth/vercel/owner-finish',{ticket:'b'.repeat(43)},c);
let pending=await start();owner=false;assert.equal((await finish(pending)).status,409);assert.equal(providerWrites,0);owner=true;
pending=await start();alias=false;assert.equal((await finish(pending)).status,409);assert.equal(providerWrites,0);alias=true;
pending=await start();wrongAccount=true;assert.equal((await finish(pending)).status,409);assert.equal(providerWrites,0);wrongAccount=false;
pending=await start();viewer=true;assert.equal((await finish(pending)).status,409);assert.equal(providerWrites,0,'a signed-in viewer cannot inherit stored management authority');viewer=false;
pending=await start();confirmed=false;assert.equal((await finish(pending)).status,409);assert.equal(providerWrites,0,'an unconfirmed owner cannot recover setup');confirmed=true;
pending=await start();const result=await finish(pending);assert.equal(result.status,200);const link=(await result.json()).returnPath;assert.ok(link.startsWith('/frontbase-bootstrap/#claim='));assert.equal(providerWrites,1);
assert.equal((await finish(pending)).status,409,'previous OAuth transaction cannot issue another generation');assert.equal(providerWrites,1);
const token=new URLSearchParams(link.split('#')[1]).get('claim');const claim=await call('/frontbase-bootstrap/api/claim',{token});assert.equal(claim.status,200);assert.equal((await call('/frontbase-bootstrap/api/claim',{token:root})).status,403);assert.equal(env.FRONTBASE_BOOTSTRAP_TOKEN,root);
assert.ok(!envs.some(e=>e.key.startsWith('FB_SETUP_')),'renewal never writes provisioning journal');
const record={installationId:installation,target:'vercel',destination:account+'/'+project+'/production',revision:0,phase:'uncertain'};envs.push({key:'FB_SETUP_'+installation.replaceAll('-','').toUpperCase()+'_0',value:JSON.stringify(record),type:'plain',target:['production']});
assert.equal((await call('/frontbase-bootstrap/api/renew',{})).status,409);assert.equal(providerWrites,1,'held operation never renews or provisions');
record.phase='active';envs.at(-1).value=JSON.stringify(record);assert.equal((await call('/frontbase-bootstrap/api/renew',{})).status,409);assert.equal(providerWrites,1);
console.log('PASS full Vercel renewal: expired initial access, CSRF, fresh identity plus confirmed team OWNER, account/origin/claim checks, one encrypted generation, replay/held/installed refusal, zero resources or claim replay');
}finally{rmSync(output,{force:true});rmSync(new URL('renewal-owner.mjs',output),{force:true});}
