import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({get:vi.fn(),tables:vi.fn(),views:vi.fn(),schema:vi.fn(),rows:vi.fn()}));
vi.mock('../api',()=>({datasourcesApi:{get:mocks.get,getTables:mocks.tables,getTableSchema:mocks.schema,getTablesData:mocks.rows},viewsApi:{list:mocks.views}}));
import {DatasourceSchemaSelector} from './DatasourceSchemaSelector';
import {useDataPreviewData} from '../hooks/data-preview/useDataPreviewData';
import {useLayoutStore} from '../store/useLayoutStore';
function wrapper(){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return ({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;}
afterEach(()=>{cleanup();vi.resetAllMocks();useLayoutStore.getState().reset();});
it('validates an exposed schema before applying and offers default/known schemas',async()=>{
 mocks.get.mockResolvedValue({data:{type:'supabase',extra_config:{schema:'public'}}});mocks.views.mockResolvedValue({data:[{source_schema:'translations'}]});mocks.tables.mockResolvedValue({data:['items']});const change=vi.fn();
 render(<DatasourceSchemaSelector datasourceId="one" value="public" onChange={change}/>,{wrapper:wrapper()});
 const input=await screen.findByRole('combobox',{name:'Schema'});fireEvent.change(input,{target:{value:'translations'}});fireEvent.click(screen.getByRole('button',{name:'Apply schema'}));
 await waitFor(()=>expect(change).toHaveBeenCalledWith('translations'));expect(mocks.tables).toHaveBeenCalledWith('one','translations');
 expect(screen.getByRole('option',{name:'translations',hidden:true})).toBeTruthy();
});
it('denied schemas keep the current scope and show an actionable error',async()=>{
 mocks.get.mockResolvedValue({data:{type:'supabase',extra_config:{schema:'translations'}}});mocks.views.mockResolvedValue({data:[]});mocks.tables.mockRejectedValue(Error('denied'));const change=vi.fn();
 render(<DatasourceSchemaSelector datasourceId="one" value="translations" onChange={change}/>,{wrapper:wrapper()});
 fireEvent.change(await screen.findByRole('combobox',{name:'Schema'}),{target:{value:'private'}});fireEvent.click(screen.getByRole('button',{name:'Apply schema'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('exposed'));expect(change).not.toHaveBeenCalled();
});
it('same-name table queries and returned rows stay separate across schemas',async()=>{
 mocks.tables.mockResolvedValue({data:['items']});mocks.schema.mockResolvedValue({data:{columns:[{name:'id'}]}});
 mocks.rows.mockImplementation(async(_id,_table,_size,_offset,_filters,schema)=>({data:{records:[{id:1,schema}],total:1,has_more:false}}));
 const {result,rerender}=renderHook(({sourceSchema})=>useDataPreviewData({isOpen:true,datasourceId:'one',sourceSchema,selectedTable:'items',appliedFilters:[],showDataSearchResults:false,dataSearchQuery:''}),{initialProps:{sourceSchema:'public'},wrapper:wrapper()});
 await waitFor(()=>expect(result.current.data?.records[0].schema).toBe('public'));rerender({sourceSchema:'translations'});
 expect(result.current.data?.records[0]?.schema).not.toBe('public');await waitFor(()=>expect(result.current.data?.records[0].schema).toBe('translations'));
 expect(mocks.schema).toHaveBeenCalledWith('one','items','translations');rerender({sourceSchema:'public'});await waitFor(()=>expect(result.current.data?.records[0].schema).toBe('public'));
});
it('layout changes in another schema do not overwrite the first schema layout',()=>{
 const store=useLayoutStore.getState();store.setActiveContext('one','items','public');store.setVisibleColumns(['name']);store.setActiveContext('one','items','translations');
 expect(useLayoutStore.getState().visibleColumns).toEqual([]);store.setVisibleColumns(['text']);store.setActiveContext('one','items','public');expect(useLayoutStore.getState().visibleColumns).toEqual(['name']);
});
it('a late validation response cannot apply a schema to a different datasource',async()=>{
 mocks.get.mockResolvedValue({data:{type:'supabase',extra_config:{schema:'public'}}});mocks.views.mockResolvedValue({data:[]});
 let resolve!:(value:unknown)=>void;mocks.tables.mockImplementation(()=>new Promise(done=>{resolve=done;}));const change=vi.fn();
 const rendered=render(<DatasourceSchemaSelector datasourceId="one" value="public" onChange={change}/>,{wrapper:wrapper()});
 fireEvent.change(await screen.findByRole('combobox',{name:'Schema'}),{target:{value:'alternate'}});fireEvent.click(screen.getByRole('button',{name:'Apply schema'}));
 rendered.rerender(<DatasourceSchemaSelector datasourceId="two" value="public" onChange={change}/>);resolve({data:['items']});
 await waitFor(()=>expect(screen.getByRole('combobox',{name:'Schema'})).toHaveProperty('value','public'));expect(change).not.toHaveBeenCalled();
});
