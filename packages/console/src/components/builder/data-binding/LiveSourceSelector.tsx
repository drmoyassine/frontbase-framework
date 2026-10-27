import {DatasourceSchemaSelector,useDatasourceSchema} from '@/modules/dbsync/components/DatasourceSchemaSelector';
import {useQuery} from '@tanstack/react-query';
import {DataSourceSelector} from '@/components/data-binding/DataSourceSelector';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuSub,DropdownMenuSubTrigger,DropdownMenuSubContent,DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {ChevronDown,Check} from 'lucide-react';
import type {ComponentDataBinding} from '@/hooks/data/useSimpleData';

export function updateAuthoredBinding(binding:ComponentDataBinding, updates:Partial<ComponentDataBinding>):ComponentDataBinding {
    const {dataRequest,_resolvedHiddenFilters,_pendingHiddenFilters,...authored}=binding as ComponentDataBinding & {dataRequest?:unknown;_resolvedHiddenFilters?:unknown;_pendingHiddenFilters?:unknown};
    return JSON.parse(JSON.stringify({...authored,...updates}));
}

export function resetListSource(binding:ComponentDataBinding, updates:Partial<ComponentDataBinding>):ComponentDataBinding {
    return updateAuthoredBinding(binding, {
        source:undefined,sourceSchema:undefined,viewId:undefined,viewName:undefined,tableName:'',columnOverrides:{},columnOrder:[],
        searchColumns:undefined,frontendFilters:[],hiddenFilters:[],fieldMapping:undefined,
        chartConfig:binding.chartConfig?{aggregation:'count',maxRows:10}:undefined,
        filtering:{searchEnabled:false,filters:{}},sorting:{enabled:false},
        pagination:{...binding.pagination,page:0},...updates,
    });
}

export function LiveSourceSelector({binding,onChange,onSourceChange}:{binding:ComponentDataBinding;onChange:(binding:ComponentDataBinding)=>void;onSourceChange?:()=>void}) {
    const metadata=useDatasourceSchema(binding.dataSourceId);
    const selectedSchema=binding.sourceSchema??(metadata.data?.supported?metadata.data.defaultSchema:undefined);
    const views=useQuery({queryKey:['list-source-views',binding.dataSourceId],enabled:!!binding.dataSourceId,queryFn:async({signal})=>{
        const response=await fetch(`/api/sync/datasources/${encodeURIComponent(binding.dataSourceId)}/views/`,{credentials:'include',signal});
        if(!response.ok)throw Error('Saved views unavailable');
        const result=await response.json();
        if(!Array.isArray(result))throw Error('Invalid saved views response');
        return result as {id:string;name:string;target_table:string;source_schema?:string|null;column_order?:string[]}[];
    }});
    const tables=useQuery({queryKey:['datasource-tables',binding.dataSourceId,selectedSchema,'sync'],enabled:!!binding.dataSourceId,queryFn:async({signal})=>{
        const response=await fetch(`/api/sync/datasources/${encodeURIComponent(binding.dataSourceId)}/tables/${selectedSchema!==undefined?`?schema=${encodeURIComponent(selectedSchema)}`:''}`,{credentials:'include',signal});
        if(!response.ok)throw Error('Tables unavailable');
        const result:unknown=await response.json();
        if(!Array.isArray(result)||!result.every(item=>typeof item==='string'))throw Error('Invalid tables response');
        return result as string[];
    }});
    const change=(updates:Partial<ComponentDataBinding>)=>{onChange(resetListSource(binding,updates));onSourceChange?.();};
    const selectedView=views.data?.find(view=>view.id===binding.viewId);
    const label=binding.viewId?(selectedView?.name??binding.viewName??'Unavailable saved view'):(binding.tableName||'Choose a table or saved view');
    return <div className="space-y-4">
        <DataSourceSelector autoSelect={false} value={binding.dataSourceId} onValueChange={dataSourceId=>change({dataSourceId})}/>
        {selectedSchema!==undefined&&<DatasourceSchemaSelector datasourceId={binding.dataSourceId} value={selectedSchema} onChange={sourceSchema=>change({sourceSchema})}/>}
        <div className="space-y-2"><label className="block text-sm" htmlFor={`bind-${binding.componentId}`}>Bind</label>
        <DropdownMenu><DropdownMenuTrigger asChild><Button id={`bind-${binding.componentId}`} variant="outline" aria-label={`Bind: ${label}`} disabled={!binding.dataSourceId||metadata.isPending} className="w-full justify-between font-normal"><span className="truncate">{binding.viewId?'Saved View: ':binding.tableName?'Table: ':''}{label}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0"/></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
            <DropdownMenuSub><DropdownMenuSubTrigger disabled={tables.isPending||!!tables.error||!tables.data?.length}>Table</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-80 overflow-y-auto">{tables.data?.map(table=><DropdownMenuItem key={table} onSelect={()=>change({tableName:table,sourceSchema:selectedSchema})}><Check aria-hidden className={`mr-2 h-4 w-4 ${!binding.viewId&&binding.tableName===table?'':'opacity-0'}`}/>{table}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
            <DropdownMenuSub><DropdownMenuSubTrigger disabled={views.isPending||!!views.error||!views.data?.length}>Saved View</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-80 overflow-y-auto">{views.data?.map(view=><DropdownMenuItem key={view.id} onSelect={()=>change({sourceSchema:view.source_schema??metadata.data?.defaultSchema,tableName:view.target_table,viewId:view.id,viewName:view.name,columnOrder:view.column_order??[]})}><Check aria-hidden className={`mr-2 h-4 w-4 ${binding.viewId===view.id?'':'opacity-0'}`}/>{view.name}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
        </DropdownMenuContent></DropdownMenu></div>
        {tables.error&&<p role="alert" className="text-xs text-destructive">Tables could not be loaded. <button type="button" className="underline" onClick={()=>tables.refetch()}>Retry tables</button></p>}
        {views.error&&<p role="alert" className="text-xs text-destructive">Saved views could not be loaded. <button type="button" className="underline" onClick={()=>views.refetch()}>Retry saved views</button></p>}
        {binding.viewId&&views.isSuccess&&!selectedView&&<p role="alert" className="text-xs text-destructive">This saved view is unavailable. Choose another binding.</p>}
        {binding.viewId&&<details className="text-xs text-muted-foreground"><summary>Source details</summary><p className="break-all">{selectedView?.source_schema??selectedSchema??'default'}.{selectedView?.target_table??binding.tableName}</p></details>}
        <a className="text-xs underline" href={'/frontbase-admin/data-studio/saved-views'+(binding.viewId?'?view='+encodeURIComponent(binding.viewId):'')}>{binding.viewId?'Edit view':'Browse saved views'}</a>
    </div>;
}
