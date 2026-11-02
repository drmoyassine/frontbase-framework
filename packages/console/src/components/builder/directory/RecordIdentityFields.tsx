import React,{useEffect} from 'react';
import {focusBindingSetting} from './BindingReadiness';
import type {DirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {useBindingColumns} from '@/hooks/data/useBindingColumns';
export type RecordIdentityRole='institution'|'program'|'article';
/** Edit the existing shared contract, never a second copy in the template layout. */
export function RecordIdentityFields({configuration,role,onChange}:{configuration:DirectoryConfiguration;role:RecordIdentityRole;onChange:(value:DirectoryConfiguration)=>void}) {
    const mapping=configuration.collections[role];
    useEffect(()=>{const id=window.location.hash.slice(1);if(id.startsWith('binding-collections-'+role+'-fields-'))focusBindingSetting(id);},[role]);
    const columns=useBindingColumns(mapping.table||undefined,configuration.datasourceId||undefined);
    const options=[...new Set([...columns.map(column=>column.name),mapping.fields.id,mapping.fields.originalPath].filter(Boolean))];
    return <div className="space-y-4">
        <p className="break-words text-sm">Source table: {mapping.table||'Not selected'}. <a className="underline" href={'/frontbase-admin/data-studio/datasources?setup=collections#binding-collections-'+role+'-table'}>Manage source in Data Studio</a></p>
        {(['id','originalPath'] as const).map(field=><label key={field} className="block space-y-1 text-sm">{field==='id'?'Record ID field':'Original URL field'}
            <select id={'binding-collections-'+role+'-fields-'+field} aria-label={field==='id'?'Record ID field':'Original URL field'} disabled={!mapping.table||!configuration.datasourceId} className="w-full rounded border bg-background p-2" value={mapping.fields[field]} onChange={event=>onChange({...configuration,collections:{...configuration.collections,[role]:{...mapping,fields:{...mapping.fields,[field]:event.target.value}}}})}>
                <option value="">Select a field</option>{options.map(name=><option key={name} value={name}>{name}</option>)}
            </select></label>)}
        {mapping.table&&!columns.length&&<p className="text-sm text-muted-foreground">Field discovery is unavailable or empty. Existing selections are retained. Check the datasource connection before changing fields.</p>}
        <p className="text-sm text-muted-foreground">These fields identify records and preserve their original URLs. Changes remain drafts until reviewed publication. Existing publication filters and translations are preserved.</p>
    </div>;
}
