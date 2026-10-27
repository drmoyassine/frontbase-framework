import {it,expect,vi} from 'vitest';
import {renderHook,cleanup} from '@testing-library/react';
const state=vi.hoisted(()=>({pages:[] as any[],currentPageId:'page',selectedComponentId:'title',editingVersions:{}}));
vi.mock('@/stores/builder',()=>({useBuilderStore:(selector:any)=>selector(state)}));
vi.mock('@/stores/data-binding-simple',()=>({useDataBindingStore:()=>({getComponentBinding:()=>null})}));
vi.mock('@/hooks/data/useRecordFields',()=>({useRecordFields:()=>({fields:[{name:'title'},{name:'institutions.city_name'}]})}));
import {useRepeaterRecordColumns} from './useRepeaterRecordColumns';
it.each(['props','root'])('offers all related fields inside a bound Card with %s binding',shape=>{
 const binding={dataSourceId:'source',tableName:'programs',columnOrder:['programs.duration']};state.pages=[{id:'page',layoutData:{root:{},content:[{id:'card',type:'Card',props:shape==='props'?{binding}:{},...(shape==='root'?{binding}:{}),children:[{id:'title',type:'Text',props:{content:'{{ record.title }}'}}]}]}}];
 const {result}=renderHook(()=>useRepeaterRecordColumns());expect(result.current).toEqual(['programs.duration','title','institutions.city_name']);cleanup();
});
