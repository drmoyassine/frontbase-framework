import {listComponentLabels,formatLocalePattern} from '@frontbase/edge-core/localization';
import type { WireFilter } from './index';

export interface LiveListPresentation {
    count?:boolean;
    refresh?:boolean;
    searchLabel?:string;
    searchPlaceholder?:string;
    loadingText?:string;
    emptyText?:string;
    errorText?:string;
    paginationPosition?:'top'|'bottom'|'both';
}

/** Browser list transport shared by Tables, Grids and Repeaters. Authorization stays server-side. */
export interface LiveListBinding {
    /** Server-projected localized page path; never a datasource URL or credential. */
    _localePath?: string;
    _localeLabels?:Record<string,string>;
    componentId?: string;
    _blockVersionId?: string;
    dataSourceId?: string;
    tableName?: string;
    sourceSchema?: string;
    viewId?: string;
    columnOrder?: string[];
    searchColumns?: string[];
    filtering?: { filters?: Record<string, unknown> };
    frontendFilters?: { column: string; filterType: string }[];
    dataRequest?: any;
}

export interface LiveListQuery {
    page: number;
    pageSize: number;
    sortColumn?: string | null;
    sortDirection?: 'asc' | 'desc';
    search?: string;
    filters?: Record<string, unknown>;
    hidden?: WireFilter[];
}

export function liveListPageSize(value?:number,fallback=20) {
    return Math.min(100,Math.max(1,Math.trunc(Number.isFinite(value)?value!:fallback)||fallback));
}

export function liveListIdentity(binding: LiveListBinding) {
    return [binding._localePath,binding.dataSourceId, binding.sourceSchema, binding.tableName, binding.viewId, binding.dataRequest, binding.searchColumns, binding.frontendFilters, binding.filtering?.filters];
}

export function liveListSortAvailable(binding:LiveListBinding,search?:string) {
    return !(search&&binding.dataRequest?.fetchStrategy==='direct'&&!binding.viewId);
}

export function liveListBody(binding: LiveListBinding, query: LiveListQuery) {
    const config = binding.dataRequest?.queryConfig;
    const values = { ...binding.filtering?.filters, ...query.filters };
    const filters = Object.entries(values).filter(([column, value]) => column !== 'search' && value !== '' && value !== undefined && value !== null && !(Array.isArray(value) && !value.length)).flatMap(([column, raw]):WireFilter[] => {
        const value = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'value' in raw ? (raw as {value:unknown}).value : raw;
        const filterType = binding.frontendFilters?.find(filter => filter.column === column)?.filterType;
        if (filterType === 'dateRange') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Choose a valid date range.');
            const range=value as {from?:string;to?:string};
            return [...range.from?[{column,op:'gte',value:range.from}]:[], ...range.to?[{column,op:'lte',value:range.to}]:[]];
        }
        return [{column,op:filterType==='text'?'contains':filterType==='multiselect'?'in':'eq',value}];
    });
    const relatedFields=binding.columnOrder?.filter(column=>column.includes('.'))??[];
    return {
        ...(relatedFields.length?{related_fields:relatedFields}:{}),
        table_name: binding.tableName || config?.tableName,
        columns: relatedFields.length?'*':config?.columns || '*', joins: relatedFields.length?[]:config?.joins || [],
        page: Math.max(0, Math.trunc(query.page) || 0) + 1,
        page_size: liveListPageSize(query.pageSize),
        filters: [...filters, ...query.hidden ?? []],
        search_query: query.search || '', search_cols: binding.searchColumns || config?.searchColumns || [],
        sort_col: query.sortColumn || null, sort_dir: query.sortDirection || 'asc',
    };
}

