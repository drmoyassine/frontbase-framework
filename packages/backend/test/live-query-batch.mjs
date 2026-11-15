import assert from 'node:assert/strict';
import {liveQueryBatch} from '../dist/compat/live-query-batch.js';
let calls=[];
const db={dialect:'postgres',exec:async()=>0,query:async(sql,params)=>{
 calls.push({sql,params});
 return sql.includes('__fb_batch')?[{__fb_batch:1,__fb_rows:[]},{__fb_batch:0,__fb_rows:[{title:'Current'}]}]:[{title:'Next'}];
}};
const query=liveQueryBatch(db);
assert.deepEqual(await Promise.all([query('SELECT title FROM owned WHERE title=$1',["O'Reilly"]),query('SELECT title FROM owned WHERE id=$1',[2])]),[[{title:'Current'}],[]]);
assert.equal(calls.length,1);
assert.match(calls[0].sql,/O''Reilly/);
assert.deepEqual(await query('SELECT title FROM owned'),[{title:'Next'}]);
assert.equal(calls.length,2,'different SQL performs a current read');
await query('SELECT title FROM owned');
assert.equal(calls.length,2,'identical compiled SQL is deduplicated within one page request');
await liveQueryBatch(db)('SELECT title FROM owned');
assert.equal(calls.length,3,'the next request always reads current data');
for(const value of [[{__fb_batch:0,__fb_rows:[]}],[{__fb_batch:0,__fb_rows:[]},{__fb_batch:0,__fb_rows:[]}],[{__fb_batch:0,__fb_rows:[null]},{__fb_batch:1,__fb_rows:[]}]]){
 const bad=liveQueryBatch({...db,query:async()=>value});
 const result=await Promise.allSettled([bad('SELECT 1'),bad('SELECT 2')]);
 assert.ok(result.every(item=>item.status==='rejected'),'malformed batch rejects all reads');
}
calls=[];const fallback=liveQueryBatch({...db,dialect:'sqlite'});
await Promise.all([fallback('SELECT 1'),fallback('SELECT 2')]);
assert.equal(calls.length,2,'other adapters keep ordinary reads');
console.log('live query batch: one request, parameter escaping, ordered results, freshness, invalid-response refusal and adapter fallback PASS');
