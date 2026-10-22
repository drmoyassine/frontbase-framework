import {listMessage} from '@frontbase/types';
import {useFilterOptions} from '../../../../console/packages/datatable/src/hooks/useFilterOptions';
import {FilterBar} from '../../../../console/packages/datatable/src/components/FilterBar';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useGridQuery } from '@frontbase/grid';
import { RecordContextProvider } from './RecordContext';
import { NativeRecordNode } from './NativeRecordNode';

interface TemplateNode {
    id?: string;
    type: string;
    props?: Record<string, any>;
    children?: TemplateNode[];
}

export interface RepeaterProps {
    /** Baked at publish time (carries `dataRequest` for edge-mode fetching). */
    binding?: any;
    columns?: number;
    mobileColumns?:number;
    tabletColumns?:number;
    layout?: 'grid' | 'list';
    /** The user-designed template subtree (raw component defs from __PAGE_DATA__). */
    template?: TemplateNode[];
    /** Cap rendered rows on the published page. */
    maxRows?: number;
    gap?: number;
    controls?: { refresh?:boolean; count?: boolean; ordering?: boolean; search?: boolean; searchColumn?: string; searchLabel?: string; searchPlaceholder?: string; paginationPosition?: 'top'|'bottom'|'both'; paginationStyle?: 'previous-next'|'numbered'; filters?: {id:string;column:string;label:string;operator?:'eq'|'contains';type?:'text'|'number'}[] };
    loadingText?: string;
    emptyText?: string;
    errorText?: string;
    _blockVersionId?: string;
    initialRows?:any[];
    initialTotal?:number;
    _initialQuery?:{page?:number;search?:string;sortColumn?:string;direction?:string};
}

