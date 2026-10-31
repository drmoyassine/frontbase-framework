import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createSecretCipher} from '@frontbase/backend';
const out=new URL('../.native-claim-test/',import.meta.url);mkdirSync(out,{recursive:true});
try{
 await build({entryPoints:[fileURLToPath(new URL('../src/native-claim.ts',import.meta.url))],outfile:fileURLToPath(new URL('claim.mjs',out)),bundle:true,platform:'node',format:'esm',packages:'external'});
 const {claimNativeInstallation}=await import(new URL('claim.mjs',out));
 const registrationKey='a'.repeat(43),installationId='11111111-2222-4333-8444-555555555555',database='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 async function fixture(host,fault,buildClaim=false){
  const account=host==='cloudflare'?'a'.repeat(32):'team_fixture',project=host==='cloudflare'?'native-fixture':'prj_fixture',origin=host==='cloudflare'?'https://native-fixture.fixture.workers.dev':'https://native-fixture.vercel.app';
  const target={origin,host,purpose:'install',account,project,installationId,...(host==='vercel'?{deploymentId:'dpl_fixture'}:{})},key=fault==='bad-key'?'short':registrationKey;
  const grant={provider:host,accessToken:'sensitive-fixture-token',accounts:[{id:account,name:'Fixture'}],expiresAt:Date.now()+3600000};
  const db=new DatabaseSync(':memory:');let writes=[],settings,variables,metadataVersion;let metadataNumber=1;
  const bindings=[{type:'assets',name:'ASSETS'},{type:'plain_text',name:'FRONTBASE_HOSTED_SETUP',text:'1'},{type:'plain_text',name:'FRONTBASE_BOOTSTRAP',text:'native'},{type:'plain_text',name:'FRONTBASE_INSTALLATION_ID',text:installationId}];
  if(fault==='occupied')bindings.push({type:'d1',name:'DB',id:database});
  if(fault==='unknown')bindings.push({type:'service',name:'UNRELATED'});
  if(fault==='assets')bindings.shift();
  if(fault==='identity')bindings.find(b=>b.name==='FRONTBASE_INSTALLATION_ID').text='other';
  metadataVersion={id:'aaaaaaaa-1111-4222-8333-aaaaaaaaaaaa',number:1,env:{...Object.fromEntries(bindings.map(b=>[b.name,b])),FRONTBASE_BOOTSTRAP:{type:'plain_text',text:'native'},FRONTBASE_NATIVE_ACCOUNT:{type:'plain_text',text:account},FRONTBASE_NATIVE_PROJECT:{type:'plain_text',text:project}}};
  const transport=async(input,init={})=>{
   const url=new URL(String(input)),method=init.method??'GET',body=typeof init.body==='string'?JSON.parse(init.body):undefined;
   assert.equal(url.origin,host==='cloudflare'?'https://api.cloudflare.com':'https://api.vercel.com');assert.equal(init.redirect,'manual');assert.equal(init.headers.authorization,'Bearer sensitive-fixture-token');
   const cf=result=>Response.json({success:true,result});
   if(url.pathname.includes('/workers/workers/')&&url.pathname.endsWith('/versions/latest')){if(method==='GET')return cf(metadataVersion);assert.equal(method,'PATCH');assert.equal(init.headers['content-type'],'application/merge-patch+json');writes.push('metadata');if(fault==='metadata-refused')return Response.json({success:false,errors:[{code:10000,message:'private detail sensitive-fixture-token'}]},{status:403});metadataVersion={id:'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb',number:++metadataNumber,env:Object.fromEntries(Object.entries({...metadataVersion.env,...body.env}).filter(([,v])=>v!==null))};if(fault==='lost')throw Error('lost committed response');return cf(metadataVersion);}
   if(url.pathname.endsWith('/settings')){if(method==='GET')return cf({bindings});writes.push('settings');settings=JSON.parse(init.body.get('settings'));if(fault==='lost')throw Error('lost committed response');return cf({});}
   if(url.pathname.includes('/d1/'))throw Error('native ownership must not allocate or query D1');
   if(url.pathname.endsWith('/query')){const statement=db.prepare(body.sql);const results=statement.columns().length?statement.all(...body.params):[];if(!statement.columns().length)statement.run(...body.params);return cf([{results,meta:{changes:1}}]);}
   if(url.pathname.endsWith('/deployments/dpl_fixture'))return Response.json({projectId:project,readyState:'READY',target:fault==='preview'?'preview':'production',url:new URL(origin).hostname});
   if(url.pathname.endsWith('/projects/'+project))return Response.json({name:'native-fixture',targets:{production:{alias:fault==='alias'?[]:[new URL(origin).hostname]}}});
   if(url.pathname.endsWith('/env')){writes.push('env');if(fault==='conflict')return Response.json({error:{code:'ENV_CONFLICT'}},{status:400});if(Array.isArray(body)){variables=body;return Response.json({created:body,failed:[]});}return Response.json({created:{id:'env_claim'},failed:[]});}
   if(url.pathname.endsWith('/deployments')&&host==='cloudflare'){if(method==='GET')return cf({deployments:[{versions:[{version_id:metadataVersion.id,percentage:100}]}]});assert.equal(body.strategy,'percentage');assert.equal(body.versions[0].version_id,metadataVersion.id);settings={bindings:Object.entries(metadataVersion.env).map(([name,b])=>({...b,name}))};writes.push('deploy');return cf({id:'new-deployment'});}
   if(url.pathname.endsWith('/deployments')){assert.equal(body.deploymentId,'dpl_fixture');assert.equal(body.withLatestCommit,false);assert.equal(body.target,'production');writes.push('deploy');return Response.json({id:'dpl_next'});}
   throw Error('unexpected endpoint '+url.pathname);
  };
  try{
   if(fault){await assert.rejects(()=>claimNativeInstallation({target,relayOrigin:'https://relay.example',registrationKey:key},grant,transport),fault==='metadata-refused'?/^Error: native_installation_refused$/:undefined);assert.equal(writes.filter(x=>x==='database').length,0);assert.equal(writes.filter(x=>x==='metadata').length,['lost','metadata-refused'].includes(fault)?1:0);assert.equal(writes.filter(x=>x==='deploy').length,0);if(fault==='metadata-refused')assert.equal(writes.includes('settings'),false);return;}
   const context=buildClaim?{target,relayOrigin:'https://relay.example',buildOwner:'f'.repeat(64)}:{target,relayOrigin:'https://relay.example',registrationKey:key};
   if(buildClaim){for(const invalid of [{...context,buildOwner:'short'},{...context,registrationKey:key}])await assert.rejects(()=>claimNativeInstallation(invalid,grant,transport));assert.equal(writes.length,0,'invalid build owner must fail before provider writes');}
   const result=await claimNativeInstallation(context,grant,transport),owner=new URLSearchParams(result.returnPath.split('#')[1]).get('claim');assert.match(owner,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(result).includes(grant.accessToken));assert.ok(!JSON.stringify(result).includes(registrationKey));
   const env=host==='cloudflare'?Object.fromEntries(settings.bindings.filter(b=>b.text!==undefined).map(b=>[b.name,b.text])):Object.fromEntries(variables.map(v=>[v.key,v.value]));
   if(buildClaim){assert.equal(owner,'f'.repeat(64));assert.match(env.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY,/^[\w-]{43}$/);assert.equal(env.FRONTBASE_OAUTH_RELAY_URL,'https://relay.example');assert.equal(env.FRONTBASE_OAUTH_RELAY_ENROLL,'1');assert.equal(settings.bindings.find(b=>b.name==='FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN').type,'secret_text');assert.equal(settings.bindings.find(b=>b.name==='FRONTBASE_BOOTSTRAP_TOKEN').type,'secret_text');assert.equal(settings.bindings.find(b=>b.name==='FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY').type,'secret_text');}
   else{assert.equal(env.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY,registrationKey);if(host==='cloudflare')assert.equal(settings.bindings.find(b=>b.name==='FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY').type,'secret_text');}
   assert.equal(env.FRONTBASE_BOOTSTRAP,'1');assert.equal(env.FRONTBASE_BOOTSTRAP_TOKEN,owner);assert.equal(env.FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN,grant.accessToken);
   const cipher=await createSecretCipher(owner);assert.ok(cipher.isEncrypted(env.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS));const retained=JSON.parse(await cipher.decrypt(env.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS));assert.equal(retained[0].accessToken,grant.accessToken);
   if(host==='cloudflare'){assert.equal(writes.filter(x=>x==='database').length,0);assert.equal(writes.filter(x=>x==='metadata').length,1);assert.equal(env.FRONTBASE_BOOTSTRAP_STORE,'versions-v1');assert.equal(env.FRONTBASE_BOOTSTRAP_BASE_VERSION,'2');assert.equal(settings.bindings.some(b=>b.type==='d1'||b.type==='kv_namespace'),false);assert.deepEqual(settings.bindings.filter(b=>b.type==='assets'),[{type:'assets',name:'ASSETS'}]);}
   else{assert.equal(writes.filter(x=>x==='deploy').length,1);assert.ok(variables.every(v=>v.type==='encrypted'));}
  }finally{db.close();}
 }
 await fixture('cloudflare');for(const fault of ['occupied','unknown','assets','identity','lost','bad-key','metadata-refused'])await fixture('cloudflare',fault);
 await fixture('cloudflare',undefined,true);
 await fixture('vercel');for(const fault of ['preview','conflict','bad-key'])await fixture('vercel',fault);
 console.log('PASS native establish hooks: verified deployment, provider metadata ownership without resource provisioning, encrypted grant handoff, secret-free receipt, existing/unknown state refusal and no replay after lost response');
}finally{rmSync(out,{recursive:true,force:true});}
