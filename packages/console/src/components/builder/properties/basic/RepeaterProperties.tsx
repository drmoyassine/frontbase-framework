/**
 * Repeater Properties Panel
 * Configuration UI for the Repeater component.
 *
 * Mirrors GridProperties' Data/Options tabs, but replaces the column-layout
 * section with Display Mode / Columns / Gap — the Repeater's card template is
 * designed freely on the canvas (drop components into the Repeater), not via a
 * column configurator.
 */

import React, { useState } from 'react';
import {useQuery} from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { DefaultSortColumnSelector } from '@/components/builder/data-table/DataTablePropertiesPanel';
import { useBindingColumns } from '@/hooks/data/useBindingColumns';
import { HiddenFiltersEditor } from '@/components/builder/data-binding/HiddenFiltersEditor';
import {RepeaterFieldMappings} from '@/components/builder/data-binding/RepeaterFieldMappings';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';

interface RepeaterPropertiesProps {
    canEditProperty?: (key:string)=>boolean;
    activeTab: string;
    componentId: string;
    binding: ComponentDataBinding | null;
    onBindingUpdate: (binding: ComponentDataBinding) => void;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const RepeaterProperties: React.FC<RepeaterPropertiesProps> = ({
    canEditProperty=()=>true,
    activeTab,
    componentId,
    binding,
    onBindingUpdate,
    props,
    updateComponentProp
}) => {
    const defaultBinding: ComponentDataBinding = {
        componentId: componentId,
        dataSourceId: '',
        tableName: '',
        columnOverrides: {},
        columnOrder: [],
        filtering: { searchEnabled: false, filters: {} },
        pagination: { enabled: true, pageSize: 12, page: 0 },
        sorting: { enabled: false },
        refreshInterval: -1
    };

    const effectiveBinding = binding || defaultBinding;
    const [sourceError,setSourceError]=useState('');

    const updateBinding = (updates: Partial<ComponentDataBinding>) => {
        const {dataRequest,_resolvedHiddenFilters,_pendingHiddenFilters,...authored}=effectiveBinding;
        onBindingUpdate(JSON.parse(JSON.stringify({ ...authored, ...updates })));
    };

    const columns = useBindingColumns(effectiveBinding.tableName, effectiveBinding.dataSourceId);
    const queryColumns=effectiveBinding.source?.kind==='publication'?columns.filter(column=>['title','id','parentId'].includes(column.name)):columns;
    const savedViews=useQuery({queryKey:['list-source-views',effectiveBinding.dataSourceId],enabled:!!effectiveBinding.dataSourceId&&effectiveBinding.source?.kind!=='publication',queryFn:async()=>{
        const response=await fetch(`/api/sync/datasources/${encodeURIComponent(effectiveBinding.dataSourceId)}/views/`,{credentials:'include'});if(!response.ok)throw Error('Saved views unavailable');return response.json() as Promise<{id:string;name:string;target_table:string;column_order?:string[]}[]>;
    }});
    const controls = props.controls ?? {};
    const updateControls = (patch: Record<string, unknown>) => updateComponentProp('controls', { ...controls, ...patch });

    if (activeTab === 'general') {
        return (
            <div className="space-y-4">
                <label className="block text-sm">Data mode<select aria-label="Data mode" className="mt-1 w-full rounded border bg-background p-2" value={effectiveBinding.source?.kind==='publication'?'snapshot':'live'} onChange={async event=>{
                    setSourceError('');
                    if(event.target.value==='live'){const {source,...rest}=effectiveBinding;onBindingUpdate({...rest,dataSourceId:'',tableName:'',hiddenFilters:[],columnOrder:[]});return;}
                    try{const response=await fetch('/api/project/site-configuration/publication/state/',{credentials:'include'});if(!response.ok)throw Error();const result=await response.json();if(!/^[a-f0-9]{64}$/.test(result.pointer?.hash))throw Error();onBindingUpdate({...defaultBinding,dataSourceId:'frontbase:publication',tableName:'institutions',source:{kind:'publication',hash:result.pointer.hash},columnOrder:['title','id','parentId','summary','cover','logo','originalPath']});}
                    catch{setSourceError('A reviewed published snapshot is required. Existing binding is retained.');}
                }}><option value="live">Live data</option><option value="snapshot">Published snapshot</option></select></label>
                {sourceError&&<p role="alert" className="text-xs text-destructive">{sourceError}</p>}
                {effectiveBinding.source?.kind==='publication'?<>
                    <label className="block text-sm">Data source<input aria-label="Data source" className="mt-1 w-full rounded border bg-background p-2" readOnly value="Reviewed publication snapshot" /></label>
                    <label className="block text-sm">Table / collection<select aria-label="Table / collection" className="mt-1 w-full rounded border bg-background p-2" value={effectiveBinding.tableName} onChange={event=>updateBinding({tableName:event.target.value,hiddenFilters:[],sorting:{enabled:true,column:'title',direction:'asc'}})}>{['institutions','programs','articles'].map(table=><option key={table}>{table}</option>)}</select></label>
                    <p className="break-all text-xs text-muted-foreground">Pinned snapshot: {effectiveBinding.source.hash}. Search/filter/sort capabilities are limited to its published index.</p>
                </>:<>
                <div>
                    <DataSourceSelector
                        autoSelect={false}
                        value={effectiveBinding.dataSourceId}
                        onValueChange={(value) => { updateBinding({ dataSourceId: value, tableName: '', viewId:undefined,viewName:undefined,columnOrder: [], columnOverrides: {}, hiddenFilters: [], sorting: {enabled:false}, filtering:{searchEnabled:false,filters:{}} }); updateComponentProp('controls', {}); }}
                    />
                </div>
                <div>
                    <TableSelector
                        value={effectiveBinding.tableName}
                        onValueChange={(value) => {
                            updateBinding({
                                tableName: value,
                                columnOverrides: {},
                                columnOrder: [],
                                sorting: { enabled: false, column: undefined, direction: 'asc' },
                                hiddenFilters: [],
                                filtering: { searchEnabled: false, filters: {} },
                                viewId:undefined,viewName:undefined,
                            });
                        }}
                        dataSourceId={effectiveBinding.dataSourceId}
                    />
                </div>
                <label className="block text-sm">Saved view<select aria-label="Saved view" className="mt-1 w-full rounded border bg-background p-2" value={effectiveBinding.viewId??''} onChange={event=>{
                    const view=savedViews.data?.find(view=>view.id===event.target.value);
                    updateBinding({viewId:view?.id,viewName:view?.name,...(view?{tableName:view.target_table,columnOrder:view.column_order??[],hiddenFilters:[],sorting:{enabled:false},filtering:{searchEnabled:false,filters:{}}}:{})});
                }}><option value="">Use table directly</option>{savedViews.data?.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
                {savedViews.error&&<p role="alert" className="text-xs text-destructive">Saved views could not be loaded.</p>}
                <a className="text-xs underline" href="/frontbase-admin/data-studio/datasources">Configure saved views in Data</a>
                </>}

                {/* Template hint */}
                <div className="pt-4 border-t">
                    <div className="text-xs text-muted-foreground bg-muted/20 rounded-md border border-dashed p-3">
                        Design the repeated template by dropping components directly into the Repeater on the canvas. Use <code className="font-mono">{'{{ record.field }}'}</code> in any text to bind to the current row.
                    </div>
                </div>

                {/* Layout: Display Mode / Columns / Gap */}
                <RepeaterFieldMappings componentId={componentId} columns={columns}/>
                <div className="space-y-4 pt-4 border-t">
                    <div className="space-y-2">
                        <Label htmlFor="repeater-layout" className="font-semibold block text-sm">Display Mode</Label>
                        <Select
                            disabled={!canEditProperty('layout')}
                            value={props.layout || 'grid'}
                            onValueChange={(value: 'grid' | 'list') => updateComponentProp('layout', value)}
                        >
                            <SelectTrigger id="repeater-layout">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="grid">Grid</SelectItem>
                                <SelectItem value="list">List</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {(props.layout || 'grid') === 'grid' && (
                        <div className="space-y-2">
                            <Label htmlFor="repeater-columns" className="font-semibold block text-sm">Columns</Label>
                            <Select
                                disabled={!canEditProperty('columns')}
                                value={(props.columns || 3).toString()}
                                onValueChange={(value) => updateComponentProp('columns', parseInt(value))}
                            >
                                <SelectTrigger id="repeater-columns">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 Column</SelectItem>
                                    <SelectItem value="2">2 Columns</SelectItem>
                                    <SelectItem value="3">3 Columns</SelectItem>
                                    <SelectItem value="4">4 Columns</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="repeater-gap" className="font-semibold block text-sm">Gap (px)</Label>
                        <Input
                            disabled={!canEditProperty('gap')}
                            id="repeater-gap"
                            type="number"
                            min={0}
                            max={64}
                            value={props.gap ?? 16}
                            onChange={(e) => updateComponentProp('gap', Math.min(64,Math.max(0,Number(e.target.value))))}
                        />
                    </div>
                    {(['mobileColumns','tabletColumns'] as const).map(key=><label key={key} className="block text-sm">{key==='mobileColumns'?'Mobile columns':'Tablet columns'}<select disabled={!canEditProperty(key)} aria-label={key==='mobileColumns'?'Mobile columns':'Tablet columns'} className="mt-1 w-full rounded border bg-background p-2" value={props[key]??(key==='mobileColumns'?1:2)} onChange={event=>updateComponentProp(key,Number(event.target.value))}>{[1,2,3,4].map(value=><option key={value}>{value}</option>)}</select></label>)}
                </div>

                {!binding && (
                    <div className="pt-4 mt-4 border-t border-dashed text-center text-sm text-muted-foreground bg-muted/20 p-4 rounded-lg">
                        <p>Select a Data Source and Table above to configure the repeater.</p>
                    </div>
                )}
            </div>
        );
    }

    if (activeTab === 'options') {
        return (
            <div className="space-y-4">
                {binding ? (
                    <div className="space-y-6">
                        <fieldset disabled={!canEditProperty('controls')} className="space-y-3 rounded border p-4" aria-label="Visitor controls">
                            <Label className="font-medium">Visitor controls</Label>
                            {(['count','ordering','search'] as const).map(key=><label key={key} className="flex items-center justify-between text-sm">{{count:'Record count',ordering:'Visitor ordering',search:'Search'}[key]}<input type="checkbox" aria-label={{count:'Record count',ordering:'Visitor ordering',search:'Search'}[key]} checked={!!controls[key]} onChange={event=>{updateControls({[key]:event.target.checked});if(key==='ordering'&&event.target.checked&&!binding.columnOrder?.length)updateBinding({columnOrder:columns.map(column=>column.name)});}} /></label>)}
                            {controls.search && <>
                                <label className="block text-sm">Search column<select aria-label="Search column" className="mt-1 w-full rounded border bg-background p-2" value={controls.searchColumn || ''} onChange={event=>updateControls({searchColumn:event.target.value})}><option value="">Select a column</option>{queryColumns.filter(column=>effectiveBinding.source?.kind!=='publication'||column.name==='title').map(column=><option key={column.name}>{column.name}</option>)}</select></label>
                                <label className="block text-sm">Search label<Input value={controls.searchLabel ?? 'Search'} onChange={event=>updateControls({searchLabel:event.target.value})} /></label>
                                <label className="block text-sm">Search placeholder<Input value={controls.searchPlaceholder ?? 'Search records'} onChange={event=>updateControls({searchPlaceholder:event.target.value})} /></label>
                            </>}
                            <label className="block text-sm">Pagination position<select aria-label="Pagination position" className="mt-1 w-full rounded border bg-background p-2" value={controls.paginationPosition || 'bottom'} onChange={event=>updateControls({paginationPosition:event.target.value})}><option value="top">Above records</option><option value="bottom">Below records</option><option value="both">Both</option></select></label>
                            <label className="block text-sm">Pagination style<select aria-label="Pagination style" className="mt-1 w-full rounded border bg-background p-2" value={controls.paginationStyle || 'previous-next'} onChange={event=>updateControls({paginationStyle:event.target.value})}><option value="previous-next">Previous / Next</option><option value="numbered">Numbered</option></select></label>
                        </fieldset>
                        <fieldset disabled={!canEditProperty('controls')} className="space-y-3 rounded border p-4" aria-label="Visible filters">
                            <Label className="font-medium">Visible filters</Label>
                            {(controls.filters ?? []).map((filter:any,index:number)=>{
                                const change=(patch:Record<string,unknown>)=>updateControls({filters:controls.filters.map((value:any,i:number)=>i===index?{...value,...patch}:value)});
                                return <div key={filter.id} className="space-y-2 border-t pt-2">
                                    <label className="block text-sm">Column<select className="w-full rounded border bg-background p-2" value={filter.column} onChange={event=>change({column:event.target.value})}><option value="">Select a column</option>{queryColumns.map(column=><option key={column.name}>{column.name}</option>)}</select></label>
                                    <Input aria-label="Filter label" placeholder="Filter label" value={filter.label} onChange={event=>change({label:event.target.value})} />
                                    <select aria-label="Filter operator" className="w-full rounded border bg-background p-2" value={filter.operator} onChange={event=>change({operator:event.target.value})}><option value="eq">Equals</option><option value="contains">Contains</option></select>
                                    <select aria-label="Filter value type" className="w-full rounded border bg-background p-2" value={filter.type} onChange={event=>change({type:event.target.value})}><option value="text">Text</option><option value="number">Number</option></select>
                                    <button type="button" className="text-xs" onClick={()=>updateControls({filters:controls.filters.filter((_:unknown,i:number)=>i!==index)})}>Remove filter</button>
                                </div>;
                            })}
                            <button type="button" className="text-sm" onClick={()=>updateControls({filters:[...controls.filters ?? [],{id:crypto.randomUUID(),column:'',label:'',operator:'eq',type:'text'}]})}>Add visible filter</button>
                        </fieldset>
                        <section className="space-y-3 rounded border p-4" aria-label="Record states">
                            {(['loadingText','emptyText','errorText'] as const).map(key=><label key={key} className="block text-sm">{{loadingText:'Loading message',emptyText:'Empty message',errorText:'Error message'}[key]}<Input disabled={!canEditProperty(key)} value={props[key] ?? {loadingText:'Loading records…',emptyText:'No records matched.',errorText:'Data could not be loaded. Please try again.'}[key]} onChange={event=>updateComponentProp(key,event.target.value)} /></label>)}
                        </section>
                        {/* Pagination */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="repeater-pagination-enabled" className="font-medium">Pagination</Label>
                                <Switch
                                    id="repeater-pagination-enabled"
                                    checked={binding.pagination?.enabled || false}
                                    onCheckedChange={(checked) =>
                                        updateBinding({
                                            pagination: { ...binding.pagination!, enabled: checked }
                                        })
                                    }
                                />
                            </div>
                            {binding.pagination?.enabled && (
                                <div className="space-y-2 pt-2">
                                    <Label htmlFor="repeater-page-size" className="text-sm">Items per page</Label>
                                    <Input
                                        id="repeater-page-size"
                                        type="number"
                                        min={1}
                                        max={binding.source?.kind==='publication'?48:100}
                                        value={binding.pagination?.pageSize || 12}
                                        onChange={(e) =>
                                            updateBinding({
                                                pagination: {
                                                    ...binding.pagination!,
                                                    pageSize: Math.min(binding.source?.kind==='publication'?48:100,Math.max(1,Number(e.target.value)||12))
                                                }
                                            })
                                        }
                                    />
                                </div>
                            )}
                        </div>

                        {/* Sorting */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="repeater-sort-enabled" className="font-medium">Default Sort</Label>
                                <Switch
                                    id="repeater-sort-enabled"
                                    checked={binding.sorting?.enabled || false}
                                    onCheckedChange={(checked) =>
                                        updateBinding({
                                            sorting: { ...binding.sorting!, enabled: checked }
                                        })
                                    }
                                />
                            </div>
                            {binding.sorting?.enabled && (
                                <div className="space-y-3 pt-2">
                                    <div className="space-y-2">
                                        <Label className="text-sm">Sort Column</Label>
                                        {effectiveBinding.source?.kind==='publication'?<select aria-label="Sort column" className="w-full rounded border bg-background p-2" value={binding.sorting?.column||'title'} onChange={event=>updateBinding({sorting:{...binding.sorting,column:event.target.value}})}><option value="title">Title</option><option value="id">ID</option></select>:<DefaultSortColumnSelector
                                            tableName={binding.tableName}
                                            dataSourceId={binding.dataSourceId}
                                            columnOrder={binding.columnOrder}
                                            value={binding.sorting?.column || ''}
                                            onValueChange={(column) =>
                                                updateBinding({
                                                    sorting: { ...binding.sorting!, column }
                                                })
                                            }
                                        />}
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm">Sort Direction</Label>
                                        <Select
                                            value={binding.sorting?.direction || 'asc'}
                                            onValueChange={(direction: 'asc' | 'desc') =>
                                                updateBinding({
                                                    sorting: { ...binding.sorting!, direction }
                                                })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="asc">Ascending (A → Z, 1 → 9)</SelectItem>
                                                <SelectItem value="desc">Descending (Z → A, 9 → 1)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Hidden Filters */}
                        <HiddenFiltersEditor
                            tableName={binding.tableName}
                            dataSourceId={binding.dataSourceId}
                            columns={queryColumns}
                            value={binding.hiddenFilters || []}
                            onChange={(hiddenFilters) => updateBinding({ hiddenFilters })}
                        />

                        {/* Refresh Interval */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <Label htmlFor="repeater-refresh" className="font-medium">Refresh Interval</Label>
                            <Select
                                value={effectiveBinding.refreshInterval?.toString() || '-1'}
                                onValueChange={(value) => updateBinding({ refreshInterval: parseInt(value) })}
                            >
                                <SelectTrigger id="repeater-refresh">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="-1">Manual</SelectItem>
                                    <SelectItem value="5">Every 5 seconds</SelectItem>
                                    <SelectItem value="30">Every 30 seconds</SelectItem>
                                    <SelectItem value="60">Every minute</SelectItem>
                                    <SelectItem value="300">Every 5 minutes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground bg-muted/20 border border-dashed rounded-lg">
                        Configure data binding first to enable options.
                    </div>
                )}
            </div>
        );
    }

    return null;
};
