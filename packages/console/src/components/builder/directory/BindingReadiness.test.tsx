import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {emptyDirectoryConfiguration,directoryConfigurationDiagnostics,directoryConfigurationReadiness} from '@frontbase/edge-core/directory/configuration';
import {BindingReadiness} from './BindingReadiness';
import {DirectoryConfigurationPanel} from './DirectoryConfigurationPanel';
vi.mock('@/components/data-binding/DataSourceSelector',()=>({DataSourceSelector:()=> <div>Datasource picker</div>}));
vi.mock('@/components/data-binding/TableSelector',()=>({TableSelector:()=> <div>Table picker</div>}));
vi.mock('@/hooks/data/useBindingColumns',()=>({useBindingColumns:()=>[]}));
afterEach(cleanup);
it('preserves every admission requirement without mutating existing configuration',()=>{
 const configuration=emptyDirectoryConfiguration();
 configuration.collections.program.scope={field:'site_id',value:0};
 configuration.contacts.email='owner@example.com';
 const prior=JSON.stringify(configuration),missing=directoryConfigurationReadiness(configuration);
 expect(directoryConfigurationDiagnostics(configuration).map(issue=>issue.key)).toEqual(missing);
 expect(JSON.stringify(configuration)).toBe(prior);
 expect(missing).not.toContain('collections.program.scope');
 expect(missing).toContain('collections.institution.fields.cityId');
});
it('routes specific problems to their existing authoring owners without displaying scope values',()=>{
 const configuration=emptyDirectoryConfiguration();configuration.datasourceId='source';configuration.collections.program.table='programs';configuration.collections.program.scope={field:'',value:'private-scope-value'};
 render(<BindingReadiness configuration={configuration}/>);
 expect(screen.getByRole('link',{name:'Site identity: enter the public site name.',hidden:true})).toHaveAttribute('href','/frontbase-admin/settings?tab=general');
 expect(screen.getByRole('link',{name:'Programs: select the institution relationship field.',hidden:true})).toHaveAttribute('href','/frontbase-admin/data-studio/datasources?setup=collections#binding-collections-program-fields-institutionId');
 expect(screen.queryByText(/private-scope-value/)).toBeNull();
 expect(screen.queryByText(/configuration items remain/)).toBeNull();
});
it('opens and focuses the existing exact field without changing mappings',()=>{
 const changed=vi.fn(),configuration=emptyDirectoryConfiguration();configuration.datasourceId='source';configuration.collections.program.table='programs';render(<DirectoryConfigurationPanel section="data" value={configuration} onChange={changed}/>);
 fireEvent.click(screen.getByText('Resolve before publication'));
 fireEvent.click(screen.getByText('Programs: select the institution relationship field.'));
 const field=screen.getByLabelText('program Institution relationship');
 expect(field).toHaveFocus();expect(field.closest('details')).toHaveAttribute('open');expect(changed).not.toHaveBeenCalled();
});
it('never treats optional missing media as a publication failure',()=>{
 const configuration=emptyDirectoryConfiguration();
 expect(directoryConfigurationDiagnostics(configuration).some(issue=>/cover|logo|gallery/.test(issue.key))).toBe(false);
});

it('shows only the next actionable dependency while retaining full publication admission',()=>{
 const configuration=emptyDirectoryConfiguration();render(<BindingReadiness configuration={configuration} area="data"/>);
 fireEvent.click(screen.getByText('Resolve before publication'));
 expect(screen.getAllByRole('link')).toHaveLength(1);
 expect(screen.getByRole('link')).toHaveTextContent('select a datasource');
 expect(directoryConfigurationReadiness(configuration)).toContain('collections.program.fields.institutionId');
});
