import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {libsqlRunner} from '@frontbase/edge-infra';
import {migrateUp,appliedVersions} from '../dist/db/migrations.js';
// HTTP-shaped client fixture backed by actual SQLite DDL. Independent clients
// contend for the same write transaction; the separate live gate uses Turso HTTP.
const db=new DatabaseSync(':memory:');let locked=false;
const execute=async input=>{const sql=typeof input==='string'?input:input.sql,args=typeof input==='string'?[]:input.args??[];const stmt=db.prepare(sql);if(/^(SELECT|PRAGMA|WITH)/i.test(sql.trim()))return {rows:stmt.all(...args),rowsAffected:0};return {rows:[],rowsAffected:Number(stmt.run(...args).changes)};};
const clients=Array.from({length:4},()=>({protocol:'http',execute,transaction:async()=>{if(locked)throw Object.assign(new Error('locked'),{code:'SQLITE_BUSY'});locked=true;db.exec('BEGIN IMMEDIATE');let open=true;return {execute,commit:async()=>{db.exec('COMMIT');open=false;locked=false;},rollback:async()=>{if(open)db.exec('ROLLBACK');open=false;locked=false;},close:()=>{if(open)db.exec('ROLLBACK');open=false;locked=false;}};}}));
const runners=clients.map(libsqlRunner);
try {
 const outcomes=await Promise.allSettled(runners.map(r=>migrateUp(r)));
 for(const outcome of outcomes)if(outcome.status==='rejected')console.error(JSON.stringify({message:outcome.reason.message,code:outcome.reason.code}));
 assert.ok(outcomes.every(o=>o.status==='fulfilled'),'all migration clients must finish');
 const versions=outcomes.map(o=>o.value);
 const applied=await appliedVersions(runners[0]);
 assert.equal(versions.flat().length,applied.length);
 assert.equal(new Set(applied).size,applied.length);
 console.log('PASS concurrent independent clients serialize migration discovery, DDL and records');
 await assert.rejects(migrateUp(runners[0],undefined,[{version:999,name:'rollback_probe',up:['CREATE TABLE migration_rollback_probe (id INTEGER)','INSERT INTO missing_probe_table VALUES (1)'],down:[]}]));
 assert.equal((await runners[0].query("SELECT name FROM sqlite_master WHERE name='migration_rollback_probe'")).length,0);
 assert.ok(!(await appliedVersions(runners[0])).includes(999));
 console.log('PASS failed migration rolls back its DDL and version record');
 let attempts=0;
 const refused={dialect:'sqlite',query:async()=>[],exec:async()=>0,transaction:async()=>{attempts++;throw Object.assign(new Error('locked'),{code:'SQLITE_BUSY'});}};
 await assert.rejects(migrateUp(refused),{code:'SQLITE_BUSY'});assert.equal(attempts,8);
 attempts=0;refused.transaction=async()=>{attempts++;throw Object.assign(new Error('invalid'),{code:'SQLITE_CONSTRAINT'});};
 await assert.rejects(migrateUp(refused),{code:'SQLITE_CONSTRAINT'});assert.equal(attempts,1);
 console.log('PASS lock retries are bounded and other errors are never retried');
} finally {db.close();}
