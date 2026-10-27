import React from 'react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({get:vi.fn(),remove:vi.fn()}));
vi.mock('../api',()=>({api:{get:mocks.get},viewsApi:{delete:mocks.remove}}));
vi.mock('../components/SavedViewInspector',()=>({SavedViewInspector:({view,onClose}:any)=><div>Inspecting {view.name}<button onClick={onClose}>Close inspector</button></div>}));
import {SavedViews} from './SavedViews';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const rows=[{id:'one',name:'Institutions',datasource_id:'a',datasource_name:'A',target_table:'institutions',usage:[]},{id:'two',name:'Programs',datasource_id:'b',datasource_name:'B',target_table:'programs',usage:[{pageId:'page',name:'Explore',version:'1',state:'published',componentId:'list'}]}];
function mount(path='/?datasource=a'){mocks.get.mockResolvedValue({data:rows});return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SavedViews/></QueryClientProvider></MemoryRouter>);}
describe('saved view ownership',()=>{
 it('filters by connection and preserves it when closing the inspector',async()=>{mount();await screen.findByText('Institutions');expect(screen.queryByText('Programs')).not.toBeInTheDocument();fireEvent.click(screen.getByText('Inspect view'));await screen.findByText('Inspecting Institutions');fireEvent.click(screen.getByText('Close inspector'));expect(screen.queryByText('Programs')).not.toBeInTheDocument();fireEvent.click(screen.getByText('Show all views'));await screen.findByText('Programs');});
 it('deletes an unused view through the existing API without reloading the page',async()=>{mocks.remove.mockResolvedValue({});vi.spyOn(window,'confirm').mockReturnValue(true);mount();fireEvent.click(await screen.findByText('Delete view'));await screen.findByText('Saved view deleted.');expect(mocks.remove).toHaveBeenCalledWith('one');await waitFor(()=>expect(mocks.get.mock.calls.length).toBeGreaterThan(1));});
 it('protects page-bound views from deletion',async()=>{mount('/?datasource=b');expect(await screen.findByText('Delete view')).toBeDisabled();});
});
