import {useState,useEffect,useMemo} from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ComponentDataBinding } from '../types';
import { isBuilderCanvas,resolveBindingHiddenFilters,readBrowserFilterVariable,subscribeFilterVariables,type WireFilter } from '@frontbase/types';

interface UseGridQueryProps {
    mode: 'builder' | 'edge';
    binding: ComponentDataBinding;
    initialData?: any[];
    initialTotal?:number;
    enabled?: boolean;
}

function resolveEnvVars(template: string): string {
    if (typeof window === 'undefined') {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return (process.env as Record<string, string>)[key] || '';
        });
    } else {
        return template;
    }
}

async function fetchSnapshot(binding:ComponentDataBinding,hidden:WireFilter[],signal?:AbortSignal){
    const query={componentId:binding.componentId,versionId:binding._blockVersionId||'default',page:binding.pagination?.page??0,pageSize:binding.pagination?.pageSize||12,
        sortColumn:binding.sorting?.column||'title',direction:binding.sorting?.direction||'asc',filters:[...Object.entries(binding.filtering?.filters??{}).filter(([,value])=>value!==''&&value!==undefined).map(([column,value])=>({column,op:'eq',value})),...hidden]};
    const preview=isBuilderCanvas()||window.location.pathname==='/api/project/site-configuration/publication/render/';
    const response=preview?await fetch('/api/project/publication-list-preview/',{method:'POST',credentials:'include',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({binding,query})}):await fetch(window.location.href,{signal,headers:{'X-Frontbase-List':encodeURIComponent(JSON.stringify(query))}});
    if(!response.ok)throw Error('Snapshot query unavailable');
    const result=await response.json();return {rows:result.rows??[],total:typeof result.total==='number'?result.total:undefined};
}

async function fetchFromBuilder(binding: ComponentDataBinding, hidden:WireFilter[], signal?: AbortSignal) {
    const params = new URLSearchParams();
    const limit = binding.pagination?.enabled ? binding.pagination.pageSize : 50;
    params.append('limit', String(limit));
    params.append('offset', String(Math.max(0, binding.pagination?.page ?? 0) * limit));

    if (binding.sorting?.column) {
        params.append('sort', binding.sorting.column);
        params.append('order', binding.sorting.direction || 'asc');
    }

    if (binding.filtering?.filters) {
        const filterList = Object.entries(binding.filtering.filters)
            .filter(([_, v]) => v != null && v !== '')
            .map(([field, value]) => ({
                field,
                operator: '==',
                value: typeof value === 'object' && 'value' in value ? (value as any).value : value,
            }));
        if (filterList.length > 0) {
            params.append('filters', JSON.stringify(filterList));
        }
    }

    if(hidden.length)params.set('filters',JSON.stringify([...JSON.parse(params.get('filters')||'[]'),...hidden]));
    // Build select param for related columns keyed as "table.column" in columnOrder.
    // Format: "*,programs(degree_name,type)" — triggers LEFT JOIN in the backend.
    if (binding.columnOrder && binding.columnOrder.length > 0) {
        const relatedMap = new Map<string, string[]>();
        binding.columnOrder.forEach((col: string) => {
            if (col.includes('.')) {
                const [table, column] = col.split('.');
                if (!relatedMap.has(table)) relatedMap.set(table, []);
                relatedMap.get(table)!.push(column);
            }
        });
        if (relatedMap.size > 0) {
            const selectParts = ['*'];
            relatedMap.forEach((cols, table) => selectParts.push(`${table}(${cols.join(',')})`));
            params.append('select', selectParts.join(','));
        }
    }

    const response = await fetch(
        `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/data/?${params}`, { signal }
    );

    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }

    const result = await response.json();
    return { rows: result.records || [], total: typeof result.total === 'number' ? result.total : typeof result.count === 'number' ? result.count : undefined };
}

