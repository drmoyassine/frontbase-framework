import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const query=vi.hoisted(()=>vi.fn(()=>({data:[],totalCount:0,isLoading:false,error:null})));
vi.mock('@frontbase/grid',()=>({useGridQuery:query}));
import {Repeater} from '../../../hydrate/src/wrappers/repeater/Repeater';
afterEach(()=>{cleanup();query.mockClear();});
const renderList=(ui:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{ui}</QueryClientProvider>);
it('adds visitor search and filters to predicates already resolved by SSR',()=>{
    renderList(<Repeater binding={{tableName:'catalog',pagination:{enabled:true,pageSize:12},hiddenFilters:[{column:'country',operator:'eq',value:'USA'}],_resolvedHiddenFilters:[{column:'country',op:'eq',value:'USA'}]}} controls={{search:true,searchColumn:'title',filters:[{id:'score',column:'score',label:'Score',type:'number'}]}}/>);
    fireEvent.change(screen.getByRole('searchbox',{name:'Search'}),{target:{value:'Campus'}});
    fireEvent.change(screen.getByRole('spinbutton',{name:'Score'}),{target:{value:'0'}});
    const binding=(query.mock.calls.at(-1) as any)[0].binding;
    expect(binding._resolvedHiddenFilters).toEqual([{column:'country',op:'eq',value:'USA'},{column:'title',op:'contains',value:'Campus'},{column:'score',op:'eq',value:0}]);
});
it('does not seed a newly sorted query with records from the original SSR order',()=>{
    const initialRows=[{id:1,title:'Campus'}];
    renderList(<Repeater binding={{tableName:'catalog',columnOrder:['title'],sorting:{column:'title',direction:'asc'}}} initialRows={initialRows} _initialQuery={{page:0,search:'',sortColumn:'title',direction:'asc'}} controls={{ordering:true}}/>);
    expect((query.mock.calls.at(-1) as any)[0].initialData).toBe(initialRows);
    fireEvent.change(screen.getByRole('combobox',{name:'Direction'}),{target:{value:'desc'}});
    expect((query.mock.calls.at(-1) as any)[0].initialData).toBeUndefined();
});

it('renders reviewed list chrome and keeps Arabic pagination interactive',()=>{
 renderList(<Repeater binding={{componentId:'list',tableName:'catalog',pagination:{enabled:true,pageSize:1},_localePath:'/ar/list/',_localeLabels:{next:'التالي',previous:'السابق',page:'صفحة {page}',pageOf:'صفحة {page} من {pages}',count:'{count} سجل'}}} controls={{count:true}}/>);
 expect(screen.getByRole('button',{name:'التالي'})).toBeTruthy();expect(screen.getByText('0 سجل')).toBeTruthy();expect(screen.getByText('صفحة 1 من 1')).toBeTruthy();
});
