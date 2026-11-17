import React,{useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),create:vi.fn(),rows:vi.fn(),tables:vi.fn(),schema:vi.fn(),session:vi.fn(),saveSession:vi.fn(),clearSession:vi.fn()}));
vi.mock('./DatasourceSchemaSelector',()=>({useDatasourceSchema:()=>({data:{supported:false}}),DatasourceSchemaSelector:()=>null}));
vi.mock('./data-preview/DataPreviewContent',()=>({DataPreviewContent:({tableData}:any)=><div>{tableData?.records.map((row:any)=><div key={row.id}>{row.title}</div>)}</div>}));
vi.mock('../api',()=>({
 api:{get:mocks.get,post:mocks.post,patch:mocks.patch},
 viewsApi:{update:mocks.patch,create:mocks.create},
 datasourcesApi:{getTables:mocks.tables,getTablesData:mocks.rows,getTableSchema:mocks.schema,getSession:mocks.session,saveSession:mocks.saveSession,clearSession:mocks.clearSession}
}));
import {SavedFilterEditor,SavedViewInspector} from './SavedViewInspector';
import {SavedViews} from '../pages/SavedViews';
import DataPreviewModal from './DataPreviewModal';
const asset:any={id:'selected',name:'USA institutions',datasource_id:'source',datasource_name:'Studygram DB',target_table:'institutions',description:'Public-field projection.',filters:[{logic:'or',label:'Selected IDs',conditions:[{field:'id',operator:'in',value:[1,2]}]}],visible_columns:['title'],column_order:['id','title'],pinned_columns:['title'],field_mappings:{title:'title'},linked_views:{},webhooks:[],default_sort:{column:'title',direction:'desc'},updated_at:'revision-a',usage:[{pageId:'explore',name:'Explore',version:'Default',state:'Published',componentId:'list'}]};
afterEach(()=>{cleanup();vi.clearAllMocks();});
function wrapper(node:React.ReactNode){
 mocks.tables.mockResolvedValue({data:['institutions']});
 mocks.schema.mockResolvedValue({data:{columns:[{name:'id',type:'number'},{name:'title',type:'text'}]}});
 mocks.post.mockResolvedValue({data:{rows:[{id:1,title:'Campus'}],total:1,pageSize:25}});
 return render(<MemoryRouter initialEntries={['/data-studio/saved-views?view=selected']}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}>{node}</QueryClientProvider></MemoryRouter>);
}
it('uses the existing inspector header, sidebar and results for a saved view without restoring a browsing session',async()=>{
 mocks.get.mockResolvedValue({data:[asset]});
 wrapper(<SavedViews/>);
 expect(await screen.findByRole('dialog',{name:'Data Inspector'})).toBeTruthy();
 expect(await screen.findByText('Campus')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Save View'})).toBeTruthy();
 expect(screen.getByRole('link',{name:'Explore · Default'}).getAttribute('href')).toContain('/builder/explore');
 expect(screen.getByPlaceholderText('Filter tables...')).toBeTruthy();
 expect(mocks.post).toHaveBeenCalledWith('/views/selected/preview/',{page:1});
 expect(mocks.session).not.toHaveBeenCalled();
 expect(mocks.saveSession).not.toHaveBeenCalled();
});
it('typed nested filters remain editable',async()=>{
 function Harness(){const [rules,setRules]=useState<any[]>(asset.filters);return <><SavedFilterEditor rules={rules} fields={['id']} onChange={setRules}/><output>{JSON.stringify(rules)}</output></>;}
 wrapper(<Harness/>);
 fireEvent.click(screen.getByText('Selected IDs · Match any · 1 rules'));
 fireEvent.change(await screen.findByRole('textbox',{name:'Filter value as JSON'}),{target:{value:'[2,3]'}});
 expect(screen.getByRole('status').textContent).toContain('[2,3]');
});
it('the shared Save View preserves nested filters, metadata and the loaded revision on stale-save errors',async()=>{
 mocks.patch.mockRejectedValue({response:{data:{detail:'View changed. Reload before saving.'}}});
 wrapper(<SavedViewInspector view={asset} onClose={()=>{}}/>);
 await screen.findByText('Campus');
 fireEvent.click(screen.getByRole('button',{name:'Save View'}));
 const name=screen.getByPlaceholderText('e.g., Active Institutions, Marketing Feed...');
 fireEvent.change(name,{target:{value:'My changed view'}});
 fireEvent.click(screen.getByRole('button',{name:'Confirm Save'}));
 await waitFor(()=>expect(mocks.patch).toHaveBeenCalled());
 expect(mocks.patch.mock.calls[0][0]).toBe('selected');
 expect(mocks.patch.mock.calls[0][1]).toMatchObject({expected_updated_at:'revision-a',filters:asset.filters,default_sort:asset.default_sort,pinned_columns:asset.pinned_columns,field_mappings:asset.field_mappings});
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','View changed. Reload before saving.');
 expect(name).toHaveProperty('value','My changed view');
});

it('creates a view through the same inspector and Save View header',async()=>{
 mocks.session.mockResolvedValue({data:{}});
 mocks.rows.mockResolvedValue({data:{records:[{id:1,title:'New campus'}],total:1,offset:0,limit:50,has_more:false}});
 mocks.create.mockResolvedValue({data:{...asset,name:'New view'}});
 wrapper(<DataPreviewModal isOpen onClose={()=>{}} datasourceId="source" datasourceName="Studygram DB" table="institutions"/>);
 await screen.findByText('New campus');
 fireEvent.click(screen.getByRole('button',{name:'Save View'}));
 fireEvent.change(screen.getByPlaceholderText('e.g., Active Institutions, Marketing Feed...'),{target:{value:'New view'}});
 fireEvent.click(screen.getByRole('button',{name:'Confirm Save'}));
 await waitFor(()=>expect(mocks.create).toHaveBeenCalled());
 expect(mocks.create.mock.calls[0][0]).toBe('source');
 expect(mocks.create.mock.calls[0][1]).toMatchObject({name:'New view',target_table:'institutions'});
 expect(await screen.findByRole('status')).toHaveProperty('textContent','View saved.');
});
