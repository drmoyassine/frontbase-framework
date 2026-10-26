import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useSearchParams,Link} from 'react-router-dom';
import {api,viewsApi} from '../api';
import {SavedViewInspector,type ViewAsset} from '../components/SavedViewInspector';
export function SavedViews(){
    const [params,setParams]=useSearchParams(),[search,setSearch]=useState(''),[plan,setPlan]=useState<any>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const client=useQueryClient();
    const views=useQuery({queryKey:['saved-view-assets'],queryFn:()=>api.get<ViewAsset[]>('/views/').then(r=>r.data)});
    const selected=views.data?.find(v=>v.id===params.get('view'));
    const rows=views.data?.filter(v=>(!params.get('datasource')||v.datasource_id===params.get('datasource'))&&`${v.name} ${v.datasource_name} ${v.target_table}`.toLowerCase().includes(search.toLowerCase()));
    function selectView(id?:string){const next=new URLSearchParams(params);if(id)next.set('view',id);else next.delete('view');setParams(next);}
    async function removeView(view:ViewAsset){
        if(busy||view.usage?.length||!window.confirm(`Delete view "${view.name}"?`))return;
        setBusy(true);setMessage('');
        try{await viewsApi.delete(view.id);if(selected?.id===view.id)selectView();await client.invalidateQueries({queryKey:['saved-view-assets']});await client.invalidateQueries({queryKey:['datasources']});setMessage('Saved view deleted.');}
        catch{setMessage('Could not delete the saved view. Reload and retry.');}finally{setBusy(false);}
    }
    async function migrate(mode:'preview'|'apply'){
        setBusy(true);setMessage('');try{
            const state=await api.get('/api/project/site-configuration/publication/state/',{baseURL:''});
            const response=await api.post('/api/project/live-list-migration/editable/',{mode,baseHash:state.data.pointer?.hash,...(mode==='apply'?{planHash:plan.planHash}:{})},{baseURL:''});
            if(mode==='preview')setPlan(response.data);else{setPlan(undefined);setMessage('Selection is now stored in editable saved filters. Published pages and pending designs were preserved.');await client.invalidateQueries({queryKey:['saved-view-assets']});await client.invalidateQueries({queryKey:['datasources']});}
        }catch(error:any){setMessage(error.response?.data?.detail||'Conversion stopped. Reload state before retrying.');}finally{setBusy(false);}
    }
    return <div className="space-y-4"><div className="flex items-center justify-between gap-4"><div><h3 className="text-lg font-semibold">Saved Views</h3><p className="text-sm text-muted-foreground">Reusable live selections for Repeaters, Tables and Grids.</p></div><button className="underline text-sm" onClick={()=>void views.refetch()}>Reload views</button></div><input aria-label="Search saved views" placeholder="Search views, datasource or table…" className="w-full rounded border bg-background p-2" value={search} onChange={e=>setSearch(e.target.value)}/>
    {params.has('datasource')&&<p className="text-sm">Showing views for the selected connection. <button className="underline" onClick={()=>{const next=new URLSearchParams(params);next.delete('datasource');setParams(next);}}>Show all views</button></p>}
    {views.isPending?<p>Loading saved views…</p>:views.error?<p role="alert">Saved views could not be loaded. <button className="underline" onClick={()=>void views.refetch()}>Retry</button></p>:<div className="overflow-auto rounded border"><table className="w-full text-sm"><thead><tr>{['Name','Datasource','Table','Used by',''].map((label,i)=><th key={i} className="text-left p-3">{label}</th>)}</tr></thead><tbody>{rows?.map(view=><tr className="border-t align-top" key={view.id}><td className="p-3"><button className="font-medium underline text-left" onClick={()=>selectView(view.id)}>{view.name}</button></td><td className="p-3">{view.datasource_name}</td><td className="p-3 font-mono text-xs">{view.target_table}</td><td className="p-3"><ul className="space-y-2">{view.usage?.map((usage,i)=><li key={i}><Link className="underline" to={`/builder/${usage.pageId}`}>{usage.name} · {usage.version}</Link><span className="ml-2 rounded border px-1 text-xs">{usage.state}</span></li>)}</ul>{!view.usage?.length&&<span className="text-muted-foreground">No page bindings</span>}</td><td className="p-3"><button className="rounded border px-3 py-1" onClick={()=>selectView(view.id)}>Inspect view</button><button className="block mt-2 underline" disabled={busy||!!view.usage?.length} title={view.usage?.length?'Remove page bindings before deleting this view':undefined} onClick={()=>void removeView(view)}>Delete view</button></td></tr>)}</tbody></table>{!rows?.length&&<p className="p-4">No saved views match. Create one from a datasource’s Data Inspector.</p>}</div>}
    {views.data?.some(view=>view.selection_storage==='legacy-sql')&&<details className="rounded border p-4"><summary>Move legacy SQL selection into saved filters</summary><p className="text-sm my-3">One-time conversion for existing pilot views. Keeps the same selected records and public fields; exposes selection rules here for editing.</p><button disabled={busy} className="underline" onClick={()=>void migrate('preview')}>Preview conversion</button>{plan&&<div className="mt-3 space-y-3"><ul>{plan.views.map((view:any)=><li key={view.id}>{view.name} · {view.total} records</li>)}</ul><button disabled={busy} className="rounded border p-2" onClick={()=>void migrate('apply')}>Apply editable filters</button></div>}</details>}
    {message&&<p role="status">{message}</p>}{params.has('view')&&views.isSuccess&&!selected&&<p role="alert">This saved view is unavailable in this project.</p>}{selected&&<SavedViewInspector key={selected.id} view={selected} onClose={()=>selectView()}/>}</div>;
}
