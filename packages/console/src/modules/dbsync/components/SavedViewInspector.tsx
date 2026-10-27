import {DatasourceSchemaSelector,useDatasourceSchema} from './DatasourceSchemaSelector';
import {TableSelector} from '@/components/data-binding/TableSelector';
import {useEffect,useState} from 'react';

import {useQuery,useQueryClient} from '@tanstack/react-query';

import {api,datasourcesApi} from '../api';

import {savedViewFilters,type SavedFilter} from '@frontbase/edge-core/saved-view-filters';

import {RecordLocaleReview} from './RecordLocaleReview';



export type ViewAsset={selection_storage?:'saved-filters'|'legacy-sql';id:string;name:string;datasource_id:string;datasource_name:string;target_table:string;source_schema?:string|null;description?:string;filters:unknown[];visible_columns:string[];column_order:string[];updated_at:string;default_sort?:{column:string;direction:'asc'|'desc'};usage:{pageId:string;name:string;version:string;state:string;componentId:string}[]};

export function SavedViewInspectorLoader({id,datasourceName,onClose}:{id:string;datasourceName:string;onClose:()=>void}){

    const view=useQuery({queryKey:['saved-view-detail',id],queryFn:()=>api.get<ViewAsset>(`/views/${encodeURIComponent(id)}/`).then(r=>({...r.data,datasource_name:datasourceName,usage:[]}))});

    if(view.data)return <SavedViewInspector view={view.data} onClose={onClose}/>;

    return <div role="dialog" aria-label="Saved view data inspector" className="fixed inset-0 z-50 bg-background p-6"><p>{view.error?'Saved view unavailable.':'Loading saved view…'}</p><button onClick={onClose}>Close</button></div>;

}

const leaf=():SavedFilter=>({field:'',operator:'eq',value:''});
function FilterGroup({rule,fields,depth,onChange}:{rule:Extract<SavedFilter,{logic:string}>;fields:string[];depth:number;onChange:(rule:SavedFilter)=>void}){
    const [open,setOpen]=useState(false);
    return <details className="min-w-0 flex-1" open={open} onToggle={event=>{
        const target=event.currentTarget;
        if(!target.open&&target.querySelector(':invalid')){target.open=true;setOpen(true);return;}
        setOpen(target.open);
    }}><summary className="cursor-pointer">{rule.label||'Filter group'} · Match {rule.logic==='and'?'all':'any'} · {rule.conditions.length} rules</summary>{open&&<div className="mt-3 space-y-3"><select aria-label="Group matching" className="rounded border bg-background p-2" value={rule.logic} onChange={e=>onChange({...rule,logic:e.target.value as 'and'|'or'})}><option value="and">Match all (AND)</option><option value="or">Match any (OR)</option></select><SavedFilterEditor rules={rule.conditions} fields={fields} depth={depth+1} onChange={conditions=>onChange({...rule,conditions})}/></div>}</details>;
}

function TypedValue({value,onChange}:{value:unknown;onChange:(value:unknown)=>void}){

    const [text,setText]=useState(JSON.stringify(value));

    useEffect(()=>setText(JSON.stringify(value)),[value]);

    return <textarea aria-label="Filter value as JSON" className="w-full rounded border bg-background p-2 font-mono text-xs" rows={Array.isArray(value)?3:1} value={text} onChange={event=>{

        const raw=event.target.value;setText(raw);try{const parsed=JSON.parse(raw);event.target.setCustomValidity('');onChange(parsed);}catch{event.target.setCustomValidity('Enter valid JSON. Put text in quotes; use an array for an in-list filter.');}

    }}/>;

}

