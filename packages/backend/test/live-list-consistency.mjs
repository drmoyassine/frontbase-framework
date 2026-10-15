// Synthetic SQLite/provider proof of the actual shared browser transport against the API.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {sqliteRunner} from '@frontbase/edge-infra';
import {createCompatApp} from '../dist/compat/app.js';
import {migrateUp} from '../dist/db/migrations.js';
const entry=fileURLToPath(new URL('../../console/packages/types/src/liveList.ts',import.meta.url));
let source=readFileSync(entry,'utf8');
const faults={view:['viewId:binding.viewId','viewId:undefined'],hidden:['...query.hidden ?? []','...[]'],sort:["sort_col: query.sortColumn || null","sort_col: null"]};
if(process.env.LIVE_LIST_FAULT){const fault=faults[process.env.LIVE_LIST_FAULT];assert(fault&&source.includes(fault[0]));source=source.replace(fault[0],fault[1]);}
const compiled=buildSync({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../../console/packages/types/src/',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {fetchLiveList}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
const control=sqliteRunner(':memory:');await migrateUp(control);
const dataUrl='file:'+join(mkdtempSync(join(tmpdir(),'frontbase-live-list-')),'records.db').replaceAll('\\','/');
const data=sqliteRunner(dataUrl);await data.exec('CREATE TABLE catalog(id INTEGER PRIMARY KEY,title TEXT,score INTEGER,country TEXT)');
for(const row of [[1,'Campus A',0,'USA'],[2,'Campus B',2,'USA'],[3,'Foreign campus',8,'other'],[4,'Campus C',1,'USA']])await data.exec('INSERT INTO catalog VALUES(?,?,?,?)',row);
let tenant='fixture';
const app=await createCompatApp({makeRunner:async()=>control,resolvePrincipal:async()=>({tenant,user:{id:'fixture',role:'owner'}}),sessionSecret:'synthetic-live-list-proof'});
const create=async(path,body)=>{const response=await app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,201);return response.json();};
const ds=await create('/api/sync/datasources/',{name:'Fixture',type:'sqlite',config:{url:dataUrl}});
const view=await create(`/api/sync/datasources/${ds.id}/views/`,{name:'USA live',target_table:'catalog',filters:[{column:'country',op:'eq',value:'USA'}]});
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>app.request(String(url),options);
try {
 const binding={dataSourceId:ds.id,tableName:'catalog',viewId:view.id};
 const query={page:0,pageSize:1,sortColumn:'score',sortDirection:'desc',search:'campus'};
 for(const mode of ['builder','edge']){
  const result=await fetchLiveList(binding,query,mode);assert.deepEqual(result.rows.map(row=>row.id),[2]);assert.equal(result.total,3);
  const next=await fetchLiveList(binding,{...query,page:1},mode);assert.deepEqual(next.rows.map(row=>row.id),[4]);
  const hidden=await fetchLiveList(binding,{...query,hidden:[{column:'score',op:'eq',value:0}]},mode);assert.deepEqual(hidden.rows.map(row=>row.id),[1]);assert.equal(hidden.total,1);
  const empty=await fetchLiveList(binding,{...query,search:'missing'},mode);assert.deepEqual(empty.rows,[]);assert.equal(empty.total,0);
 }
 await data.exec('UPDATE catalog SET title = ? WHERE id = 2',['Updated live campus']);
 assert.equal((await fetchLiveList(binding,query,'edge')).rows[0].title,'Updated live campus');
 const table=await fetchLiveList({...binding,viewId:undefined},{page:0,pageSize:20,filters:{score:0}},'builder');assert.deepEqual(table.rows.map(row=>row.id),[1]);assert.equal(table.total,1);
 tenant='other';await assert.rejects(fetchLiveList(binding,query,'edge'),/HTTP 403/);
 console.log('live-list-consistency: PASS (builder/public view, sort+search, paging, hidden zero, empty count, live update, table and cross-owner refusal)');
} finally {globalThis.fetch=originalFetch;}
