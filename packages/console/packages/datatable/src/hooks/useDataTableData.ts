import {useState,useEffect,useMemo,useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {DataTableBinding} from '../types';
import {fetchLiveList,liveListIdentity,isBuilderCanvas,resolveBindingHiddenFilters,readBrowserFilterVariable,subscribeFilterVariables} from '@frontbase/types';

interface UseDataTableDataOptions {
    mode: 'builder' | 'edge';
    binding?: DataTableBinding | null;
    page: number;
    pageSize: number;
    sortColumn?: string | null;
    sortDirection?: 'asc' | 'desc';
    filters?: Record<string, any>;
    searchQuery?: string;
    initialData?: any[];
    initialTotal?:number;
    enabled?: boolean;
}

/**
 * React Query hook for DataTable data fetching
 * Works in both builder and edge modes
 */
export function useDataTableData({
    mode,
    binding,
    page,
    pageSize,
    sortColumn,
    sortDirection,
    filters,
    searchQuery,
    initialData,
    initialTotal,
    enabled = true,
}: UseDataTableDataOptions) {
    const [storeVersion, setStoreVersion] = useState(0);

    useEffect(()=>subscribeFilterVariables(()=>setStoreVersion(v=>v+1)),[]);
    const resolvedHiddenFilters=useMemo(()=>binding?resolveBindingHiddenFilters(binding,readBrowserFilterVariable):[],[binding,storeVersion]);

    const identity=JSON.stringify([binding&&liveListIdentity(binding),binding?._blockVersionId,page,pageSize,sortColumn,sortDirection,filters,searchQuery,resolvedHiddenFilters]);
    const seed=useRef({identity,rows:initialData});
    return useQuery({
        queryKey:['datatable-live-v2',mode,identity],
        queryFn:async({signal})=>{
            if(!binding)return {data:[],total:0};
            const result=await fetchLiveList(binding,{page,pageSize,sortColumn,sortDirection,filters,search:searchQuery,hidden:resolvedHiddenFilters},mode==='builder'||isBuilderCanvas()?'builder':'edge',signal);
            return {data:result.rows,total:result.total};
        },
        initialData:initialData&&initialData===seed.current.rows&&identity===seed.current.identity&&!resolvedHiddenFilters.length?{data:initialData,total:initialTotal}:undefined,
        enabled: enabled && !!binding?.tableName,
        staleTime: 60_000, // 1 minute
        refetchInterval: binding?.refreshInterval && binding.refreshInterval > 0
            ? binding.refreshInterval * 1000
            : false,
    });
}
