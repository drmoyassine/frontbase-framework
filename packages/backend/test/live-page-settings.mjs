import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {livePageSettings} from '../dist/compat/live-page-settings.js';
const db=sqliteRunner(':memory:');
await db.exec('CREATE TABLE settings(tenant_slug TEXT,key TEXT,value TEXT)');
await db.exec('INSERT INTO settings VALUES(?,?,?)',['one','translation_storage:v1','first']);
await db.exec('INSERT INTO settings VALUES(?,?,?)',['two','translation_storage:v1','foreign']);
await db.exec('INSERT INTO settings VALUES(?,?,?)',['one','project','{"faviconUrl":"/logo.svg"}']);
let reads=0;const counted={...db,query:async(...args)=>{reads++;return db.query(...args);}};
try{
 const request=await livePageSettings(counted,'one',['project','frontend_copy:active:v1','translation_storage:v1']);
 assert.deepEqual(await request.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['one','project']),[{value:'{"faviconUrl":"/logo.svg"}'}]);
 assert.deepEqual(await request.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',['one','translation_storage:v1']),[{value:'first'}]);
 assert.deepEqual(await request.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['one','frontend_copy:active:v1']),[]);
 assert.equal(reads,1,'one read for both current settings');
 assert.deepEqual(await request.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['two','translation_storage:v1']),[{value:'foreign'}]);
 assert.equal(reads,2,'a different owner never consumes the memo');
 await db.exec('UPDATE settings SET value=? WHERE tenant_slug=?',['changed','one']);
 const next=await livePageSettings(counted,'one',['translation_storage:v1']);
 assert.deepEqual(await next.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['one','translation_storage:v1']),[{value:'changed'}]);
 await assert.rejects(request.exec('DELETE FROM settings'),/read_only/);
 await assert.rejects(livePageSettings(counted,'one',['unrelated-secret']),/key_invalid/);
 console.log('live page settings: one current batch, missing keys, request freshness, owner separation and read-only boundary PASS');
}finally{await db.close();}
