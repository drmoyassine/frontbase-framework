import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { createCompatApp } from '../dist/compat/app.js';
import { Hono } from 'hono';
import { registerPageRouteAudit } from '../dist/compat/routes/page-route-audit.js';
const db = sqliteRunner(':memory:'); await migrateUp(db);
const now = '2026-10-10T00:00:00Z';
for (const [owner,id,slug] of [['alpha','a','College'],['alpha','b','college'],['beta','foreign','PRIVATE_FOREIGN']])
    await db.exec('INSERT INTO compat_pages (id,tenant_slug,name,slug,layout_data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',[id,owner,'PRIVATE_LAYOUT',slug,'{}',now,now]);
let role = 'owner', owner = 'alpha', authenticated = true;
const app = await createCompatApp({ makeRunner: async () => db, sessionSecret:'synthetic-audit-session-secret',
    resolvePrincipal: async () => ({ user:authenticated ? {id:'test',role} : null,tenant:owner }) });
const call = (suffix='') => app.request('/api/project/page-route-audit/'+suffix);
const before=JSON.stringify(await db.query('SELECT * FROM compat_pages ORDER BY tenant_slug,id'));
let response=await call(), result=await response.json();
assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('x-robots-tag'),/noindex/);
assert.equal(result.status,'conflicts');assert.equal(result.coverage,'stored-pages');assert.equal(result.publicRecordsChecked,false);assert.equal(result.installAvailable,false);
assert.ok(!JSON.stringify(result).includes('PRIVATE_'));assert.equal(result.resourcesChecked,2);
assert.equal(JSON.stringify(await db.query('SELECT * FROM compat_pages ORDER BY tenant_slug,id')),before);
for (const denied of ['editor','viewer','master','']) { role=denied;assert.equal((await call()).status,403); }
role='owner';assert.equal((await call('?tenant=beta')).status,422);assert.equal((await call('?publicPaths=[]')).status,422);
owner='beta';response=await call();result=await response.json();assert.equal(response.status,200);assert.equal(result.status,'conflicts'); // underscore is unsupported, no foreign detail returned
assert.equal(result.resourcesChecked,1);assert.ok(!JSON.stringify(result).includes('College'));
authenticated=false;assert.equal((await call()).status,401);
let reads=0;const direct=new Hono();direct.use('*',async(c,next)=>{c.set('tenant','alpha');c.set('principal',{user:{id:'test',role:'editor'},tenant:'alpha'});return next();});
registerPageRouteAudit(direct,{query:async()=>{reads++;throw new Error('PRIVATE_CONNECTION');},exec:async()=>{throw new Error('No writes');}});
assert.equal((await direct.request('/api/project/page-route-audit/')).status,403);assert.equal(reads,0);
const failing=new Hono();failing.use('*',async(c,next)=>{c.set('tenant','alpha');c.set('principal',{user:{id:'test',role:'owner'},tenant:'alpha'});return next();});
registerPageRouteAudit(failing,{query:async()=>{throw new Error('PRIVATE_CONNECTION');},exec:async()=>{throw new Error('No writes');}});
response=await failing.request('/api/project/page-route-audit/');assert.equal(response.status,503);assert.ok(!(await response.text()).includes('PRIVATE_'));
console.log('page-route-audit: owner/admin roles, real-app auth, no input, coverage, no writes/secrets and provider refusal pass');
