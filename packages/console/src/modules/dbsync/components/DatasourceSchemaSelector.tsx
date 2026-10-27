import {useEffect,useId,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {datasourcesApi,viewsApi} from '../api';

export function useDatasourceSchema(id?:string|number){
    return useQuery({queryKey:['datasource-schema-options',id],enabled:!!id,queryFn:async()=>{
        const {data}=await datasourcesApi.get(String(id));
        return {supported:data.type==='supabase',defaultSchema:data.extra_config?.schema??'public',native:data.extra_config?.endpoint_format==='postgrest'};
    }});
}

/** Metadata is validated on Apply; this control never grants or exposes a schema. */
export function DatasourceSchemaSelector({datasourceId,value,onChange}:{datasourceId:string|number;value:string;onChange:(schema:string)=>void}){
    const metadata=useDatasourceSchema(datasourceId),listId=useId(),scope=useRef(0),[draft,setDraft]=useState(value),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const views=useQuery({queryKey:['schema-known-views',datasourceId],queryFn:()=>viewsApi.list(datasourceId).then(r=>r.data),enabled:metadata.data?.supported===true});
    useEffect(()=>{scope.current++;setDraft(value);setError('');setBusy(false);return ()=>{scope.current++;};},[value,datasourceId]);
    if(!metadata.data?.supported)return null;
    const choices=[...new Set([metadata.data.defaultSchema,...(views.data??[]).map(view=>view.source_schema).filter((schema):schema is string=>!!schema)])];
    async function apply(){
        const request=++scope.current;
        setBusy(true);setError('');
        try{await datasourcesApi.getTables(datasourceId,draft);if(scope.current===request)onChange(draft);}
        catch{if(scope.current===request)setError('Schema unavailable. Check that this schema is exposed by the API and permitted for this connection.');}
        finally{if(scope.current===request)setBusy(false);}
    }
    return <div className="space-y-2 rounded border p-3"><div className="flex flex-wrap items-end gap-3"><label className="flex-1 text-sm">Schema<input aria-label="Schema" list={listId} value={draft} maxLength={63} disabled={busy} onChange={event=>{setDraft(event.target.value);setError('');}} className="mt-1 block w-full rounded border bg-background p-2"/><datalist id={listId}>{choices.map(schema=><option key={schema} value={schema}>{schema}</option>)}</datalist></label><button type="button" disabled={busy||!draft.trim()||draft===value} onClick={()=>void apply()} className="rounded border px-3 py-2 text-sm">{busy?'Checking…':'Apply schema'}</button></div><p className="text-xs text-muted-foreground">Active schema: {value}. Connection default: {metadata.data.defaultSchema}. Choose a known schema or enter an exposed schema name.</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
