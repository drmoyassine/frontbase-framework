import assert from 'node:assert/strict';
import {applyEditableViews} from '../dist/compat/editable-view-conversion.js';
const make=()=>{
 const events=[],rows=new Map(['one','two'].map(id=>[id,{id,updated_at:'before',target_table:id,filters:[]} ]));
 let failSql=false,failCount=false,concurrent=false;
 const items=[...rows.values()].map(before=>({before:structuredClone(before),filters:[{field:'id',operator:'in',value:[1]}],sql:'PROJECT '+before.id,restoreSql:'RESTORE '+before.id,expected:1}));
 const store={updateView:async(id,patch,now,expected)=>{
  events.push('FILTER '+id);const current=rows.get(id);if(expected!==current.updated_at)return null;
  const updated={...current,...patch,updated_at:current.updated_at==='before'?'after':'restored'};rows.set(id,updated);return updated;
 }};
 const source={dialect:'postgres',exec:async sql=>{events.push(sql);if(failSql&&sql==='PROJECT two'){if(concurrent)rows.set('one',{...rows.get('one'),updated_at:'OWNER',name:'Owner concurrent change'});throw Error('synthetic DDL failure');}},query:async sql=>{
  if(sql.includes('FROM information_schema.tables'))return [{name:'one'},{name:'two'}];
  if(sql.includes('FROM information_schema.columns c'))return [{column_name:'id',data_type:'integer',is_nullable:'NO',primary_key:true}];
  if(sql.includes('information_schema.table_constraints'))return [];
  if(sql.includes('COUNT(*)'))return [{total:failCount?2:1}];return [{id:1}];
 }};
 return {events,rows,items,store,source,setFailure:(sql,count=false,owner=false)=>{failSql=sql;failCount=count;concurrent=owner;}};
};
let f=make();let guards=0;await applyEditableViews(f.source,f.store,f.items,()=>'',async()=>{guards++;});assert.equal(guards,2);assert.deepEqual(f.events.slice(0,4),['FILTER one','FILTER two','PROJECT one','PROJECT two']);
f=make();f.setFailure(true);await assert.rejects(applyEditableViews(f.source,f.store,f.items,()=>'',async()=>{}),/conversion_restored/);assert.deepEqual(f.rows.get('one').filters,[]);assert.deepEqual(f.events.slice(4,6),['RESTORE two','RESTORE one']);
f=make();f.setFailure(false,true);await assert.rejects(applyEditableViews(f.source,f.store,f.items,()=>'',async()=>{}),/conversion_restored/);assert.deepEqual(f.rows.get('two').filters,[]);
f=make();f.setFailure(true,false,true);await assert.rejects(applyEditableViews(f.source,f.store,f.items,()=>'',async()=>{}),/recovery_required/);assert.equal(f.rows.get('one').name,'Owner concurrent change');assert.equal(f.rows.get('one').updated_at,'OWNER');
f=make();await assert.rejects(applyEditableViews(f.source,f.store,f.items,()=>'',async()=>{throw Error('stale base');}),/conversion_restored/);assert.deepEqual(f.events,[]);
console.log('editable view conversion: filter-before-projection, base guard, population/DDL recovery and concurrent-owner preservation PASS');
