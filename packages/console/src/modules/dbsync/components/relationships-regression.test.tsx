import React from 'react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {RelationshipsView} from './data-preview/RelationshipsView';
import {RelationshipModal} from './RelationshipModal';
import {datasourcesApi} from '../api';
vi.mock('../api',()=>({datasourcesApi:{getRelationships:vi.fn(),get:vi.fn(),getTables:vi.fn(),listUserRelationships:vi.fn(),getTableSchema:vi.fn()}}));
function mount(ui:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{ui}</QueryClientProvider>);}
beforeEach(()=>{vi.mocked(datasourcesApi.getRelationships).mockResolvedValue({data:{relationships:[]}} as any);vi.mocked(datasourcesApi.get).mockResolvedValue({data:{type:'supabase'}} as any);vi.mocked(datasourcesApi.getTables).mockResolvedValue({data:[]} as any);vi.mocked(datasourcesApi.listUserRelationships).mockResolvedValue({data:{relationships:[]}} as any);});
describe('existing relationship editors',()=>{
 it('passes the selected schema to relationship discovery without a render error',async()=>{
  mount(<RelationshipsView datasourceId={12} sourceSchema="catalog"/>);
  await waitFor(()=>expect(datasourcesApi.getRelationships).toHaveBeenCalledWith(12,undefined,'catalog'));
  expect(datasourcesApi.get).toHaveBeenCalledWith('12');
 });
 it('opens manual relationship editing before any table is selected',async()=>{
  mount(<RelationshipModal datasourceId="source" datasourceName="Catalog" onClose={()=>{}}/>);
  await waitFor(()=>expect(datasourcesApi.listUserRelationships).toHaveBeenCalledWith('source'));
  expect(await screen.findAllByText('Add Relationship')).not.toHaveLength(0);
 });
});
