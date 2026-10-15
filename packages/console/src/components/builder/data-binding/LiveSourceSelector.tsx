import {useQuery} from '@tanstack/react-query';
import {DataSourceSelector} from '@/components/data-binding/DataSourceSelector';
import {TableSelector} from '@/components/data-binding/TableSelector';
import type {ComponentDataBinding} from '@/hooks/data/useSimpleData';

export function updateAuthoredBinding(binding:ComponentDataBinding, updates:Partial<ComponentDataBinding>):ComponentDataBinding {
    const {dataRequest,_resolvedHiddenFilters,_pendingHiddenFilters,...authored}=binding;
    return JSON.parse(JSON.stringify({...authored,...updates}));
}

export function resetListSource(binding:ComponentDataBinding, updates:Partial<ComponentDataBinding>):ComponentDataBinding {
    return updateAuthoredBinding(binding, {
        source:undefined,viewId:undefined,viewName:undefined,tableName:'',columnOverrides:{},columnOrder:[],
        searchColumns:undefined,frontendFilters:[],hiddenFilters:[],fieldMapping:undefined,
        filtering:{searchEnabled:false,filters:{}},sorting:{enabled:false},
        pagination:{...binding.pagination,page:0},...updates,
    });
}

export function LiveSourceSelector({binding,onChange,onSourceChange}:{binding:ComponentDataBinding;onChange:(binding:ComponentDataBinding)=>void;onSourceChange?:()=>void}) {
    const views=useQuery({queryKey:['list-source-views',binding.dataSourceId],enabled:!!binding.dataSourceId,queryFn:async({signal})=>{
        const response=await fetch(`/api/sync/datasources/${encodeURIComponent(binding.dataSourceId)}/views/`,{credentials:'include',signal});
        if(!response.ok)throw Error('Saved views unavailable');
        const result=await response.json();
        if(!Array.isArray(result))throw Error('Invalid saved views response');
        return result as {id:string;name:string;target_table:string;column_order?:string[]}[];
    }});
    const change=(updates:Partial<ComponentDataBinding>)=>{onChange(resetListSource(binding,updates));onSourceChange?.();};
    return <div className="space-y-4">
        <DataSourceSelector autoSelect={false} value={binding.dataSourceId} onValueChange={dataSourceId=>change({dataSourceId})}/>
        <TableSelector value={binding.tableName} dataSourceId={binding.dataSourceId} onValueChange={tableName=>change({tableName})}/>
        <label className="block text-sm">Saved view<select aria-label="Saved view" disabled={!binding.dataSourceId||views.isPending||!!views.error} className="mt-1 w-full rounded border bg-background p-2" value={binding.viewId??''} onChange={event=>{
            const view=views.data?.find(view=>view.id===event.target.value);
            if(event.target.value&&!view)return;
            change({tableName:view?.target_table??binding.tableName,viewId:view?.id,viewName:view?.name,columnOrder:view?.column_order??[]});
        }}><option value="">Use table directly</option>{binding.viewId&&!views.data?.some(view=>view.id===binding.viewId)&&<option value={binding.viewId}>{binding.viewName||'Unavailable saved view'}</option>}{views.data?.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
        {views.error&&<p role="alert" className="text-xs text-destructive">Saved views could not be loaded. <button type="button" className="underline" onClick={()=>views.refetch()}>Retry</button></p>}
        {binding.viewId&&views.isSuccess&&!views.data.some(view=>view.id===binding.viewId)&&<p role="alert" className="text-xs text-destructive">This saved view is unavailable. Choose another view or use the table directly.</p>}
        <a className="text-xs underline" href="/frontbase-admin/data-studio/datasources">Configure saved views in Data</a>
    </div>;
}