export async function fetchLiveList(binding: LiveListBinding, query: LiveListQuery, mode: 'builder'|'edge', signal?: AbortSignal): Promise<{rows:any[];total:number|undefined}> {
    const datasourceId=binding.dataSourceId||binding.dataRequest?.datasourceId;
    if (!binding.tableName || !datasourceId) throw Error('Select a data source and table or saved view.');
    const body = liveListBody(binding, query);
    let response: Response;
    let proxy = false;
    // Saved views always pass through their owner-scoped server resolver, including on canvas.
    if(mode==='edge'&&binding._localePath){
        const path=binding._localePath;
        if(!path.startsWith('/')||path.startsWith('//')||/[\\?#]/.test(path)||!binding.componentId)throw Error('Invalid localized list path.');
        const filters=body.filters;
        const query={componentId:binding.componentId,versionId:binding._blockVersionId||'default',page:body.page-1,pageSize:body.page_size,sortColumn:body.sort_col||'title',direction:body.sort_dir,search:body.search_query,filters};
        response=await fetch(path+window.location.search,{signal,credentials:'include',headers:{'X-Frontbase-List':encodeURIComponent(JSON.stringify(query))}});
    } else if (mode === 'builder' && !binding.viewId && !body.related_fields?.length) {
        const params = new URLSearchParams({limit:String(body.page_size),offset:String((body.page-1)*body.page_size),filters:JSON.stringify(body.filters)});
        if (binding.sourceSchema) params.set('schema',binding.sourceSchema);
        if (body.sort_col) { params.set('sort', body.sort_col); params.set('order', body.sort_dir); }
        if (body.search_query) params.set('search', body.search_query);
        if (body.search_cols.length) params.set('search_cols', JSON.stringify(body.search_cols));
        const related = new Map<string,string[]>();
        for (const column of binding.columnOrder || []) if (column.includes('.')) {
            const [table, name] = column.split('.');
            related.set(table, [...related.get(table) || [], name]);
        }
        if (related.size) params.set('select', ['*', ...[...related].map(([table,names])=>`${table}(${names.join(',')})`)].join(','));
        response = await fetch(`/api/sync/datasources/${encodeURIComponent(datasourceId)}/tables/${encodeURIComponent(binding.tableName)}/data/?${params}`, {signal, credentials:'include'});
    } else if (binding.dataRequest?.fetchStrategy === 'direct' && !binding.viewId && !binding.sourceSchema && !body.related_fields?.length) {
        const request = binding.dataRequest;
        const url = (request.url || '').replace('frontbase_get_rows', body.search_query ? 'frontbase_search_rows' : 'frontbase_get_rows');
        // These legacy RPCs have different signatures. The search RPC does not accept sort arguments.
        const {search_query,search_cols,sort_col,sort_dir,...common}=body;
        const rpcBody=search_query?{...common,search_query,search_cols}:{...common,sort_col,sort_dir};
        response = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json', ...request.headers}, body:JSON.stringify(rpcBody), signal});
    } else {
        proxy = true;
        response = await fetch('/api/data/execute', {method:'POST', credentials:'include', signal, headers:{'Content-Type':'application/json'},body:JSON.stringify({dataRequest:{
            fetchStrategy:'proxy', datasourceId, sourceSchema:binding.sourceSchema, viewId:binding.viewId, method:'POST',
            queryConfig:{...binding.dataRequest?.queryConfig, tableName:binding.tableName}, body,
            resultPath:binding.dataRequest?.resultPath || 'rows', flattenRelations:binding.dataRequest?.flattenRelations ?? false,
        }})});
    }
    if (!response.ok) throw Error(`Live data request failed (HTTP ${response.status}).`);
    const result = await response.json();
    if (proxy && result.success !== true) throw Error('Live data request was refused. Check the binding and access configuration.');
    const payload = proxy ? result.data : result;
    const rows = Array.isArray(payload) ? payload : payload?.rows ?? payload?.records ?? payload?.data;
    if (!Array.isArray(rows)) throw Error('Live data returned an unsupported response.');
    const total = payload?.total ?? payload?.count ?? result.total;
    return {rows, total:typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : undefined};
}

export function listMessage(binding:{_localeLabels?:Record<string,string>}|null|undefined,key:keyof typeof listComponentLabels,values:Readonly<Record<string,string|number>>={}){return formatLocalePattern(binding?._localeLabels?.[key]??listComponentLabels[key],values);}
