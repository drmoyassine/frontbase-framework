import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createSecretCipher} from '@frontbase/backend';
import {hashPassword} from '@frontbase/edge-infra';
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
 // A disconnected deployment probe can stop making progress in its request context.
 // A later request must be able to boot against the same already-migrated database.
 const recovering=await load('interrupted');
 const entered=Promise.withResolvers(), resume=Promise.withResolvers();
 let hold=true;
 const delayed={prepare(sql){
  const stmt=DB.prepare(sql);
  return {
   bind(...args){stmt.bind(...args);return this;},
   async all(){if(hold){hold=false;entered.resolve();await resume.promise;}return stmt.all();},
   run(){return stmt.run();}
  };
 }};
 const interrupted=recovering.fetch(new Request(base+'/health'),{...env,DB:delayed},ctx);
 await entered.promise;
 let timer;
 try {
  const next=await Promise.race([request(recovering,'/api/console/setup/status'),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('second request blocked by first boot')),5000);})]);
  assert.equal(next.status,200);
 } finally { clearTimeout(timer);resume.resolve();await interrupted; }
 console.log('PASS later request boots while the first request is suspended');
 const enrolledDb=new DatabaseSync(':memory:');
 const enrolledBinding={prepare(sql){const stmt=enrolledDb.prepare(sql);let params=[];return{bind(...values){params=values;return this;},async all(){return{results:stmt.all(...params)};},async run(){return{meta:{changes:Number(stmt.run(...params).changes)}};}};}};
 try{
  const installationId='11111111-2222-4333-8444-555555555555',sessionSecret='s'.repeat(64),password='Pending-admin-fixture-123';
  const pending={version:1,installationId,email:'pending@example.test',passwordHash:await hashPassword(password)};
  const pendingEnv={DB:enrolledBinding,ASSETS:env.ASSETS,SESSION_SECRET:sessionSecret,FRONTBASE_INSTALLATION_ID:installationId,
   FRONTBASE_ADMINISTRATOR_HANDOFF:await(await createSecretCipher(sessionSecret)).encrypt(JSON.stringify(pending))};
  const prepared=await load('administrator-first');
  const ready=await prepared.fetch(new Request(base+'/api/console/setup/status'),pendingEnv,ctx);
  assert.equal(ready.status,200);assert.equal((await ready.json()).needsSetup,false);
  const signIn=await prepared.fetch(new Request(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:pending.email,password})}),pendingEnv,ctx);
  assert.equal(signIn.status,200,await signIn.text());
  const session=signIn.headers.get('set-cookie').split(';')[0];
  const upgraded=await load('administrator-first-upgrade');
  assert.equal((await upgraded.fetch(new Request(base+'/api/pages/',{headers:{cookie:session}}),pendingEnv,ctx)).status,200);
  assert.equal(enrolledDb.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
  const closed=await upgraded.fetch(new Request(base+'/api/console/setup',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),pendingEnv,ctx);assert.equal(closed.status,410);
  console.log('PASS built Worker: pending secret creates administrator once, login works, upgrade retains session and setup closes');
 }finally{enrolledDb.close();}
 const broken=await load('broken');assert.equal((await broken.fetch(new Request(base+'/'),{ASSETS:env.ASSETS},ctx)).status,500);console.log('PASS missing state fails closed');
} finally {db.close();}
