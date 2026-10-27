import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
// Exercise the deployed entry, not only createCmsEngine or the secret helper.
const db=new DatabaseSync(':memory:');
const DB={prepare(sql){const stmt=db.prepare(sql);let params=[];return {bind(...values){params=values;return this;},async all(){return {results:stmt.all(...params)};},async run(){return {meta:{changes:Number(stmt.run(...params).changes)}};}};}};
const ctx={waitUntil(promise){promise.catch(()=>{});},passThroughOnException(){}};
const env={DB,ADMIN_EMAIL:'native-boot@example.test',ADMIN_PASSWORD:'Synthetic-Native-Boot-Password-2026!',ASSETS:{async fetch(){return new Response('fixture asset',{status:200});}}};
const base='https://native-boot.example.test';
async function load(name){return (await import(new URL(`?boot=${name}`,process.env.FRONTBASE_NATIVE_WORKER_MODULE??new URL('../dist/worker.mjs',import.meta.url)))).default;}
const request=(worker,path,init)=>worker.fetch(new Request(base+path,init),env,ctx);
try {
 const cloud=await load('cloud');const denied=await cloud.fetch(new Request(base+'/'),{...env,FRONTBASE_DEPLOYMENT_MODE:'cloud'},ctx);assert.equal(denied.status,500);assert.match(await denied.text(),/SESSION_SECRET/);console.log('PASS managed cloud retains explicit secret refusal');
 const first=await load('first');const home=await request(first,'/');assert.equal(home.status,200,await home.text());
 const secret=()=>db.prepare("SELECT value FROM settings WHERE tenant_slug='_system' AND key='boot.session_secret'").get()?.value;
 const persisted=secret();assert.match(persisted,/^[a-f0-9]{64}$/);
 assert.equal((await request(first,'/api/pages/')).status,401);assert.equal((await request(first,'/api/console/setup/status')).status,200);
 const login=await request(first,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});assert.equal(login.status,200,await login.text());const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('frontbase_session='));
 assert.equal((await request(first,'/api/pages/',{headers:{cookie}})).status,200);
 const second=await load('second');assert.equal((await request(second,'/api/pages/',{headers:{cookie}})).status,200);assert.equal(secret(),persisted);console.log('PASS actual self-host entry boots, persists one key and preserves original session across independent entry instances');
 const leak=await request(second,'/api/variables/',{headers:{cookie}});assert.ok(!(await leak.text()).includes(persisted));console.log('PASS reserved generated key is absent from tenant variables response');
 const broken=await load('broken');assert.equal((await broken.fetch(new Request(base+'/'),{ASSETS:env.ASSETS},ctx)).status,500);console.log('PASS missing state fails closed');
} finally {db.close();}
