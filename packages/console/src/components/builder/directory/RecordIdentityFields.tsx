import React,{useEffect} from 'react';
import {focusBindingSetting} from './BindingReadiness';
import type {DirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {useSavedViews} from '@/components/builder/data-binding/LiveSourceSelector';
import {useBindingColumns} from '@/hooks/data/useBindingColumns';
export type RecordIdentityRole='institution'|'program'|'article';
/** Edit the existing shared contract, never a second copy in the template layout. */
export function RecordIdentityFields({configuration,role,onChange}:{configuration:DirectoryConfiguration;role:RecordIdentityRole;onChange:(value:DirectoryConfiguration)=>void}) {
    const mapping=configuration.collections[role];
    useEffect(()=>{const id=window.location.hash.slice(1);if(id.startsWith('binding-collections-'+role+'-fields-'))focusBindingSetting(id);},[role]);
    const columns=useBindingColumns(mapping.table||undefined,configuration.datasourceId||undefined);
    const views=useSavedViews(configuration.datasourceId);
    const matchingViews=views.data?.filter(view=>view.target_table===mapping.table)??[];
    const selected=configuration.detailViews?.[role];
    const setView=(id:string)=>{
        const detailViews={...configuration.detailViews};
        if(id)detailViews[role]=id;
        else delete detailViews[role];
        onChange({...configuration,detailViews});
    };
    const options=[...new Set([...columns.map(column=>column.name),mapping.fields.id,mapping.fields.originalPath].filter(Boolean))];
    return <div className="space-y-4">
        <p className="break-words text-sm">Source table: {mapping.table||'Not selected'}</p>
        <label className="block space-y-1 text-sm">Saved View
            <select className="w-full rounded border bg-background p-2" value={selected??''} disabled={!mapping.table||views.isPending} onChange={event=>setView(event.target.value)}>
                <option value="">Use existing collection scope</option>
                {selected&&!matchingViews.some(view=>view.id===selected)&&<option value={selected}>Saved View unavailable</option>}
                {matchingViews.map(view=><option key={view.id} value={view.id}>{view.name}{view.source_schema?' ('+view.source_schema+')':''}</option>)}
            </select>
        </label>
        {views.error&&<p role="alert">Saved Views could not be loaded. <button type="button" onClick={()=>void views.refetch()}>Retry</button></p>}
        <a className="text-sm underline" href={'/frontbase-admin/data-studio/saved-views'+(selected?'?view='+encodeURIComponent(selected):'')}>{selected?'Edit Saved View':'Browse Saved Views'}</a>
        {(['id','originalPath'] as const).map(field=><label key={field} className="block space-y-1 text-sm">{field==='id'?'Record ID field':'Original URL field'}
            <select id={'binding-collections-'+role+'-fields-'+field} aria-label={field==='id'?'Record ID field':'Original URL field'} disabled={!mapping.table||!configuration.datasourceId} className="w-full rounded border bg-background p-2" value={mapping.fields[field]} onChange={event=>onChange({...configuration,collections:{...configuration.collections,[role]:{...mapping,fields:{...mapping.fields,[field]:event.target.value}}}})}>
                <option value="">Select a field</option>{options.map(name=><option key={name} value={name}>{name}</option>)}
            </select></label>)}
        {mapping.table&&!columns.length&&<p className="text-sm text-muted-foreground">Field discovery is unavailable or empty. Existing selections are retained. Check the datasource connection before changing fields.</p>}
        <p className="text-sm text-muted-foreground">These fields identify records and preserve their original URLs. Changes remain drafts until reviewed publication. Existing publication filters and translations are preserved.</p>
    </div>;
}
