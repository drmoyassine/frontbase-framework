import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {publishedLocalesForPath} from '../dist/compat/translation-homepage.js';
import {publicationHash} from '../dist/compat/site-publication-store.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
const db=sqliteRunner(':memory:');await migrateUp(db,()=>new Date().toISOString());
const bounded={...db,query:async(sql,args=[])=>{if(/\bLIKE\b/i.test(sql)&&args.some(v=>typeof v==='string'&&v.length>50))throw Error('D1 LIKE or GLOB pattern too complex');return db.query(sql,args);}};
for(const path of ['/plain-page','/another-page/','/'+ 'long-slug-'.repeat(20)]){assert.deepEqual(await publishedLocalesForPath(bounded,'alpha',path),[]);assert.equal(await renderReviewedSitePublication(bounded,'alpha',new Request('https://fixture.test'+path)),null,'fresh untranslated route reaches ordinary serving');}
const path='/ordinary-page/',prefix='translation_surface:active:v1:'+await publicationHash({kind:'page',path})+':';
for(const[tenant,key]of [['beta',prefix+'ar'],['alpha','translationXsurface:active:v1:'+prefix.split(':')[3]+':ar'],['alpha',prefix.slice(0,-1)+';ar']])await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at)VALUES(?,?,?,?)',[tenant,key,'{}',new Date().toISOString()]);
assert.deepEqual(await publishedLocalesForPath(bounded,'alpha',path),[],'tenant and exact prefix boundaries remain mandatory');
await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at)VALUES(?,?,?,?)',['alpha',prefix+'ar','{}',new Date().toISOString()]);
const items=await publishedLocalesForPath(bounded,'alpha',path);assert.equal(items.length,1);assert.equal(items[0].locale,'ar');assert.equal(items[0].corrupt,true,'a corrupt requested release stays visible to the strict fence');
console.log('D1 locale prefix: fresh ordinary routes, 50-byte LIKE limit, exact prefix range, tenant isolation and corrupt-row fence PASS');
