import {useState,useEffect,useMemo,useRef} from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ComponentDataBinding } from '../types';
import { fetchLiveList,liveListIdentity,isBuilderCanvas,resolveBindingHiddenFilters,readBrowserFilterVariable,subscribeFilterVariables,type WireFilter } from '@frontbase/types';

interface UseGridQueryProps {
    mode: 'builder' | 'edge';
    binding: ComponentDataBinding;
    initialData?: any[];
    initialTotal?:number;
    enabled?: boolean;
}

async function fetchSnapshot(binding:ComponentDataBinding,hidden:WireFilter[],signal?:AbortSignal){
    const query={componentId:binding.componentId,versionId:binding._blockVersionId||'default',page:binding.pagination?.page??0,pageSize:binding.pagination?.pageSize||12,
        sortColumn:binding.sorting?.column||'title',direction:binding.sorting?.direction||'asc',filters:[...Object.entries(binding.filtering?.filters??{}).filter(([,value])=>value!==''&&value!==undefined).map(([column,value])=>({column,op:'eq',value})),...hidden]};
    const preview=isBuilderCanvas()||window.location.pathname==='/api/project/site-configuration/publication/render/';
    const response=preview?await fetch('/api/project/publication-list-preview/',{method:'POST',credentials:'include',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({binding,query})}):await fetch(window.location.href,{signal,headers:{'X-Frontbase-List':encodeURIComponent(JSON.stringify(query))}});
    if(!response.ok)throw Error('Snapshot query unavailable');
    const result=await response.json();return {rows:result.rows??[],total:typeof result.total==='number'?result.total:undefined};
}

export function useGridQuery({
    mode,
    binding,
    initialData,
    initialTotal,
    enabled = true,
}: UseGridQueryProps) {
    const [revision,setRevision]=useState(0);
    useEffect(()=>subscribeFilterVariables(()=>setRevision(v=>v+1)),[]);
    const hidden=useMemo(()=>resolveBindingHiddenFilters(binding,readBrowserFilterVariable),[binding,revision]);
    const identity = JSON.stringify([liveListIdentity(binding),binding.source,binding._blockVersionId,binding.sorting,binding.filtering,binding.columnOrder,binding.pagination,hidden]);
    const seed=useRef({identity,rows:initialData,total:initialTotal});
    const query = useQuery({
        queryKey: ['grid-data-v4', mode, identity],
        queryFn: async ({ signal }) => {
            if (!binding.tableName) return { rows: [], total: undefined };
            if(binding.source?.kind==='publication')return fetchSnapshot(binding,hidden,signal);
            return fetchLiveList(binding,{page:binding.pagination?.page??0,pageSize:binding.pagination?.enabled?binding.pagination.pageSize:100,sortColumn:binding.sorting?.column,sortDirection:binding.sorting?.direction,search:binding.filtering?.searchEnabled?String(binding.filtering?.filters?.search??''):'',hidden},mode==='builder'||isBuilderCanvas()?'builder':'edge',signal);
        },
        initialData: hidden.length || identity!==seed.current.identity || !initialData || initialData!==seed.current.rows ? undefined : { rows: initialData, total: initialTotal },
        enabled: enabled && !!binding.tableName,
        staleTime: 5 * 60 * 1000,
        refetchInterval: binding.refreshInterval && binding.refreshInterval > 0
            ? binding.refreshInterval * 1000
            : false,
    });
    return { ...query, data: query.data?.rows, totalCount: query.data?.total };
}
