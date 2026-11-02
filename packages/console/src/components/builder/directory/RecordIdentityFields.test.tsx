import React,{useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {RecordIdentityFields} from './RecordIdentityFields';
vi.mock('@/hooks/data/useBindingColumns',()=>({useBindingColumns:()=>[{name:'record_key'},{name:'canonical_path'}]}));
afterEach(cleanup);
it('updates only the selected role identity while preserving source, filters, other roles and presentation fields',()=>{
 const configuration=emptyDirectoryConfiguration();configuration.datasourceId='owned';configuration.collections.program.table='programs';configuration.collections.program.scope={field:'country_id',value:22};configuration.collections.program.fields.title='name';configuration.collections.institution.fields.id='institution_key';
 const changed=vi.fn();render(<RecordIdentityFields configuration={configuration} role="program" onChange={changed}/>);
 fireEvent.change(screen.getByLabelText('Original URL field'),{target:{value:'canonical_path'}});
 const next=structuredClone(configuration);next.collections.program.fields.originalPath='canonical_path';expect(changed).toHaveBeenCalledWith(next);
 expect(configuration.collections.program.fields.originalPath).toBe('');
});
it('retains a saved field when unavailable in current discovery and blocks configuring an unselected source',()=>{
 const configuration=emptyDirectoryConfiguration();configuration.collections.program.fields.originalPath='existing_wp_url';
 render(<RecordIdentityFields configuration={configuration} role="program" onChange={()=>{}}/>);
 expect(screen.getByLabelText('Original URL field')).toHaveValue('existing_wp_url');expect(screen.getByLabelText('Original URL field')).toBeDisabled();
});
