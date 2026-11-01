import assert from 'node:assert/strict';
import {sqliteRunner,postgresStateRunner} from '@frontbase/edge-infra';
import {createRequire} from 'node:module';
import {migrateUp} from '../dist/db/migrations.js';
const {PagesStore}=await import(process.env.FRONTBASE_HOMEPAGE_SEED_MODULE??'../dist/compat/pages-store.js');
if(!process.env.FRONTBASE_TEST_POSTGRES_URL){
const db=sqliteRunner(':memory:');await migrateUp(db);const now='2026-11-01T00:00:00Z';
let arrivals=0,release;const barrier=new Promise(resolve=>{release=resolve});
const runner={query:async(sql,params)=>{const rows=await db.query(sql,params);if(sql.startsWith('SELECT id FROM compat_pages')&&sql.includes('is_homepage = 1')){arrivals++;if(arrivals===2)release();await barrier;}return rows;},exec:(...args)=>db.exec(...args)};
await assert.doesNotReject(()=>Promise.all([new PagesStore(runner,'alpha').ensureHomepage(now),new PagesStore(runner,'alpha').ensureHomepage(now)]),'cold-start conflict is harmless');
const rows=await db.query('SELECT * FROM compat_pages WHERE tenant_slug = ?',['alpha']);assert.equal(rows.length,1,'two absent reads yield one starter');assert.match(rows[0].id,/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
const alpha=new PagesStore(db,'alpha');await alpha.update(rows[0].id,{name:'Authored home'},now);await alpha.ensureHomepage(now);assert.equal((await alpha.list()).length,1);assert.equal((await alpha.get(rows[0].id)).name,'Authored home','repeated boot preserves edits');
const beta=new PagesStore(db,'beta');await beta.ensureHomepage(now);assert.equal((await beta.list()).length,1,'another tenant still gets a starter');assert.notEqual((await beta.list())[0].id,rows[0].id);
await alpha.softDelete(rows[0].id,now);await assert.doesNotReject(()=>alpha.ensureHomepage(now),'deleted starter conflict is harmless');assert.equal((await alpha.list()).length,0,'deleted starter is not resurrected');
const other=new PagesStore(db,'custom');await other.create({name:'Custom home',slug:'landing'},'custom-id',now);await other.update('custom-id',{isHomepage:true},now);await other.ensureHomepage(now);assert.equal((await other.list()).length,1);assert.equal((await other.get('custom-id')).name,'Custom home');
console.log('PASS homepage seed: synchronized cold starts, primary-key conflict, tenant isolation, authored/custom preservation and deleted starter intent');

}else{
 const connectionString=process.env.FRONTBASE_TEST_POSTGRES_URL,url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname),'PostgreSQL seed fixture must be loopback-only');
 const schema='seed_race_'+Date.now().toString(36),pg=postgresStateRunner({connectionString,schema}),now='2026-11-01T00:00:00Z';
 const require=createRequire(new URL('../../edge-infra/package.json',import.meta.url)),{Client}=require('pg'),admin=new Client({connectionString});await admin.connect();
 try{
  await migrateUp(pg);let arrivals=0,release;const barrier=new Promise(resolve=>{release=resolve});
  const runner={query:async(sql,params)=>{const rows=await pg.query(sql,params);if(sql.startsWith('SELECT id FROM compat_pages')&&sql.includes('is_homepage = 1')){arrivals++;if(arrivals===2)release();await barrier;}return rows;},exec:(sql,params)=>pg.exec(sql.startsWith('INSERT INTO compat_pages')?sql.replace(' WHERE NOT EXISTS',' FROM (SELECT pg_sleep(0.2)) AS seed_delay WHERE NOT EXISTS'):sql,params)};
  await assert.doesNotReject(()=>Promise.all([new PagesStore(runner,'alpha').ensureHomepage(now),new PagesStore(runner,'alpha').ensureHomepage(now)]),'concurrent PostgreSQL primary-key conflict is harmless');
  assert.equal((await pg.query('SELECT id FROM compat_pages WHERE tenant_slug = ?',['alpha'])).length,1,'overlapping PostgreSQL snapshots still yield one starter');
  const alpha=new PagesStore(pg,'alpha'),beta=new PagesStore(pg,'beta');await beta.ensureHomepage(now);assert.equal((await beta.list()).length,1,'PostgreSQL tenants remain isolated');
  const home=(await alpha.list())[0];await alpha.softDelete(home.id,now);await assert.doesNotReject(()=>alpha.ensureHomepage(now),'PostgreSQL starter tombstone conflict is harmless');assert.equal((await alpha.list()).length,0);
  console.log('PASS real PostgreSQL seed: overlapping MVCC snapshots, exactly one starter, harmless conflict, tenant isolation and tombstone preservation');
 }finally{await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();}
}
