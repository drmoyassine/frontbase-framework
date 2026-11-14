import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {inlinePgParams} from '@frontbase/edge-infra';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';

// Optional real-Postgres leg of site-publication-chunk-integration.mjs. Uses
// only its synthetic fixture, no listening port or existing database.
export async function verifyProjectedRecords(manifest,source){
 const name='frontbase-projected-'+randomUUID().slice(0,8);
 const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],timeout:30000});
 let started=false;
 try{
  docker(['run','--rm','-d','--network','none','--name',name,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.11-alpine']);started=true;
  for(let i=0;;i++){try{docker(['exec',name,'pg_isready','-U','postgres']);break;}catch(e){if(i===60)throw e;await delay(250);}}
  const sql=input=>docker(['exec','-i',name,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],input);
  let transferred=0;
  const db={dialect:'postgres',exec:async()=>{throw Error('test read-only');},query:async(query,params=[])=>{const raw=sql("SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM ("+inlinePgParams(query,params)+') r;').trim();transferred+=Buffer.byteLength(raw);return JSON.parse(raw);}};
  sql('CREATE TABLE settings(tenant_slug text,key text,value text,PRIMARY KEY(tenant_slug,key));');
  const values=new Map();
  for(const ref of manifest.chunks){const key=`site_publication:chunk:v1:${ref.hash}`,raw=(await source.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha',key]))[0].value;values.set(key,raw);sql(inlinePgParams('INSERT INTO settings VALUES (?,?,?)',['alpha',key,raw])+';');}
  const pg=new SitePublicationManifestStore(db,'alpha'),legacy=new SitePublicationManifestStore(source,'alpha');
  const selected=[manifest.index.find(row=>row.collection==='programs'),manifest.index.find(row=>row.collection==='articles')];
  assert.deepEqual(await pg.readRecords(manifest,selected),await legacy.readRecords(manifest,selected));
  assert.ok(transferred<[...values.values()].reduce((sum,v)=>sum+Buffer.byteLength(v),0),'only selected records cross the SQL boundary');
  assert.deepEqual(await pg.readRecords(manifest,[]),[]);
  await assert.rejects(()=>new SitePublicationManifestStore(db,'other').readRecords(manifest,selected));
  await assert.rejects(()=>pg.readRecords(manifest,[{...selected[0],position:999}]));
  const forged=structuredClone(manifest),forgedEntry=forged.index.find(row=>row.id===selected[0].id&&row.collection===selected[0].collection);
  forgedEntry.title='Forged index title';
  await assert.rejects(()=>pg.readRecords(forged,[forgedEntry]),'matching chunk bytes must not bypass index membership integrity');
  const key=`site_publication:chunk:v1:${selected[0].chunkHash}`,raw=values.get(key);
  const altered=JSON.parse(raw);altered.records[0].summary='Unapproved replacement with the same index';
  sql(inlinePgParams('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[JSON.stringify(altered),'alpha',key])+';');
  await assert.rejects(()=>pg.readRecords(manifest,selected),'index equality alone cannot approve changed record content');
  sql(inlinePgParams('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[raw+' ','alpha',key])+';');
  await assert.rejects(()=>pg.readRecords(manifest,selected),'exact immutable bytes, not just equivalent JSON, are required');
  sql(inlinePgParams('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[raw.replace(/"title":"[^"]*"/,'"title":"tampered"'),'alpha',key])+';');
  await assert.rejects(()=>pg.readRecords(manifest,selected),'changed bytes must be rejected');
  sql(inlinePgParams('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[raw,'alpha',key])+';');
  assert.deepEqual(await pg.readRecords(manifest,selected),await legacy.readRecords(manifest,selected));
  sql(inlinePgParams('DELETE FROM settings WHERE tenant_slug=? AND key=?',['alpha',key])+';');
  await assert.rejects(()=>pg.readRecords(manifest,selected),'missing chunks must be rejected');
  console.log('PostgreSQL selected-record projection: parity, bytes, tenant, membership, tamper, restore and deletion passed');
 }finally{if(started)docker(['rm','-f',name]);}
}
