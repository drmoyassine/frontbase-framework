import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createSecretCipher} from '@frontbase/backend';
import {build} from 'esbuild';
import {mkdirSync,rmSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=new URL('../.hosted-test/',import.meta.url);mkdirSync(out,{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('../src/hosted-cloud.ts',import.meta.url))],outfile:fileURLToPath(new URL('host.mjs',out)),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'assets',setup(b){b.onLoad({filter:/hosted-cloud\.ts$/},args=>{let text=readFileSync(args.path,'utf8');const fault=process.env.HOSTED_CLOUD_FAULT;const mutations={'receiver-secret':["b.name==='FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY'?b.type==='secret_text'","b.name==='FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY'?true"],'origin':["if(new URL(request.url).origin!==origin)","if(false)"],'bindings':["bindings.some(b=>!initialBinding(b))","false"],'completion':["bootstrapDisabled:true","bootstrapDisabled:false"],'assets':["if(b.type==='assets'&&b.name==='ASSETS')bindings.push(b);","if(false)bindings.push(b);"]};if(fault){const [from,to]=mutations[fault]??[];if(!from||!text.includes(from))throw Error('mutation anchor missing');text=text.replace(from,to);}return{contents:text,loader:'ts'};});b.onResolve({filter:/packages\/edge-core\/dist\/deployment\.js$/},()=>({path:'@frontbase/edge-core/deployment',external:true}));b.onResolve({filter:/packages\/backend\/dist\/compat\/deployment-storage\.js$/},()=>({path:'@frontbase/backend',external:true}));b.onResolve({filter:/^virtual:bootstrap-assets$/},()=>({path:'assets',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default {}'}));}}]});
const {createCloudBootstrap,bootstrapRuntimeProof,completeCloudBootstrap}=await import(new URL('host.mjs',out));
const id='11111111-2222-4333-8444-555555555555',database='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',origin='https://setup.example';
const makeEnv=target=>({FRONTBASE_BOOTSTRAP:'1',FRONTBASE_INSTALLATION_ID:id,FRONTBASE_PUBLIC_ORIGIN:origin,FRONTBASE_BOOTSTRAP_TOKEN:'owner-fixture-'.repeat(4),FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN:'provider-fixture',FRONTBASE_BOOTSTRAP_EXPIRES_AT:new Date(Date.now()+3600000).toISOString(),FRONTBASE_BOOTSTRAP_ACCOUNT:target==='cloudflare'?'a'.repeat(32):'team_fixture',FRONTBASE_BOOTSTRAP_PROJECT:target==='cloudflare'?'test-worker':'prj_fixture',FRONTBASE_BOOTSTRAP_PROJECT_NAME:'test-project',FRONTBASE_BOOTSTRAP_ENVIRONMENT:'production',VERCEL_DEPLOYMENT_ID:'dpl_initial'});
async function fixture(target,pending=false){
 const env=makeEnv(target),db=new DatabaseSync(':memory:'),vars=new Map(),writes=[],queries=[];let d1=false,activeEnv,deployments=[],unknownBinding=false,occupiedKV=false,lost=false;
 if(process.env.HOSTED_CLOUD_RELAY==='1'){env.FRONTBASE_OAUTH_RELAY_URL='https://relay.example';env.FRONTBASE_OAUTH_RELAY_TARGET=JSON.stringify({origin,host:target,purpose:'connect'});env.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY='a'.repeat(43);env.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS=await(await createSecretCipher(env.FRONTBASE_BOOTSTRAP_TOKEN)).encrypt(JSON.stringify([{provider:target,accessToken:'sensitive-native-grant',accounts:[{id:env.FRONTBASE_BOOTSTRAP_ACCOUNT,name:'Native fixture'}],expiresAt:Date.now()+3600000}]));}
 let bindings=Object.entries(env).filter(([name])=>name.startsWith('FRONTBASE_')&&name!=='FRONTBASE_BOOTSTRAP_PROJECT_NAME').map(([name,text])=>({name,text,type:name.endsWith('TOKEN')||name==='FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY'?'secret_text':'plain_text'}));bindings.push({name:'ASSETS',type:'assets'});
 const transport=async(input,init={})=>{assert.notEqual(init.redirect,'error','Workers supports manual/follow redirect modes');const url=new URL(String(input)),method=init.method??'GET',body=typeof init.body==='string'?JSON.parse(init.body):null;const cf=result=>Response.json({success:true,result});
 if(url.origin==='https://relay.example'){assert.equal(url.pathname,'/health');return Response.json({providers:['cloudflare']});}
 if(url.origin===origin){if(!activeEnv||pending)return new Response('pending',{status:503});return bootstrapRuntimeProof(new Request(url,init),activeEnv,async()=>new Response('ok'));}
 assert.ok(['api.cloudflare.com','api.vercel.com'].includes(url.hostname),'no arbitrary egress');
 if(url.pathname.endsWith('/query')){queries.push(body.sql);const statement=db.prepare(body.sql),result=statement.columns().length?statement.all(...body.params):[];if(!statement.columns().length)statement.run(...body.params);return cf([{results:result,meta:{changes:1}}]);}
 if(url.pathname.endsWith('/d1/database')){if(method==='GET')return cf(d1?[{name:'fb-setup-'+id,uuid:database}]:[]);assert.equal(d1,false);d1=true;writes.push('database');return cf({uuid:database});}
 if(url.pathname.endsWith('/settings')){if(method==='GET')return cf({bindings:[...bindings,...(unknownBinding?[{name:'UNRELATED',type:'service'}]:[])]});bindings=JSON.parse(init.body.get('settings')).bindings;activeEnv=Object.fromEntries(bindings.filter(b=>b.text!==undefined).map(b=>[b.name,b.text]));writes.push('activate');return cf({});}
 if(url.pathname.endsWith('/storage/kv/namespaces')){writes.push('kv');return cf({id:'b'.repeat(32)});}
 if(url.pathname.endsWith('/keys'))return cf(occupiedKV?[{name:'occupied'}]:[]);
 if(url.pathname.endsWith('/env')){if(method==='GET')return Response.json({envs:[...vars.values()]});if(Array.isArray(body)){for(const v of body)vars.set(v.key,{...v,id:v.key});activeEnv=Object.fromEntries([...vars.values()].map(v=>[v.key,v.value]));writes.push('env');return Response.json({created:body,failed:[]});}if(vars.has(body.key))return Response.json({error:{code:'ENV_CONFLICT'}},{status:400});vars.set(body.key,{...body,id:body.key});if(lost){lost=false;throw Error('lost committed response');}return Response.json({created:{id:body.key},failed:[]});}
 if(url.pathname.endsWith('/deployments/dpl_initial'))return Response.json({projectId:'prj_fixture',readyState:'READY',target:'production'});
 if(url.pathname.endsWith('/deployments')){if(method==='POST'){assert.equal(body.withLatestCommit,false);assert.equal(body.deploymentId,'dpl_initial');writes.push('deploy');deployments.push({meta:body.meta,target:'production',state:'READY'});return Response.json({id:'dpl_next'});}return Response.json({deployments});}
 throw Error('unexpected route '+url.pathname);
 };
 let host=createCloudBootstrap(env,target,transport),cookie;
 const transitioning=await host.fetch(new Request(origin+'/setup'));
 assert.equal(transitioning.status,503);
 assert.equal(transitioning.headers.get('location'),null,'old runtime must not move the admin claim into the bootstrap path');
 assert.equal(transitioning.headers.get('cache-control'),'no-store');
 assert.equal(transitioning.headers.get('retry-after'),'2');
 assert.ok((await transitioning.text()).includes('http-equiv="refresh"'));
 const request=async(path,body)=>host.fetch(new Request(origin+'/frontbase-bootstrap/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
 assert.equal((await host.fetch(new Request('https://wrong.example/health'))).status,403);assert.equal((await request('configuration')).status,403);assert.equal(writes.length,0);
 const claim=await request('claim',{token:env.FRONTBASE_BOOTSTRAP_TOKEN});assert.equal(claim.status,200);cookie=claim.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('initialize',{})).status,200);
 if(process.env.HOSTED_CLOUD_RELAY==='1'){const status=await host.fetch(new Request(origin+'/api/provider-oauth/status',{headers:{cookie}}));assert.equal(status.status,200);assert.equal((await status.json()).providers.find(p=>p.provider==='cloudflare').available,true);const start=await host.fetch(new Request(origin+'/api/provider-oauth/cloudflare/start',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({returnPath:'/frontbase-bootstrap/'})}));assert.equal(start.status,200);assert.equal(new URL((await start.json()).url).origin,'https://relay.example');}
 let config=await(await request('configuration')).json(),manifest=config.manifest,credentials={};
 if(target==='vercel'){manifest.bindings['state-db']={adapterId:'d1-http',mode:'connect',config:{accountId:'a'.repeat(32),databaseId:database},secretRefs:{token:'state/token'}};credentials={'state/token':'fixture-state-secret'};}
 if(target==='cloudflare'){unknownBinding=true;assert.equal((await request('review',{manifest})).status,409);unknownBinding=false;if(env.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY){const keyBinding=bindings.find(b=>b.name==='FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY');keyBinding.type='plain_text';assert.equal((await request('review',{manifest})).status,409,'receiver registration cannot be a plain Worker variable');keyBinding.type='secret_text';}}
 const review=await request('review',{manifest});assert.equal(review.status,200);const {reviewId}=await review.json();
 // Independent runtime instances share the provider journal; only one dispatch wins.
 const other=createCloudBootstrap(env,target,transport);
 const attempts=await Promise.allSettled([host,other].map(h=>h.fetch(new Request(origin+'/frontbase-bootstrap/api/apply',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({reviewId,credentials})}))));
 const results=await Promise.all(attempts.map(async r=>r.status==='fulfilled'?{status:r.value.status,body:await r.value.json()}:null));
 assert.equal(results.filter(r=>r?.body.phase===(pending?'uncertain':'active')).length,1,JSON.stringify(results));assert.equal(writes.filter(x=>x===(target==='cloudflare'?'activate':'deploy')).length,1);
 if(pending){const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});await completeCloudBootstrap({...env,...activeEnv,FRONTBASE_SETUP_JOURNAL:{prepare}},target,async()=>new Response('healthy'),transport);}
 if(process.env.HOSTED_CLOUD_RELAY==='1'){
  assert.equal(activeEnv.FRONTBASE_OAUTH_RELAY_URL,'https://relay.example');assert.equal(activeEnv.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY,'a'.repeat(43));if(target==='cloudflare')assert.equal(bindings.find(b=>b.name==='FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY').type,'secret_text');else assert.equal(vars.get('FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY').type,'encrypted');assert.equal(activeEnv.FRONTBASE_BOOTSTRAP_OAUTH_GRANTS,undefined,'initial owner-key envelope is not copied to runtime');
  const installedCipher=await createSecretCipher(activeEnv.SESSION_SECRET);assert.ok(installedCipher.isEncrypted(activeEnv.FRONTBASE_OAUTH_CONNECTIONS));const retained=JSON.parse(await installedCipher.decrypt(activeEnv.FRONTBASE_OAUTH_CONNECTIONS));assert.equal(retained.grants.length,1,'concurrent import does not duplicate the original grant');assert.equal(retained.grants[0].accessToken,'sensitive-native-grant');
 }
 assert.equal(activeEnv.FRONTBASE_BOOTSTRAP,'0');assert.ok(activeEnv.SESSION_SECRET);assert.ok(activeEnv.SETUP_TOKEN);assert.equal((await request('claim',{token:env.FRONTBASE_BOOTSTRAP_TOKEN})).status,410);
 const journal=await other.journal.read(other.context);assert.equal(journal.phase,'active');assert.ok(!JSON.stringify(journal).includes('fixture-state-secret'));if(env.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY)assert.ok(!JSON.stringify(journal).includes(env.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY));
 if(target==='cloudflare')assert.ok(bindings.some(b=>b.name==='ASSETS'));
 db.close();console.log('PASS '+target+' hosted claim → review → concurrent activation → healthy proof; fixed journal, secret-free receipts, installer closed');
}
try{await fixture('cloudflare');await fixture('vercel');await fixture('cloudflare',true);await fixture('vercel',true);}finally{rmSync(out,{recursive:true,force:true});}
