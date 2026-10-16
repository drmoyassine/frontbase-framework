import React,{useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),schema:vi.fn()}));
vi.mock('../api',()=>({api:{get:mocks.get,post:mocks.post,patch:mocks.patch},datasourcesApi:{getTableSchema:mocks.schema}}));
import {SavedFilterEditor,SavedViewInspector} from './SavedViewInspector';
import {SavedViews} from '../pages/SavedViews';
const asset:any={id:'selected',name:'USA institutions',datasource_id:'source',datasource_name:'Studygram DB',target_table:'public_institutions',description:'Public-field projection.',filters:[{field:'country_id',operator:'eq',value:22}],visible_columns:['title'],column_order:['id','title','country_id'],updated_at:'revision-a',usage:[{pageId:'explore',name:'Explore',version:'Default',state:'Published',componentId:'list'}]};
afterEach(()=>{cleanup();vi.clearAllMocks();});
function wrapper(node:React.ReactNode){return render(<MemoryRouter initialEntries={['/data-studio/saved-views?view=selected']}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}>{node}</QueryClientProvider></MemoryRouter>);}
it('direct view URLs open the exact inspector and display saved results',async()=>{
    mocks.get.mockResolvedValue({data:[asset]});mocks.schema.mockResolvedValue({data:{columns:asset.column_order.map((name:string)=>({name,type:'text'}))}});mocks.post.mockResolvedValue({data:{rows:[{id:1,title:'Campus',country_id:22}],total:16,pageSize:25}});
    wrapper(<SavedViews/>);expect(await screen.findByRole('dialog',{name:'Saved view data inspector'})).toBeTruthy();expect(await screen.findByText('Campus')).toBeTruthy();expect(screen.getByRole('link',{name:'Explore · Default'}).getAttribute('href')).toContain('/builder/explore');expect(screen.getByText('Published')).toBeTruthy();
});
it('typed groups stay editable and an empty group is not silently treated as true',async()=>{
    function Harness(){const [rules,setRules]=useState<any[]>([{logic:'or',label:'Selected IDs',conditions:[{field:'id',operator:'in',value:[1,2]}]}]);return <><SavedFilterEditor rules={rules} fields={['id']} onChange={setRules}/><output>{JSON.stringify(rules)}</output></>;}
    wrapper(<Harness/>);fireEvent.click(screen.getByText('Selected IDs · Match any · 1 rules'));fireEvent.change(await screen.findByRole('textbox',{name:'Filter value as JSON'}),{target:{value:'[2,3]'}});expect(screen.getByRole('status').textContent).toContain('[2,3]');
});
it('saving uses the editor revision and retains edits after a stale write refusal',async()=>{
    mocks.schema.mockResolvedValue({data:{columns:[{name:'title',type:'text'}]}});mocks.post.mockResolvedValue({data:{rows:[],total:0,pageSize:25}});mocks.patch.mockRejectedValue({response:{data:{detail:'View changed. Reload before saving.'}}});
    const rendered=wrapper(<SavedViewInspector view={asset} onClose={()=>{}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'Name'}),{target:{value:'My changed view'}});
    rendered.rerender(<MemoryRouter><QueryClientProvider client={new QueryClient()}><SavedViewInspector view={{...asset,updated_at:'revision-b'}} onClose={()=>{}}/></QueryClientProvider></MemoryRouter>);
    fireEvent.submit(screen.getByRole('button',{name:'Save view'}).closest('form')!);
    await waitFor(()=>expect(mocks.patch).toHaveBeenCalled());expect(mocks.patch.mock.calls[0][1].expected_updated_at).toBe('revision-a');expect(await screen.findByText('View changed. Reload before saving.')).toBeTruthy();expect(screen.getByRole('textbox',{name:'Name'})).toHaveProperty('value','My changed view');
});
