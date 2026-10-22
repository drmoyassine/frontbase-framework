import assert from 'node:assert/strict';
import {savedWhere} from '../dist/compat/saved-view-query.js';
import {executeSingleTableRpc} from '../dist/compat/single-table-rpc.js';
import {inspectTable} from '../dist/compat/routes/sync.js';
const columns=['id','path','revision','country'].map(name=>({name,type:name==='path'?'text':'integer',nullable:true,primary_key:name==='id',default_value:null}));
const branches=Array.from({length:1000},(_,id)=>({logic:'and',conditions:[{field:'id',operator:'eq',value:id},{field:'path',operator:'eq',value:'/item/'+id},{field:'revision',operator:'eq',value:id%3}]}));
const rules=[{field:'country',operator:'eq',value:22},{logic:'or',conditions:branches},{field:'revision',operator:'gte',value:0}];
const compiled=savedWhere('postgres',columns,rules,'items');
assert.equal(compiled.params.length,3);assert.equal(compiled.params[0],22);assert.equal(compiled.params[2],0);
assert.match(compiled.sql,/jsonb_populate_recordset\(NULL::"items",\$2::jsonb\)/);assert.match(compiled.sql,/"revision" >= \$3/);
assert.ok(compiled.sql.includes('("id","path","revision") IN (SELECT "id","path","revision" FROM'));
const tuples=JSON.parse(compiled.params[1]);assert.equal(tuples.length,1000);
assert.deepEqual(tuples[729],{id:729,path:'/item/729',revision:0});
assert.ok(!tuples.some(r=>r.id===729&&r.path==='/item/730'),'correlated identity tuples never become independent field allowlists');
assert.ok(compiled.sql.length<350,'large selection must not expand thousands of SQL OR predicates');
assert.ok(!compiled.sql.includes('/item/'),'values remain parameterized');
assert.equal(savedWhere('sqlite',columns,rules,'items').params.length,3002,'SQLite retains its original typed predicate path');
for(const changed of [branches.slice(0,15),branches.map((b,i)=>i?b:{...b,conditions:b.conditions.slice(1)}),branches.map((b,i)=>i?b:{...b,conditions:[...b.conditions,b.conditions[0]]}),branches.map((b,i)=>i?b:{...b,conditions:b.conditions.map((c,j)=>j?c:{...c,operator:'gte'})})]){
 assert.ok(!savedWhere('postgres',columns,[{logic:'or',conditions:changed}],'items').sql.includes('jsonb_populate_recordset'));
}
assert.throws(()=>savedWhere('postgres',columns,[{logic:'or',conditions:branches.map(b=>({...b,conditions:[...b.conditions,{field:'missing',operator:'eq',value:1}]}))}],'items'),/invalid_column/);
const escaped=savedWhere('postgres',columns,[{logic:'or',conditions:branches.map(b=>({...b,conditions:b.conditions.map(c=>c.field==='path'?{...c,value:"x'); DROP TABLE items; --"}:c)}))}],'items');assert.ok(!escaped.sql.includes('DROP TABLE'));assert.equal(JSON.parse(escaped.params[0])[0].path,"x'); DROP TABLE items; --");
for(const value of [1.5,Number.MAX_SAFE_INTEGER,'not-a-number']){
 const incompatible=branches.map(b=>({...b,conditions:b.conditions.map(c=>c.field==='id'?{...c,value}:c)}));
 assert.ok(!savedWhere('postgres',columns,[{logic:'or',conditions:incompatible}],'items').sql.includes('jsonb_populate_recordset'));
}
let sqlCalls=[];const runner={exec:async()=>{throw Error('write forbidden')},query:async(sql,args)=>{sqlCalls.push(sql);if(sql.includes('information_schema.tables'))return[{name:'items'}];if(sql.includes('information_schema.columns')){assert.ok(sql.includes('pg_catalog.pg_index'));return columns.map(c=>({column_name:c.name,data_type:c.type,is_nullable:'YES',primary_key:c.primary_key}));}if(sql.includes('FOREIGN KEY'))return[];if(sql.startsWith('SELECT COUNT'))return[{total:0}];return[];}};
await executeSingleTableRpc(runner,'postgres',{table_name:'items',columns:'*',joins:[],page:1,page_size:5,filters:[]},rules);
assert.equal(sqlCalls.length,4);assert.ok(!sqlCalls.some(s=>s.includes('FOREIGN KEY')),'single-table reads must not fetch unused foreign keys');
sqlCalls=[];await inspectTable(runner,'postgres','items');assert.ok(sqlCalls.some(s=>s.includes('FOREIGN KEY')),'Inspector retains complete relationship metadata');
console.log('saved-view-query PASS: 1000 correlated typed memberships, parameter offsets/injection/null-safe SQL path, fallback shapes, field validation and selective schema inspection');