export function SavedFilterEditor({rules,fields,onChange,depth=0}:{rules:SavedFilter[];fields:string[];onChange:(rules:SavedFilter[])=>void;depth?:number}){

    const update=(index:number,rule:SavedFilter)=>onChange(rules.map((r,i)=>i===index?rule:r));

    return <div className="space-y-3">{rules.map((rule,index)=><div key={index} className="rounded border p-3 space-y-2">

        <div className="flex gap-2 items-start">{'logic' in rule?<FilterGroup rule={rule} fields={fields} depth={depth} onChange={value=>update(index,value)}/>:<div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-2"><select aria-label="Filter field" value={rule.field} className="rounded border bg-background p-2" onChange={e=>update(index,{...rule,field:e.target.value})}><option value="">Select field</option>{[...new Set([...fields,rule.field].filter(Boolean))].map(field=><option key={field}>{field}</option>)}</select><select aria-label="Filter operator" value={rule.operator} className="rounded border bg-background p-2" onChange={e=>update(index,{...rule,operator:e.target.value})}>{['eq','neq','gt','gte','lt','lte','in','contains','starts_with','ends_with','is_null','not_null'].map(op=><option key={op}>{op}</option>)}</select><div className="sm:col-span-2"><TypedValue value={rule.value} onChange={value=>update(index,{...rule,value})}/></div></div>}

        <button type="button" aria-label="Remove filter" className="text-sm underline" onClick={()=>onChange(rules.filter((_,i)=>i!==index))}>Remove</button></div>

    </div>)}<div className="flex gap-3"><button type="button" className="underline text-sm" onClick={()=>onChange([...rules,leaf()])}>Add filter</button>{depth<6&&<button type="button" className="underline text-sm" onClick={()=>onChange([...rules,{logic:'or',conditions:[leaf()]}])}>Add group</button>}</div></div>;

}

export function SavedViewInspector({view,onClose}:{view:ViewAsset;onClose:()=>void}){

    const client=useQueryClient(),[draft,setDraft]=useState(view),[filters,setFilters]=useState(()=>savedViewFilters(view.filters)),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[page,setPage]=useState(1),[revision,setRevision]=useState(view.updated_at);

    const metadata=useDatasourceSchema(view.datasource_id);
    const sourceSchema=draft.source_schema??(metadata.data?.supported?metadata.data.defaultSchema:undefined);
    const schema=useQuery({queryKey:['saved-view-schema',view.datasource_id,sourceSchema,draft.target_table],enabled:!!draft.target_table&&!!metadata.data,queryFn:()=>datasourcesApi.getTableSchema(view.datasource_id,draft.target_table,sourceSchema).then(r=>r.data)});

    const preview=useQuery({queryKey:['saved-view-preview',view.id,view.updated_at,page],queryFn:()=>api.post<{rows:Record<string,unknown>[];total:number;pageSize:number}>(`/views/${encodeURIComponent(view.id)}/preview/`,{page}).then(r=>r.data)});

    const fields=schema.data?.columns.map(c=>c.name)??view.column_order;

    const change=(patch:Partial<ViewAsset>)=>{setDraft({...draft,...patch});setDirty(true);};

    async function save(event:React.FormEvent){event.preventDefault();setSaving(true);setMessage('');try{

        const response=await api.patch(`/views/${encodeURIComponent(view.id)}/`,{name:draft.name,source_schema:sourceSchema,target_table:draft.target_table,description:draft.description,filters:savedViewFilters(filters),visible_columns:draft.visible_columns,column_order:draft.column_order,default_sort:draft.default_sort??null,expected_updated_at:revision});

        setDraft({...view,...response.data});setRevision(response.data.updated_at);setDirty(false);setMessage('Saved. Components using this view now read these filters.');setPage(1);await client.invalidateQueries({queryKey:['saved-view-assets']});await client.invalidateQueries({queryKey:['datasources']});await client.invalidateQueries({queryKey:['schema-known-views',view.datasource_id]});await client.invalidateQueries({queryKey:['saved-view-detail',view.id]});await preview.refetch();

    }catch(error:any){setMessage(error.response?.data?.detail||error.message||'Save failed. Your edits are retained.');}finally{setSaving(false);}}

    return <div role="dialog" aria-modal="true" aria-label="Saved view data inspector" className="fixed inset-0 z-50 bg-background overflow-auto p-6"><div className="max-w-6xl mx-auto space-y-6"><div className="flex justify-between gap-4"><div><h2 className="text-xl font-semibold">Data Inspector · {view.name}</h2><p className="text-sm text-muted-foreground">{view.datasource_name} / {view.target_table}</p></div><button type="button" className="underline" onClick={()=>{if(!dirty||window.confirm('Discard unsaved view edits?'))onClose();}}>Close</button></div>

    {view.selection_storage==='legacy-sql'&&<p role="alert" className="rounded border p-3">This legacy view still has SQL selection restrictions. Close this inspector and use “Move legacy SQL selection into saved filters” before changing membership.</p>}

    <p className="rounded border p-3 text-sm">Saving changes this live view for every component using it. Page designs remain unchanged. Selection filters below are editable; datasource permissions and private-field protection are separate.</p>

    <form onSubmit={save} className="space-y-5">{metadata.data?.supported&&<DatasourceSchemaSelector datasourceId={view.datasource_id} value={sourceSchema??'public'} onChange={source_schema=>{change({source_schema,target_table:'',visible_columns:[],column_order:[],default_sort:undefined});setFilters([]);}}/>}<TableSelector dataSourceId={view.datasource_id} sourceSchema={sourceSchema} value={draft.target_table} onValueChange={target_table=>{change({target_table,visible_columns:[],column_order:[],default_sort:undefined});setFilters([]);}}/><label className="block">Name<input required className="block w-full rounded border bg-background p-2" value={draft.name} onChange={e=>change({name:e.target.value})}/></label><label className="block">Description<textarea className="block w-full rounded border bg-background p-2" value={draft.description??''} onChange={e=>change({description:e.target.value})}/></label>

    <section className="space-y-3"><h3 className="font-semibold">Saved filters · match all top-level rules</h3><p className="text-xs text-muted-foreground">Values use JSON: text in quotes, numbers without quotes, arrays for in-list filters. Expand groups to inspect every selection rule.</p><SavedFilterEditor rules={filters} fields={fields} onChange={value=>{setFilters(value);setDirty(true);}}/></section>

    <section><h3 className="font-semibold mb-3">Visible columns</h3><div className="flex flex-wrap gap-4">{fields.map(field=><label key={field} className="text-sm"><input type="checkbox" checked={draft.visible_columns?.includes(field)??false} onChange={e=>change({visible_columns:e.target.checked?[...(draft.visible_columns??[]),field]:(draft.visible_columns??[]).filter(c=>c!==field)})}/> {field}</label>)}</div></section>

    <div className="flex gap-3"><label>Default sort (unless overridden by the component)<select aria-label="Default sort field" className="block border rounded bg-background p-2" value={draft.default_sort?.column??''} onChange={e=>change({default_sort:e.target.value?{column:e.target.value,direction:draft.default_sort?.direction??'asc'}:undefined})}><option value="">No default</option>{fields.map(field=><option key={field}>{field}</option>)}</select></label><label>Direction<select aria-label="Default sort direction" className="block border rounded bg-background p-2" value={draft.default_sort?.direction??'asc'} onChange={e=>{if(draft.default_sort)change({default_sort:{...draft.default_sort,direction:e.target.value as 'asc'|'desc'}});}}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label></div><button disabled={saving||!dirty||!draft.target_table||schema.isPending||!!schema.error} className="rounded bg-primary text-primary-foreground px-4 py-2">{saving?'Saving…':'Save view'}</button>{message&&<p role="status">{message}</p>}</form>

    <section><div className="flex items-center justify-between"><h3 className="font-semibold">Live results · saved filters {preview.data?`· ${preview.data.total} records`:''}</h3><button className="underline" onClick={()=>void preview.refetch()}>Refresh results</button></div>{dirty&&<p className="text-sm">Save to apply your edited filters to these results.</p>}{draft.target_table!==view.target_table||draft.source_schema!==view.source_schema&&dirty?<p>Save this schema and table selection to load its records.</p>:preview.isPending?<p>Loading records…</p>:preview.error?<p role="alert">View preview could not be loaded.</p>:<><div className="overflow-auto max-h-96 border rounded mt-3"><table className="w-full text-sm"><thead><tr>{(draft.visible_columns?.length?draft.visible_columns:fields).map(field=><th className="text-left p-2" key={field}>{field}</th>)}</tr></thead><tbody>{preview.data?.rows.map((row,i)=><tr key={String(row.id??i)}>{(draft.visible_columns?.length?draft.visible_columns:fields).map(field=><td key={field} className="p-2 border-t max-w-xs truncate">{String(row[field]??'')}</td>)}</tr>)}</tbody></table></div><div className="flex gap-4 mt-3"><button disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!preview.data||page*25>=preview.data.total} onClick={()=>setPage(page+1)}>Next</button></div>{preview.data&&<RecordLocaleReview view={view} rows={preview.data.rows}/>}</>}</section></div></div>;

}