async function fetchFromEdge(binding: ComponentDataBinding, hidden:WireFilter[], signal?: AbortSignal) {
    const dataRequest = binding.dataRequest ?? (binding.viewId?{fetchStrategy:'proxy',datasourceId:binding.dataSourceId,queryConfig:{tableName:binding.tableName,columns:'*',joins:[]}}:undefined);
    if (!dataRequest) {
        // Builder canvas fallback — see chart/useChartQuery.ts for the gate's
        // provenance and invariants (evaluated per call, never cached). The
        // Repeater mounts this hook edge-mode even in canvas contexts, so this
        // bail is its live-data path.
        return isBuilderCanvas() ? fetchFromBuilder(binding,hidden,signal) : { rows: [], total: undefined };
    }

    const queryConfig = dataRequest.queryConfig;
    const strategy = dataRequest.fetchStrategy || 'proxy';
    const limit = binding.pagination?.enabled ? binding.pagination.pageSize : 50;

    const queryBody: Record<string, any> = {
        table_name: queryConfig?.tableName || binding.tableName,
        columns: queryConfig?.columns || '*',
        joins: queryConfig?.joins || [],
        page: Math.max(0, binding.pagination?.page ?? 0) + 1,
        page_size: limit,
        filters: [...Object.entries(binding.filtering?.filters||{}).filter(([,v])=>v!=null&&v!=='').map(([column,value])=>({column,op:'eq',value:typeof value==='object'&&value&&'value' in value?(value as any).value:value})),...hidden],
    };

    if (binding.sorting?.column) {
        queryBody.sort_col = binding.sorting.column;
        queryBody.sort_dir = binding.sorting.direction || 'asc';
    }

    if (strategy === 'direct') {
        const url = resolveEnvVars(dataRequest.url);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(dataRequest.headers || {})) {
            headers[key] = resolveEnvVars(value as string);
        }

        const response = await fetch(url, {
            signal,
            method: 'POST',
            headers,
            body: JSON.stringify(queryBody),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data (HTTP ${response.status})`);
        }

        const result = await response.json();
        return { rows: result.rows || result.data || [], total: typeof result.total === 'number' ? result.total : undefined };
    } else {
        const datasourceId = dataRequest.datasourceId || binding.dataSourceId;
        const response = await fetch('/api/data/execute', {
            signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataRequest: {
                    fetchStrategy: 'proxy',
                    datasourceId,
                    viewId:binding.viewId,
                    method: 'POST',
                    queryConfig: dataRequest.queryConfig || {},
                    body: queryBody,
                    resultPath: dataRequest.resultPath || 'rows',
                    flattenRelations: dataRequest.flattenRelations ?? false,
                },
            }),
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch data');
        }
        return { rows: result.data?.rows || result.data || [], total: typeof result.data?.total === 'number' ? result.data.total : typeof result.total === 'number' ? result.total : undefined };
    }
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
    const query = useQuery({
        queryKey: ['grid-data-v3', mode, binding.dataSourceId, binding.tableName, binding.viewId, binding.source, binding._blockVersionId, binding.sorting, binding.filtering, binding.columnOrder, binding.pagination, hidden],
        queryFn: async ({ signal }) => {
            if (!binding.tableName) return { rows: [], total: undefined };
            if(binding.source?.kind==='publication')return fetchSnapshot(binding,hidden,signal);
            if(binding.viewId)return fetchFromEdge(binding,hidden,signal);
            if (mode === 'builder') {
                return fetchFromBuilder(binding,hidden,signal);
            } else {
                return fetchFromEdge(binding,hidden,signal);
            }
        },
        initialData: hidden.length || !initialData ? undefined : { rows: initialData, total: initialTotal },
        enabled: enabled && !!binding.tableName,
        staleTime: 5 * 60 * 1000,
        refetchInterval: binding.refreshInterval && binding.refreshInterval > 0
            ? binding.refreshInterval * 1000
            : false,
    });
    return { ...query, data: query.data?.rows, totalCount: query.data?.total };
}
