import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {migrateUp} from '../dist/db/migrations.js';
import {EditorialApprovalStore} from '../dist/compat/editorial-approval-store.js';
const db=sqliteRunner(':memory:');await migrateUp(db);const configuration=emptyDirectoryConfiguration(),draft={schemaVersion:1,revision:1,configuration},refs=[];
for(let i=0;i<130;i++){
    const id=crypto.randomUUID(),snapshot={id,revision:1,originalPath:`/blog/item-${i}/`,title:`Item ${i}`,excerpt:'',body:[{kind:'paragraph',runs:[{text:'Approved body'}]}],language:'en',byline:null,publishedAt:null,coverUrl:null,coverAlt:''};
    const fingerprint=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),record={schemaVersion:1,documentId:id,documentRevision:1,configurationRevision:1,configuration,fingerprint,snapshot,checks:{facts:true,language:true,media:true,formatting:true,urls:true,ctas:true}};
    await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?)',['owner',`editorial_approval:v1:${id}:1:1`,JSON.stringify(record),'2026-10-14T00:00:00Z']);refs.push({id,revision:1,fingerprint});
}
let queries=0;const counted={query:(...args)=>{queries++;return db.query(...args);},exec:db.exec.bind(db)},store=new EditorialApprovalStore(counted,'owner');
const values=await store.readSnapshotRecords(refs,1);assert.equal(queries,3);
for(const ref of refs)assert.ok(await store.snapshot(ref.id,1,draft,ref.fingerprint,values(ref.id,1)));
assert.equal(queries,3,'Full snapshot validation must not issue individual reads');
const foreign=await new EditorialApprovalStore(db,'foreign').readSnapshotRecords(refs,1);assert.equal(foreign(refs[0].id,1),null);
const ref=refs[0],corrupt=JSON.parse(values(ref.id,1));corrupt.snapshot.title='Tampered';
await assert.rejects(store.snapshot(ref.id,1,draft,ref.fingerprint,JSON.stringify(corrupt)),/approval_unavailable/);
assert.equal(await store.snapshot(ref.id,1,draft,ref.fingerprint,null),null);
const wrongConfig={...draft,configuration:{...configuration,site:{...configuration.site,name:'Changed'}}};await assert.rejects(store.snapshot(ref.id,1,wrongConfig,ref.fingerprint,values(ref.id,1)),/approval_unavailable/);
console.log('approval batching: 130 validated snapshots / 3 owner-scoped reads, missing/corrupt/configuration refusals PASS');
