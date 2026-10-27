import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,waitFor,cleanup,act} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {hiddenFilterApplies,resolveHiddenFilterRules,resolveBindingHiddenFilters} from '@frontbase/types';
import {useGridQuery} from '../../../packages/grid/src/hooks/useGridQuery';
import {useDataTableData} from '../../../packages/datatable/src/hooks/useDataTableData';
afterEach(()=>{cleanup();vi.unstubAllGlobals();delete (window as any).__VARIABLE_STORE__;window.history.replaceState(null,'','/');(window.location as any).search='';});
const rules:any[]=[{id:'scope',column:'country',operator:'eq',value:'22'},{id:'conditional',column:'kind',operator:'eq',value:'{{ url.type }}',when:{variable:'{{ url.type }}',operator:'eq',value:'program'}}];
it('applies conditions without treating missing, false or zero as interchangeable',()=>{
 const read=(scope:string,key:string)=>({url:{type:'program',zero:0,no:false}} as any)[scope]?.[key];
 expect(resolveHiddenFilterRules(rules,read)).toEqual([{column:'country',op:'eq',value:'22'},{column:'kind',op:'eq',value:'program'}]);
 expect(resolveHiddenFilterRules(rules,()=>undefined)).toEqual([{column:'country',op:'eq',value:'22'}]);
 expect(hiddenFilterApplies({variable:'{{ url.zero }}',operator:'eq',value:'0'},read)).toBe(true);
 expect(hiddenFilterApplies({variable:'{{ url.no }}',operator:'eq',value:'false'},read)).toBe(true);
 expect(hiddenFilterApplies({variable:'{{ url.absent }}',operator:'neq',value:'program'},read)).toBe(false);
 expect(hiddenFilterApplies({variable:'{{ url.absent }}',operator:'is_not_set'},read)).toBe(true);
 expect(hiddenFilterApplies({variable:'{{ url.__proto__ }}',operator:'is_set'},read)).toBe(false);
 expect(hiddenFilterApplies({variable:'{% arbitrary %}',operator:'is_not_set'},read)).toBe(false);
});
it('preserves baked static scope while re-evaluating dynamic rules, lists and empty checks',()=>{
 const binding={hiddenFilters:rules,_resolvedHiddenFilters:[{column:'country',op:'eq',value:'22'}]};
 expect(resolveBindingHiddenFilters(binding,()=> 'program')).toHaveLength(2);
 expect(resolveBindingHiddenFilters(binding,()=> 'institution')).toEqual(binding._resolvedHiddenFilters);
 expect(resolveHiddenFilterRules([{id:'x',column:'status',operator:'in',value:'active,pending'},{id:'y',column:'cover',operator:'is_null',when:{variable:'{{ local.showEmpty }}',operator:'eq',value:'true'}}],()=>true)).toEqual([{column:'status',op:'in',value:['active','pending']},{column:'cover',op:'is_null'}]);
});
const binding:any={dataSourceId:'fixture',tableName:'catalog',pagination:{enabled:true,pageSize:12,page:0},sorting:{enabled:false},filtering:{searchEnabled:false,filters:{}},columnOverrides:{},hiddenFilters:rules};
function Probe({table=false,edge=false}:{table?:boolean;edge?:boolean}){
 const mode=edge?'edge':'builder';
 const b=edge?{...binding,dataRequest:{fetchStrategy:'proxy',datasourceId:'fixture',queryConfig:{tableName:'catalog'},resultPath:'rows'}}:binding;
 const grid=useGridQuery({mode,binding:b,enabled:!table});const data=useDataTableData({mode,binding:b,page:0,pageSize:12,enabled:table});
 return <div>{table?JSON.stringify(data.data):JSON.stringify(grid.data)}</div>;
}
it.each([{table:false,edge:false},{table:true,edge:false},{table:false,edge:true},{table:true,edge:true}])('sends live single-binding filters and reacts to URL changes: %j',async options=>{
 window.history.replaceState(null,'','/?type=program');(window.location as any).search='?type=program';
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>({records:[{title:'Matched'}],total:1,success:true,data:{rows:[{title:'Matched'}],total:1}})}));vi.stubGlobal('fetch',fetcher);
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><Probe {...options}/></QueryClientProvider>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalled());
 const filters=()=>options.edge?JSON.parse(fetcher.mock.calls.at(-1)![1]!.body as string).dataRequest.body.filters:JSON.parse(new URL(fetcher.mock.calls.at(-1)![0] as string,'https://fixture.test').searchParams.get('filters')!);
 expect(filters()).toEqual([{column:'country',op:'eq',value:'22'},{column:'kind',op:'eq',value:'program'}]);
 const before=fetcher.mock.calls.length;
 await act(async()=>{window.history.replaceState(null,'','/?type=institution');(window.location as any).search='?type=institution';window.dispatchEvent(new PopStateEvent('popstate'));});
 await waitFor(()=>expect(fetcher.mock.calls.length).toBeGreaterThan(before));expect(filters()).toEqual([{column:'country',op:'eq',value:'22'}]);
 client.clear();
});
it('reacts to local-state button changes without changing the bound table',async()=>{
 const listeners=new Set<()=>void>();let current='institution';
 (window as any).__VARIABLE_STORE__={get:()=>current,subscribe:(fn:()=>void)=>{listeners.add(fn);return ()=>listeners.delete(fn);}};
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>({records:[]})}));vi.stubGlobal('fetch',fetcher);
 const localBinding={...binding,hiddenFilters:[{...rules[1],value:'program',when:{variable:'{{ local.type }}',operator:'eq',value:'program'}}]};
 function LocalProbe(){useGridQuery({mode:'builder',binding:localBinding});return null;}
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}><LocalProbe/></QueryClientProvider>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalled());const before=fetcher.mock.calls.length;
 await act(async()=>{current='program';listeners.forEach(fn=>fn());});await waitFor(()=>expect(fetcher.mock.calls.length).toBeGreaterThan(before));
 expect(fetcher.mock.calls.at(-1)![0]).toContain('/tables/catalog/data/?');expect(new URL(fetcher.mock.calls.at(-1)![0] as string,'https://fixture.test').searchParams.get('filters')).toContain('program');client.clear();
});
