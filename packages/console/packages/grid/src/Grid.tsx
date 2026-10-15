import {liveListSortAvailable,liveListPageSize} from '@frontbase/types';
import {useFilterOptions} from '../../datatable/src/hooks/useFilterOptions';
import {FilterBar} from '../../datatable/src/components/FilterBar';
import {Pagination} from '../../datatable/src/components/Pagination';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { GridProps } from './types';
import { useGridQuery } from './hooks/useGridQuery';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function Grid({
    mode = 'builder',
    componentId,
    binding,
    className = '',
    style,
    columns = 3,
    initialData,
    initialTotal,
    onConfigureBinding,
    configureOverlay,
    cardWrapper,
}: GridProps) {
    // Cast to break cross-package csstype version incompatibility (see InfoList).
    const safeStyle = style as React.CSSProperties | undefined;
    const [page,setPage]=useState(binding?.pagination?.page??0);
    const [search,setSearch]=useState('');
    const [sortColumn,setSortColumn]=useState(binding?.sorting?.column??'');
    const [direction,setDirection]=useState<'asc'|'desc'>(binding?.sorting?.direction??'asc');
    const [filters,setFilters]=useState<Record<string,any>>({});
    const sourceKey=JSON.stringify([binding?.dataSourceId,binding?.tableName,binding?.viewId,binding?.dataRequest,binding?.sorting,binding?.pagination?.pageSize]);
    const previousSource=useRef(sourceKey);
    useEffect(()=>{if(previousSource.current===sourceKey)return;previousSource.current=sourceKey;setPage(0);setSearch('');setFilters({});setSortColumn(binding?.sorting?.column??'');setDirection(binding?.sorting?.direction??'asc');},[sourceKey]);
    const queryBinding=useMemo(()=>({...binding,componentId,dataSourceId:binding?.dataSourceId??'',tableName:binding?.tableName??'',columnOverrides:binding?.columnOverrides??{},pagination:{enabled:binding?.pagination?.enabled??true,pageSize:liveListPageSize(binding?.pagination?.pageSize,12),page},sorting:{...binding?.sorting,enabled:binding?.sorting?.enabled??false,column:sortColumn,direction},filtering:{...binding?.filtering,searchEnabled:binding?.filtering?.searchEnabled??false,filters:{...binding?.filtering?.filters,...filters,search}}}),[binding,componentId,page,sortColumn,direction,filters,search]);
    const {data,isLoading:loading,error,totalCount,refetch}=useGridQuery({mode,binding:queryBinding,initialData,initialTotal,enabled:!!binding?.tableName});
    const {data:fetchedOptions={}}=useFilterOptions({mode,filters:binding?.frontendFilters??[],tableName:binding?.tableName,dataSourceId:binding?.dataSourceId,cascadingFilters:filters,searchQuery:search,enabled:!!binding?.tableName});
    const sortingAvailable=!binding||liveListSortAvailable(binding,search);
    const position=binding?.presentation?.paginationPosition??'bottom';
    const pagination=binding?.pagination?.enabled?<Pagination currentPage={page} pageSize={queryBinding.pagination.pageSize} totalCount={totalCount} loadedCount={data?.length??0} showCount={binding?.presentation?.count!==false} loading={loading} onPageChange={setPage}/>:null;
    const renderShell=(content:React.ReactNode)=><div className="space-y-4" aria-busy={loading}>
        <div className="flex flex-wrap gap-3 items-end">
            {binding?.filtering?.searchEnabled&&<label className="text-sm">{binding?.presentation?.searchLabel||'Search records'}<input type="search" aria-label={binding?.presentation?.searchLabel||'Search records'} placeholder={binding?.presentation?.searchPlaceholder||'Search records'} className="block rounded border bg-background p-2" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}}/></label>}
            {binding?.sorting?.enabled&&<><label className="text-sm">Order by<select disabled={!sortingAvailable} aria-label="Order by" className="block rounded border bg-background p-2" value={sortColumn} onChange={event=>{setSortColumn(event.target.value);setPage(0);}}><option value="">Default</option>{(binding.columnOrder?.length?binding.columnOrder:Object.keys(data?.[0]??{})).map(column=><option key={column} value={column}>{binding.columnOverrides?.[column]?.displayName??column}</option>)}</select></label><label className="text-sm">Direction<select disabled={!sortingAvailable} aria-label="Direction" className="block rounded border bg-background p-2" value={direction} onChange={event=>{setDirection(event.target.value as 'asc'|'desc');setPage(0);}}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label></>}
            {binding?.presentation?.refresh!==false&&<button type="button" disabled={loading} onClick={()=>refetch()}>Refresh data</button>}
        </div>
        {!sortingAvailable&&<p role="status">This source uses its search result order. Clear search to choose sorting.</p>}
        {!!binding?.frontendFilters?.length&&<FilterBar filters={binding.frontendFilters} filterValues={filters} fetchedOptions={fetchedOptions} onFilterChange={(column,value)=>{setFilters(old=>({...old,[column]:value}));setPage(0);}} onClearAll={()=>{setFilters({});setPage(0);}}/>}
        {binding?.presentation?.count!==false&&!binding?.pagination?.enabled&&<p role="status">{totalCount===undefined?`${data?.length??0} records on this page`:`${totalCount} records`}</p>}
        {(position==='top'||position==='both')&&pagination}
        {content}
        {(position==='bottom'||position==='both')&&pagination}
    </div>;

    const cardClass = "rounded-lg border bg-card text-card-foreground shadow-sm";
    const headerClass = "pb-3 p-6";
    const titleClass = "text-base font-semibold leading-none tracking-tight";
    const contentClass = "p-6 pt-0";

    // Build grid layout columns class safely
    const gridLayoutClass = useMemo(() => {
        const cols = Math.min(columns || 3, 4);
        if (cols === 1) return 'grid grid-cols-1 gap-4';
        if (cols === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-4';
        if (cols === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
    }, [columns]);

    // 1. Unconfigured State
    if (!binding?.tableName) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center space-y-4">
                    <p className="text-muted-foreground text-sm">No data binding configured</p>
                    {configureOverlay as any}
                    {!configureOverlay && onConfigureBinding && (
                        <button
                            onClick={onConfigureBinding}
                            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                        >
                            Configure Data
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // 2. Loading State (Matches SSR renderDataGrid exactly)
    if (loading && !data) {
        if(binding.presentation?.loadingText)return renderShell(<p role="status">{binding.presentation.loadingText}</p>);
        return renderShell(
            <div className={cn(gridLayoutClass, className)} style={safeStyle}>
                {Array.from({ length: columns || 3 }).map((_, index) => (
                    <div key={index} className={cn(cardClass)}>
                        <div className={headerClass}>
                            <div className="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
                        </div>
                        <div className={contentClass}>
                            <div className="space-y-2">
                                <div className="h-3 bg-muted rounded w-1/2 animate-pulse"></div>
                                <div className="h-3 bg-muted rounded w-1/3 animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // 3. Error State
    if (error) {
        return renderShell(
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center space-y-4">
                    <p className="text-destructive text-sm font-medium">{binding?.presentation?.errorText||'Failed to load data. Check the binding and access configuration.'}</p>
                    <button
                        onClick={() => refetch()}
                        className="px-4 py-2 bg-destructive text-destructive-foreground text-sm font-medium rounded-md hover:bg-destructive/90 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return renderShell(
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center text-muted-foreground text-sm">
                    {binding?.presentation?.emptyText||'No data available'}
                </div>
            </div>
        );
    }

    // Helper functions for formatting and schema columns
    const formatValue = (value: any, columnName: string) => {
        if (value === null || value === undefined) return '';
        const columnConfig = binding?.columnOverrides?.[columnName];
        
        switch (columnConfig?.displayType) {
            case 'badge':
                return (
                    <div className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        value === 'active' || value === true || String(value).toLowerCase() === 'true'
                            ? "bg-blue-100 text-blue-800 border-blue-200" 
                            : "bg-gray-100 text-gray-800 border-gray-200"
                    )}>
                        {value.toString()}
                    </div>
                );
            case 'date':
                try {
                    return new Date(value).toLocaleDateString();
                } catch {
                    return String(value);
                }
            case 'currency':
                try {
                    return new Intl.NumberFormat('en-US', { 
                        style: 'currency', 
                        currency: 'USD' 
                    }).format(Number(value));
                } catch {
                    return String(value);
                }
            case 'percentage':
                try {
                    return `${(Number(value) * 100).toFixed(1)}%`;
                } catch {
                    return String(value);
                }
            case 'image':
                return (
                    <img
                        src={String(value)}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover border"
                    />
                );
            case 'cover':
                // Full-bleed card banner — rendered above the header, not in the
                // label/value list (excluded from secondary columns below).
                return (
                    <img
                        src={String(value)}
                        alt=""
                        className="w-full h-32 object-cover rounded-t-lg"
                    />
                );
            default:
                return value.toString();
        }
    };

    const getVisibleColumns = () => {
        if (!data[0]) return [];
        // Honor the panel column order; fall back to the row's key order.
        const allKeys = binding?.columnOrder?.length
            ? binding.columnOrder
            : Object.keys(data[0]);
        return allKeys.filter(col =>
            binding?.columnOverrides?.[col]?.visible !== false &&
            Object.prototype.hasOwnProperty.call(data[0], col)
        );
    };

    const getColumnDisplayName = (columnName: string) => {
        return binding?.columnOverrides?.[columnName]?.displayName ||
               columnName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const visibleColumns = getVisibleColumns();
    // A cover column renders as a full-bleed banner above the header and is
    // excluded from the primary/secondary label-value list.
    const coverColumn = visibleColumns.find(
        col => binding?.columnOverrides?.[col]?.displayType === 'cover'
    );
    const contentColumns = visibleColumns.filter(col => col !== coverColumn);
    const primaryColumn = contentColumns[0];
    const secondaryColumns = contentColumns.slice(1);

    return renderShell(
        <div className={cn(gridLayoutClass, className)} style={safeStyle}>
            {data.map((item: any, index: number) => {
                const cardContent = (
                    <div className={cn(cardClass, "hover:shadow-md transition-shadow h-full flex flex-col")}>
                        {coverColumn && item[coverColumn] != null && (
                            formatValue(item[coverColumn], coverColumn)
                        )}
                        <div className={headerClass}>
                            <h3 className={titleClass}>
                                {formatValue(item[primaryColumn], primaryColumn)}
                            </h3>
                        </div>
                        <div className={cn(contentClass, "flex-1")}>
                            <div className="space-y-2">
                                {secondaryColumns.map((column) => {
                                    const hideLabel = binding?.columnOverrides?.[column]?.showLabel === false;
                                    if (hideLabel) {
                                        return (
                                            <div key={column} className="text-sm">
                                                <span className="font-medium">
                                                    {formatValue(item[column], column)}
                                                </span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={column} className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">
                                                {getColumnDisplayName(column)}:
                                            </span>
                                            <span className="font-medium">
                                                {formatValue(item[column], column)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );

                // IoC: Let builder wrap individual cards if provided
                if (cardWrapper) {
                    return React.cloneElement(
                        cardWrapper(item, cardContent) as React.ReactElement,
                        { key: index }
                    );
                }

                return React.cloneElement(cardContent, { key: index });
            })}
        </div>
    );
}

export default Grid;
