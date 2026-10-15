import React,{useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
vi.mock('posthog-js',()=>({default:{init:vi.fn(),capture:vi.fn(),identify:vi.fn(),reset:vi.fn()}}));
vi.mock('@/components/data-binding/DataSourceSelector',()=>({DataSourceSelector:({value,onValueChange}:any)=><select aria-label="Data source" value={value} onChange={event=>onValueChange(event.target.value)}><option value="source-a">Source A</option><option value="source-b">Source B</option></select>}));
vi.mock('@/components/data-binding/TableSelector',()=>({TableSelector:({value,onValueChange}:any)=><select aria-label="Table" value={value} onChange={event=>onValueChange(event.target.value)}><option value="">Choose table</option><option value="catalog">Catalog</option></select>}));
vi.mock('@/hooks/data/useBindingColumns',()=>({useBindingColumns:()=>[{name:'title',type:'text'},{name:'id',type:'integer'}]}));
vi.mock('@/components/builder/data-table/CompactColumnConfigurator',()=>({CompactColumnConfigurator:()=>null}));
vi.mock('@/components/builder/data-binding/RepeaterFieldMappings',()=>({RepeaterFieldMappings:()=>null}));
import {RepeaterProperties} from '../properties/basic/RepeaterProperties';
import {GridProperties} from '../properties/basic/GridProperties';
import {DataTablePropertiesPanel} from '../data-table/DataTablePropertiesPanel';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const original:any={componentId:'list',dataSourceId:'source-a',tableName:'catalog',viewId:'old-view',columnOrder:['title'],columnOverrides:{},pagination:{enabled:true,pageSize:12,page:3},sorting:{enabled:true,column:'title'},filtering:{searchEnabled:false,filters:{}},hiddenFilters:[{id:'country',column:'country',operator:'eq',value:'USA'}],dataRequest:{url:'old-compiled-request'}};

it.each([['Repeater',RepeaterProperties],['Table',DataTablePropertiesPanel],['Grid',GridProperties]])('%s uses the shared live selector and clears stale source state',async(_name,Panel)=>{
    const updates=vi.fn();
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>[{id:'new-view',name:'Available live records',target_table:'catalog',column_order:['title']}]})));
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
    function Harness(){const [binding,setBinding]=useState(original);return <Panel activeTab="general" componentId="list" binding={binding} onBindingUpdate={next=>{updates(next);setBinding(next);}} props={{}} updateComponentProp={()=>{}}/>;}
    render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
    expect(screen.queryByRole('combobox',{name:'Data mode'})).toBeNull();
    fireEvent.change(screen.getByRole('combobox',{name:'Data source'}),{target:{value:'source-b'}});
    expect(updates.mock.calls.at(-1)?.[0]).toMatchObject({dataSourceId:'source-b',tableName:'',hiddenFilters:[],columnOrder:[],pagination:{page:0}});
    expect(updates.mock.calls.at(-1)?.[0]).not.toHaveProperty('dataRequest');
    await screen.findByRole('option',{name:'Available live records'});
    fireEvent.change(screen.getByRole('combobox',{name:'Saved view'}),{target:{value:'new-view'}});
    expect(updates.mock.calls.at(-1)?.[0]).toMatchObject({dataSourceId:'source-b',tableName:'catalog',viewId:'new-view',columnOrder:['title']});
});

it('Grid Options exposes the same search, visible/hidden filters and control settings as Table',()=>{
    const client=new QueryClient();
    render(<QueryClientProvider client={client}><GridProperties activeTab="options" componentId="list" binding={{...original,viewId:undefined,sorting:{enabled:false}}} onBindingUpdate={()=>{}} props={{}} updateComponentProp={()=>{}}/></QueryClientProvider>);
    expect(screen.getByRole('switch',{name:'Search'})).toBeTruthy();
    expect(screen.getByRole('switch',{name:'Filters'})).toBeTruthy();
    expect(screen.getByText('Hidden Filters')).toBeTruthy();
    expect(screen.getByRole('region',{name:'List controls and states'})).toBeTruthy();
});
