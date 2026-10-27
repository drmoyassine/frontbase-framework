import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=new URL('../.native-cloud-test/',import.meta.url);mkdirSync(out,{recursive:true});
try{
 await build({entryPoints:[fileURLToPath(new URL('../src/native-cloud.ts',import.meta.url))],outfile:fileURLToPath(new URL('host.mjs',out)),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'assets',setup(b){b.onResolve({filter:/^virtual:bootstrap-assets$/},()=>({path:'assets',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default {"/frontbase-bootstrap/native":{body:"native fixture",type:"text/html"}}'}));}}]});
 const {createNativeCloudBootstrap}=await import(new URL('host.mjs',out));
 const origin='https://native-fixture.fixture.workers.dev',env={FRONTBASE_HOSTED_SETUP:'1',FRONTBASE_BOOTSTRAP:'native',FRONTBASE_NATIVE_PUBLIC_ORIGIN:origin,FRONTBASE_NATIVE_RELAY_URL:'https://relay.example',FRONTBASE_NATIVE_INSTALLATION_ID:'11111111-2222-4333-8444-555555555555',FRONTBASE_NATIVE_ACCOUNT:'a'.repeat(32),FRONTBASE_NATIVE_PROJECT:'native-fixture'};
 let mutations=0;const host=createNativeCloudBootstrap(env,'cloudflare',async(input,init={})=>{if(init.method&&init.method!=='GET')mutations++;assert.equal(String(input),'https://relay.example/health');return Response.json({providers:['cloudflare','vercel']});});
 for(const [key,value] of Object.entries({DB:{},SESSION_SECRET:'already-configured',ADMIN_EMAIL:'owner@example.test',ADMIN_PASSWORD:'fixture-only',APP_DB_URL:'libsql://state.example',APP_DB_AUTH_TOKEN:'fixture-only',APP_DB_D1_DATABASE_ID:'existing',FRONTBASE_HOSTED_SETUP:'0',FRONTBASE_BOOTSTRAP:'0',FRONTBASE_NATIVE_INSTALLATION_ID:'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'}))assert.throws(()=>createNativeCloudBootstrap({...env,[key]:value},'cloudflare'));
 const request=(path,options={})=>host.fetch(new Request(origin+path,options));
 assert.equal(await(await request('/frontbase-bootstrap/')).text(),'native fixture');
 assert.equal((await request('/health')).status,200);
 const config=await(await request('/frontbase-bootstrap/native-configuration')).json();assert.equal(config.target,'cloudflare');assert.equal(config.manifest.bindings['state-db'].adapterId,'cloudflare-d1');assert.ok(config.adapters.some(a=>a.id==='libsql-http'));assert.ok(config.adapters.some(a=>a.id==='upstash-http'));assert.ok(!JSON.stringify(config).includes('fixture-only'));
 assert.equal((await host.fetch(new Request('https://attacker.example/frontbase-bootstrap/'))).status,403);
 assert.equal((await request('/frontbase-bootstrap/api/apply',{method:'POST',body:'{}'})).status,404);assert.equal(mutations,0,'native page does not provision before verified OAuth');
 const start=await request('/api/provider-oauth/cloudflare/start',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({returnPath:'/frontbase-bootstrap/'})});assert.equal(start.status,200);assert.equal(new URL((await start.json()).url).origin,'https://relay.example');assert.equal(mutations,0);
 const crossSite=await request('/api/provider-oauth/cloudflare/start',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'});assert.equal(crossSite.status,403);
 console.log('PASS explicit native zero-state entry, public adapter choices, exact origin/CSRF fences, no pre-consent mutations and installed-state refusal');
}finally{rmSync(out,{recursive:true,force:true});}
