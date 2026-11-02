import React from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {DirectoryConfigurationPanel} from './DirectoryConfigurationPanel';
vi.mock('@/components/data-binding/DataSourceSelector',()=>({DataSourceSelector:()=> <div>Datasource picker</div>}));
vi.mock('@/components/data-binding/TableSelector',()=>({TableSelector:()=> <div>Table picker</div>}));
vi.mock('@/hooks/data/useBindingColumns',()=>({useBindingColumns:()=>[]}));
afterEach(cleanup);
describe('shared configuration ownership',()=>{
 it('builder routes retain hidden data mappings and expose no second datasource picker',()=>{
  const config=emptyDirectoryConfiguration(); config.datasourceId='existing-source';
  const changed=vi.fn(); render(<DirectoryConfigurationPanel section="site" hideIdentity value={config} onChange={changed}/>);
  expect(screen.queryByText('Datasource picker')).toBeNull();
  fireEvent.change(screen.getByLabelText('Directory path'),{target:{value:'/browse'}});
  expect(changed.mock.calls[0][0]).toEqual({...config,routes:{...config.routes,directory:'/browse'}});
 });
 it('keeps legacy identity controls accessible when no reusable template owns the role',()=>{
  render(<DirectoryConfigurationPanel section="data" value={emptyDirectoryConfiguration()} onChange={()=>{}}/>);
  expect(screen.getByLabelText('program Record ID')).toBeInTheDocument();
  expect(screen.getByLabelText('program Original URL/path')).toBeInTheDocument();
  expect(screen.queryByText(/Configure record ID and original URL/)).toBeNull();
 });
 it('datasources own mappings without exposing route or appearance controls',()=>{
  render(<DirectoryConfigurationPanel section="data" identityRolesInUrls={["institution","program","article"]} value={emptyDirectoryConfiguration()} onChange={()=>{}}/>);
  expect(screen.getByText('Datasource picker')).toBeInTheDocument();
  expect(screen.queryByLabelText('Directory path')).toBeNull();
  expect(screen.queryByLabelText('Counselor email')).toBeNull();
  expect(screen.queryByLabelText('Cards per page')).toBeNull();
  expect(screen.queryByLabelText('program Record ID')).toBeNull();
  expect(screen.queryByLabelText('program Original URL/path')).toBeNull();
  expect(screen.getAllByText(/Configure record ID and original URL/)).toHaveLength(3);
 });
});