function gridLayoutClass(columns: number): string {
    const cols = Math.min(Math.max(columns || 3, 1), 4);
    if (cols === 1) return 'grid grid-cols-1 gap-4';
    if (cols === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-4';
    if (cols === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
}

/**
 * Published-page Repeater (edge client). Fetches rows and renders the
 * user-designed template once per row, each wrapped in a RecordContext so
 * `{{ record.* }}` resolves to the current row — matching the canvas preview.
 */
export function Repeater({
    binding,
    columns = 3,
    mobileColumns=1,
    tabletColumns=2,
    layout = 'grid',
    template = [],
    maxRows = 100,
    gap = 16,
    controls = {},
    loadingText = binding?._localeLabels?listMessage(binding,'loading'):'Loading records…',
    emptyText = binding?._localeLabels?listMessage(binding,'empty'):'No records matched.',
    errorText = binding?._localeLabels?listMessage(binding,'error'):'Data could not be loaded. Please try again.',
    _blockVersionId = 'default',
    initialRows,
    initialTotal,
    _initialQuery,
}: RepeaterProps) {
    const [page, setPage] = useState(_initialQuery?.page??0), [search, setSearch] = useState(_initialQuery?.search??'');
    const [sortColumn, setSortColumn] = useState(binding?.sorting?.column ?? '');
    const [direction, setDirection] = useState<'asc'|'desc'>(binding?.sorting?.direction ?? 'asc');
    const [filterValues, setFilterValues] = useState<Record<string, any>>({});
    const sourceKey = JSON.stringify([binding?.dataSourceId, binding?.tableName, binding?.viewId, binding?.dataRequest]);
    const previousSource=useRef(sourceKey);
    useEffect(() => { if(previousSource.current===sourceKey)return;previousSource.current=sourceKey;setPage(0); setSearch(''); setFilterValues({}); setSortColumn(binding?.sorting?.column ?? ''); setDirection(binding?.sorting?.direction ?? 'asc'); }, [sourceKey]);
    const fallbackBinding = {
        dataSourceId: '',
        tableName: '',
        pagination: { enabled: false, pageSize: 12, page: 0 },
        sorting: { enabled: false },
        filtering: { searchEnabled: false, filters: {} },
        columnOverrides: {},
    };

    const queryBinding = useMemo(() => {
        const interactive=[
            ...(search && controls.searchColumn ? [{ id:'repeater-search',column:controls.searchColumn,operator:'contains',value:search }] : []),
            ...(controls.filters ?? []).filter(filter => filter.column && filterValues[filter.id] !== undefined && filterValues[filter.id] !== '').map(filter => ({ id:filter.id,column:filter.column,operator:filter.operator ?? 'eq',value:filter.type === 'number' ? Number(filterValues[filter.id]) : filterValues[filter.id] }))];
        return { ...(binding || fallbackBinding),
        _blockVersionId,
        filtering:{...binding?.filtering,filters:{...binding?.filtering?.filters,...Object.fromEntries((binding?.frontendFilters??[]).map((filter:any)=>[filter.column,filterValues[filter.column]]))}},
        pagination: { ...binding?.pagination, page, pageSize: Math.min(100, Math.max(1, binding?.pagination?.pageSize || 12)) },
        sorting: { ...binding?.sorting, column: sortColumn, direction },
        hiddenFilters: [...binding?.hiddenFilters ?? [],...interactive],
        // SSR has already resolved static hidden predicates. Visitor-entered
        // controls are new literal predicates and must join that resolved set.
        ...(binding?._resolvedHiddenFilters!==undefined?{_resolvedHiddenFilters:[...binding._resolvedHiddenFilters,...interactive.map(filter=>({column:filter.column,op:filter.operator,value:filter.value}))]}:{})
    };}, [binding,page,search,sortColumn,direction,controls.searchColumn,controls.filters,filterValues,_blockVersionId]);
    const { data, isLoading, error, totalCount, refetch } = useGridQuery({
        mode: 'edge',
        binding: queryBinding,
        enabled: !!binding?.tableName,
        initialData: page===(_initialQuery?.page??0)&&search===(_initialQuery?.search??'')&&sortColumn===(_initialQuery?.sortColumn??binding?.sorting?.column??'')&&direction===(_initialQuery?.direction??binding?.sorting?.direction??'asc')?initialRows:undefined,
        initialTotal,
    });

    const {data:fetchedOptions={}}=useFilterOptions({mode:'edge',filters:binding?.frontendFilters??[],tableName:binding?.tableName,dataSourceId:binding?.dataSourceId,cascadingFilters:filterValues,searchQuery:search,enabled:!!binding?.tableName});
    if (!binding?.tableName) {
        return <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">Repeater — no data source configured.</div>;
    }

    const rows: any[] = data || [];
    const layoutClass = layout === 'list' ? 'flex flex-col' : 'fb-repeater-grid grid';
    const pageSize = queryBinding.pagination.pageSize;
    const hasNext = totalCount !== undefined ? (page + 1) * pageSize < totalCount : rows.length === pageSize;
    const pageCount = totalCount !== undefined ? Math.max(1, Math.ceil(totalCount / pageSize)) : undefined;
    const pagination = binding?.pagination?.enabled ? <nav aria-label={listMessage(binding,'pagination')} className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!page || isLoading} onClick={() => setPage(value => value - 1)}>{listMessage(binding,'previous')}</button>
        {controls.paginationStyle === 'numbered' && pageCount ? Array.from({length:Math.min(7,pageCount)},(_,i)=>Math.max(0,Math.min(page-3,pageCount-7))+i).map(number => <button type="button" key={number} aria-current={number === page ? 'page' : undefined} onClick={()=>setPage(number)}>{number+1}</button>) : <span>{listMessage(binding,pageCount?'pageOf':'page',{page:page+1,pages:pageCount??1})}</span>}
        <button type="button" disabled={!hasNext || isLoading} onClick={() => setPage(value => value + 1)}>{listMessage(binding,'next')}</button>
    </nav> : null;
    const position = controls.paginationPosition ?? 'bottom';

    return (
        <div className="fb-repeater space-y-4" style={{gridColumn:'1 / -1',minWidth:0,width:'100%'}} aria-busy={isLoading}>
            <div className="flex flex-wrap items-end gap-3">
                {controls.refresh&&<button type="button" disabled={isLoading} onClick={()=>refetch()}>{listMessage(binding,'refresh')}</button>}
                {(controls.search ?? binding?.filtering?.searchEnabled) && controls.searchColumn && <label className="flex flex-col gap-1 text-sm">{controls.searchLabel || (binding?._localeLabels?listMessage(binding,'search'):'Search')}<input type="search" className="rounded border bg-background p-2" placeholder={controls.searchPlaceholder || listMessage(binding,'searchPlaceholder')} value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}} /></label>}
                {controls.ordering && <><label className="flex flex-col gap-1 text-sm">{listMessage(binding,'order')}<select value={sortColumn} className="rounded border bg-background p-2" onChange={event=>{setSortColumn(event.target.value);setPage(0);}}><option value="">{listMessage(binding,'defaultOrder')}</option>{(binding?.source?.kind==='publication'?['title','id']:binding?.columnOrder || []).map((column:string)=><option key={column} value={column}>{binding?.columnOverrides?.[column]?.displayName || column}</option>)}</select></label><label className="flex flex-col gap-1 text-sm">{listMessage(binding,'direction')}<select className="rounded border bg-background p-2" value={direction} onChange={event=>{setDirection(event.target.value as 'asc'|'desc');setPage(0);}}><option value="asc">{listMessage(binding,'ascending')}</option><option value="desc">{listMessage(binding,'descending')}</option></select></label></>}
                {controls.filters?.map(filter=><label key={filter.id} className="flex flex-col gap-1 text-sm">{filter.label || filter.column}<input type={filter.type === 'number' ? 'number' : 'text'} value={filterValues[filter.id] ?? ''} className="rounded border bg-background p-2" onChange={event=>{setFilterValues(values=>({...values,[filter.id]:event.target.value}));setPage(0);}} /></label>)}
            </div>
            {!!binding?.frontendFilters?.length&&<FilterBar labels={binding?._localeLabels} filters={binding.frontendFilters} filterValues={filterValues} fetchedOptions={fetchedOptions} onFilterChange={(column,value)=>{setFilterValues(old=>({...old,[column]:value}));setPage(0);}} onClearAll={()=>{setFilterValues({});setPage(0);}}/>}
            {controls.count && <p role="status" className="text-sm">{totalCount !== undefined ? listMessage(binding,'count',{count:totalCount}) : listMessage(binding,'countOnPage',{count:rows.length})}</p>}
            {(position === 'top' || position === 'both') && pagination}
            <style>{'.fb-repeater-grid{grid-template-columns:repeat(var(--fb-list-mobile),minmax(0,1fr))}@media(min-width:768px){.fb-repeater-grid{grid-template-columns:repeat(var(--fb-list-tablet),minmax(0,1fr))}}@media(min-width:1024px){.fb-repeater-grid{grid-template-columns:repeat(var(--fb-list-desktop),minmax(0,1fr))}}'}</style>
            {error ? <div role="alert" className="rounded border p-6 text-sm">{errorText}</div> : isLoading ? <p role="status">{loadingText}</p> : !rows.length ? <p role="status">{emptyText}</p> : <div className={layoutClass} style={{gap:Math.max(0,Math.min(64,gap)),'--fb-list-mobile':Math.min(4,Math.max(1,mobileColumns)),'--fb-list-tablet':Math.min(4,Math.max(1,tabletColumns)),'--fb-list-desktop':Math.min(4,Math.max(1,columns))} as React.CSSProperties}>
            {rows.slice(0, maxRows).map((row, i) => (
                <RecordContextProvider key={row.id ?? i} value={row}>
                    {template.map((node, j) => (
                        <NativeRecordNode key={node.id || j} node={node as any} instance={i===0?'':String(row.id ?? i)} />
                    ))}
                </RecordContextProvider>
            ))}
            </div>}
            {(position === 'bottom' || position === 'both') && pagination}
        </div>
    );
}
