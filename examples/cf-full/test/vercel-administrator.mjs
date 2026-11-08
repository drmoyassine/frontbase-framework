import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {hashPassword} from '@frontbase/edge-infra';
import {createSecretCipher} from '@frontbase/backend';
const db=new DatabaseSync(':memory:'),originalFetch=globalThis.fetch;
const names=['APP_DB_URL','APP_DB_AUTH_TOKEN','APP_DB_POSTGREST_URL','FRONTBASE_BOOTSTRAP','ADMIN_EMAIL','ADMIN_PASSWORD','SESSION_SECRET','APP_DB_D1_ACCOUNT_ID','APP_DB_D1_DATABASE_ID','CLOUDFLARE_API_TOKEN','FRONTBASE_INSTALLATION_ID','FRONTBASE_ADMINISTRATOR_HANDOFF'];
const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
try{
 for(const name of names)delete process.env[name];
 const installationId='11111111-2222-4333-8444-555555555555',password='Vercel-admin-fixture-123',email='vercel-admin@example.test',key='s'.repeat(64);
 Object.assign(process.env,{FRONTBASE_BOOTSTRAP:'0',SESSION_SECRET:key,APP_DB_D1_ACCOUNT_ID:'fixture',APP_DB_D1_DATABASE_ID:'fixture',CLOUDFLARE_API_TOKEN:'fixture-only',FRONTBASE_INSTALLATION_ID:installationId,
  FRONTBASE_ADMINISTRATOR_HANDOFF:await(await createSecretCipher(key)).encrypt(JSON.stringify({version:1,installationId,email,passwordHash:await hashPassword(password)}))});
 globalThis.fetch=async(input,init)=>{
  assert(String(input).startsWith('https://api.cloudflare.com/client/v4/accounts/fixture/d1/database/fixture/'),'unexpected network request');
  const {sql,params=[]}=JSON.parse(init.body),stmt=db.prepare(sql);
  try{const rows=stmt.all(...params);return Response.json({success:true,result:[{results:rows,meta:{changes:db.prepare('SELECT changes() AS n').get().n}}]});}
  catch(error){return Response.json({success:false,errors:[{message:error.message}]});}
 };
 const module=await import('../dist/vercel.mjs?administrator-first');
 const handler=mod=>mod.createRequestHandler?mod.createRequestHandler():typeof mod.default==='function'?mod.default:mod.default.fetch;
 const handle=handler(module);
 const request=(path,init)=>handle(new Request('https://vercel-fixture.example'+path,init));
 const ready=await request('/api/console/setup/status');assert.equal(ready.status,200);assert.equal((await ready.json()).needsSetup,false);
 const login=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200,await login.text());
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/pages/',{headers:{cookie}})).status,200);
 delete process.env.FRONTBASE_ADMINISTRATOR_HANDOFF;
 const upgrade=handler(await import('../dist/vercel.mjs?administrator-upgrade'));
 assert.equal((await upgrade(new Request('https://vercel-fixture.example/api/pages/',{headers:{cookie}}))).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
 const completed=await upgrade(new Request('https://vercel-fixture.example/frontbase-bootstrap/'));assert.equal(completed.status,302);assert.equal(completed.headers.get('location'),'/frontbase-admin/login');
 assert.equal((await upgrade(new Request('https://vercel-fixture.example/frontbase-bootstrap/api/apply',{method:'POST'}))).status,410);
 assert.equal((await upgrade(new Request('https://vercel-fixture.example/api/console/setup',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))).status,410);
 console.log('PASS built Vercel: pending administrator installed once, same password signs in, post-secret-removal upgrade preserves session and closed setup');
}finally{globalThis.fetch=originalFetch;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}db.close();}
