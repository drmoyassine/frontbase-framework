import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { CompactColumnConfigurator } from './CompactColumnConfigurator';
import { FilterConfigurator } from './FilterConfigurator';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, X, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBindingColumns } from '@/hooks/data/useBindingColumns';
import { HiddenFiltersEditor } from '@/components/builder/data-binding/HiddenFiltersEditor';

interface DataTablePropertiesPanelProps {
    activeTab: string;
    componentId: string;
    binding: ComponentDataBinding | null;
    onBindingUpdate: (binding: ComponentDataBinding) => void;
}

// ============ SearchColumnSelector Component ============
interface SearchColumnSelectorProps {
    tableName: string;
    dataSourceId?: string;
    selectedColumns: string[];
    onColumnsChange: (columns: string[]) => void;
    columnOrder?: string[]; // To detect foreign columns
}

const SearchColumnSelector: React.FC<SearchColumnSelectorProps> = ({
    tableName,
    dataSourceId,
    selectedColumns,
    onColumnsChange,
    columnOrder = []
}) => {
    const { loadTableSchema, globalSchema } = useDataBindingStore();
    const [columns, setColumns] = useState<{ name: string; type: string; isRelated?: boolean }[]>([]);
    const [searchFilter, setSearchFilter] = useState('');
    const [open, setOpen] = useState(false);

    // Load columns for the table + foreign columns from columnOrder
    useEffect(() => {
        if (!tableName) return;

        const fetchColumns = async () => {
            const allColumns: { name: string; type: string; isRelated?: boolean }[] = [];

            // Use sync API for external datasources
            if (dataSourceId && dataSourceId !== 'backend') {
                try {
                    const response = await fetch(
                        `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema`
                    );
                    if (response.ok) {
                        const schemaData = await response.json();
                        (schemaData.columns || []).forEach((col: any) => {
                            allColumns.push({
                                name: col.column_name || col.name,
                                type: col.data_type || col.type || 'text',
                                isRelated: false
                            });
                        });
                    }
                } catch (error) {
                    console.error('[SearchColumnSelector] Failed to fetch schema:', error);
                }
            } else {
                // Use globalSchema for backend datasource
                const gTable = globalSchema.tables.find((t: any) => t.table_name === tableName);
                if (gTable && gTable.columns) {
                    gTable.columns.forEach((c: any) => {
                        allColumns.push({ name: c.column_name, type: c.data_type, isRelated: false });
                    });
                }
            }

            // Add foreign columns from columnOrder (format: "table.column")
            columnOrder.forEach(col => {
                if (col.includes('.')) {
                    const [relTable, relCol] = col.split('.');
                    const relTableSchema = globalSchema.tables.find((t: any) => t.table_name === relTable);
                    let colType = 'text';
                    if (relTableSchema?.columns) {
                        const foundCol = relTableSchema.columns.find((c: any) => c.column_name === relCol);
                        if (foundCol) colType = foundCol.data_type;
                    }
                    if (!allColumns.some(c => c.name === col)) {
                        allColumns.push({ name: col, type: colType, isRelated: true });
                    }
                }
            });

            setColumns(allColumns);
        };

        fetchColumns();
    }, [tableName, dataSourceId, globalSchema, columnOrder]);

    const toggleColumn = (columnName: string) => {
        if (selectedColumns.includes(columnName)) {
            onColumnsChange(selectedColumns.filter(c => c !== columnName));
        } else {
            onColumnsChange([...selectedColumns, columnName]);
        }
    };

    const filteredColumns = columns.filter(c =>
        c.name.toLowerCase().includes(searchFilter.toLowerCase())
    );

    // Group columns: Text (base), Other (base), Related
    const baseTextColumns = filteredColumns.filter(c =>
        !c.isRelated && ['text', 'character varying', 'varchar', 'char'].includes(c.type)
    );

    const baseOtherColumns = filteredColumns.filter(c =>
        !c.isRelated && !['text', 'character varying', 'varchar', 'char'].includes(c.type)
    );

    const relatedColumns = filteredColumns.filter(c => c.isRelated);

    return (
        <div className="space-y-2 pt-2">
            <Label className="text-sm text-muted-foreground">
                Searchable Columns (leave empty for all text columns)
            </Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-full justify-between h-auto min-h-9 px-3 py-2"
                    >
                        <div className="flex flex-wrap gap-1 items-center">
                            {selectedColumns.length === 0 ? (
                                <span className="text-muted-foreground">All text columns</span>
                            ) : (
                                selectedColumns.map(col => (
                                    <Badge key={col} variant="secondary" className="text-xs">
                                        {col}
                                        <X
                                            className="w-3 h-3 ml-1 cursor-pointer hover:text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleColumn(col);
                                            }}
                                        />
                                    </Badge>
                                ))
                            )}
                        </div>
                        <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                    <div className="p-2 border-b">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search columns..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                className="pl-8 h-8"
                            />
                        </div>
                    </div>
                    <ScrollArea className="h-[200px]">
                        <div className="p-2 space-y-1">
                            {baseTextColumns.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                                        Text Columns
                                    </div>
                                    {baseTextColumns.map(col => (
                                        <label
                                            key={col.name}
                                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={selectedColumns.includes(col.name)}
                                                onCheckedChange={() => toggleColumn(col.name)}
                                            />
                                            <span className="text-sm">{col.name}</span>
                                            <Badge variant="outline" className="text-[10px] ml-auto">
                                                {col.type}
                                            </Badge>
                                        </label>
                                    ))}
                                </>
                            )}
                            {baseOtherColumns.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-2">
                                        Other Columns
                                    </div>
                                    {baseOtherColumns.map(col => (
                                        <label
                                            key={col.name}
                                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={selectedColumns.includes(col.name)}
                                                onCheckedChange={() => toggleColumn(col.name)}
                                            />
                                            <span className="text-sm">{col.name}</span>
                                            <Badge variant="outline" className="text-[10px] ml-auto">
                                                {col.type}
                                            </Badge>
                                        </label>
                                    ))}
                                </>
                            )}
                            {relatedColumns.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-purple-600 px-2 py-1 mt-2">
                                        Related Columns
                                    </div>
                                    {relatedColumns.map(col => (
                                        <label
                                            key={col.name}
                                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={selectedColumns.includes(col.name)}
                                                onCheckedChange={() => toggleColumn(col.name)}
                                            />
                                            <span className="text-sm">{col.name}</span>
                                            <Badge variant="outline" className="text-[10px] ml-auto bg-purple-50 text-purple-700 border-purple-200">
                                                {col.type}
                                            </Badge>
                                        </label>
                                    ))}
                                </>
                            )}
                            {filteredColumns.length === 0 && (
                                <div className="text-center py-4 text-muted-foreground text-sm">
                                    No columns found
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    {selectedColumns.length > 0 && (
                        <div className="p-2 border-t">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs"
                                onClick={() => onColumnsChange([])}
                            >
                                Clear selection
                            </Button>
                        </div>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
};

// ============ DefaultSortColumnSelector Component ============
export interface DefaultSortColumnSelectorProps {
    tableName: string;
    dataSourceId?: string;
    columnOrder?: string[];
    value: string;
    onValueChange: (column: string) => void;
}

export const DefaultSortColumnSelector: React.FC<DefaultSortColumnSelectorProps> = ({
    tableName,
    dataSourceId,
    columnOrder = [],
    value,
    onValueChange
}) => {
    const { globalSchema } = useDataBindingStore();
    const [columns, setColumns] = useState<{ name: string; type: string; isRelated?: boolean }[]>([]);
    const [searchFilter, setSearchFilter] = useState('');
    const [open, setOpen] = useState(false);

    // Load columns for the table + related columns from columnOrder
    useEffect(() => {
        if (!tableName) return;

        const fetchColumns = async () => {
            const allColumns: { name: string; type: string; isRelated?: boolean }[] = [];

            // Use sync API for external datasources
            if (dataSourceId && dataSourceId !== 'backend') {
                try {
                    const response = await fetch(
                        `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema`
                    );
                    if (response.ok) {
                        const schemaData = await response.json();
                        (schemaData.columns || []).forEach((col: any) => {
                            allColumns.push({
                                name: col.column_name || col.name,
                                type: col.data_type || col.type || 'text',
                                isRelated: false
                            });
                        });
                    }
                } catch (error) {
                    console.error('[DefaultSortColumnSelector] Failed to fetch schema:', error);
                }
            } else {
                // Use globalSchema for backend datasource
                const gTable = globalSchema.tables.find((t: any) => t.table_name === tableName);
                if (gTable && gTable.columns) {
                    gTable.columns.forEach((c: any) => {
                        allColumns.push({ name: c.column_name, type: c.data_type, isRelated: false });
                    });
                }
            }

            // Add related columns from columnOrder (format: "table.column")
            columnOrder.forEach(col => {
                if (col.includes('.')) {
                    const [relTable, relCol] = col.split('.');
                    const relTableSchema = globalSchema.tables.find((t: any) => t.table_name === relTable);
                    let colType = 'text';
                    if (relTableSchema?.columns) {
                        const foundCol = relTableSchema.columns.find((c: any) => c.column_name === relCol);
                        if (foundCol) colType = foundCol.data_type;
                    }
                    if (!allColumns.some(c => c.name === col)) {
                        allColumns.push({ name: col, type: colType, isRelated: true });
                    }
                }
            });

            setColumns(allColumns);
        };

        fetchColumns();
    }, [tableName, dataSourceId, globalSchema, columnOrder]);

    const filteredColumns = columns.filter(c =>
        c.name.toLowerCase().includes(searchFilter.toLowerCase())
    );

    const selectedColumn = columns.find(c => c.name === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-between h-auto min-h-9 px-3 py-2"
                >
                    <div className="flex items-center gap-2 truncate">
                        {value ? (
                            <>
                                <span className="truncate">{value}</span>
                                {selectedColumn?.isRelated && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-purple-50 text-purple-700 border-purple-200">
                                        Related
                                    </Badge>
                                )}
                            </>
                        ) : (
                            <span className="text-muted-foreground">Select a column...</span>
                        )}
                    </div>
                    <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search columns..."
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            className="pl-8 h-8"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[200px]">
                    <div className="p-1">
                        {filteredColumns.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                                No columns found
                            </div>
                        ) : (
                            filteredColumns.map((col) => (
                                <div
                                    key={col.name}
                                    className={`flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer ${value === col.name ? 'bg-muted' : ''}`}
                                    onClick={() => {
                                        onValueChange(col.name);
                                        setOpen(false);
                                        setSearchFilter('');
                                    }}
                                >
                                    <span className="text-sm truncate flex-1">{col.name}</span>
                                    {col.isRelated && (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-purple-50 text-purple-700 border-purple-200">
                                            Related
                                        </Badge>
                                    )}
                                    <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                                        {col.type}
                                    </Badge>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};

export const DataTablePropertiesPanel: React.FC<DataTablePropertiesPanelProps> = ({
    activeTab,
    componentId,
    binding,
    onBindingUpdate
}) => {

    const defaultBinding: ComponentDataBinding = {
        componentId: componentId,
        dataSourceId: '',
        tableName: '',
        columnOverrides: {},
        columnOrder: [],
        filtering: { searchEnabled: false, filters: {} },
        pagination: { enabled: true, pageSize: 20, page: 0 },
        sorting: { enabled: true },
        refreshInterval: 0
    };

    const effectiveBinding = binding || defaultBinding;

    const updateBinding = (updates: Partial<ComponentDataBinding>) => {
        onBindingUpdate({ ...effectiveBinding, ...updates });
    };

    const columns = useBindingColumns(effectiveBinding.tableName, effectiveBinding.dataSourceId);

    if (activeTab === 'general') {
        return (
            <div className="space-y-4">
                <div>
                    <DataSourceSelector
                        value={effectiveBinding.dataSourceId}
                        onValueChange={(value) => updateBinding({ dataSourceId: value })}
                    />
                </div>

                <div>
                    <TableSelector
                        value={effectiveBinding.tableName}
                        onValueChange={(value) => {
                            // When table changes, reset all schema-dependent fields
                            updateBinding({
                                tableName: value,
                                columnOverrides: {},       // Clear column display settings
                                columnOrder: [],           // Clear column order
                                searchColumns: undefined,  // Clear search column selection
                                frontendFilters: [],       // Clear configured filters
                                sorting: { enabled: true, column: undefined, direction: 'asc' }, // Reset sort
                            });
                        }}
                        dataSourceId={effectiveBinding.dataSourceId}
                    />
                </div>

                {effectiveBinding.tableName && binding && (
                    <div className="pt-4 border-t">
                        <Label className="text-base font-semibold mb-3 block">Columns</Label>
                        <CompactColumnConfigurator
                            tableName={effectiveBinding.tableName}
                            dataSourceId={effectiveBinding.dataSourceId}
                            columnOverrides={effectiveBinding.columnOverrides || {}}
                            columnOrder={effectiveBinding.columnOrder}
                            onColumnOverridesChange={(overrides) => updateBinding({ columnOverrides: overrides })}
                            onColumnOrderChange={(order) => updateBinding({ columnOrder: order })}
                        />
                    </div>
                )}

                {!binding && (
                    <div className="pt-4 mt-4 border-t border-dashed text-center text-sm text-muted-foreground bg-muted/20 p-4 rounded-lg">
                        <p>Select a Data Source and Table above to configure columns and other properties.</p>
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
                        {/* Pagination - FIRST */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="pagination-enabled" className="font-medium">Pagination</Label>
                                <Switch
                                    id="pagination-enabled"
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
                                    <Label htmlFor="page-size" className="text-sm">Rows per page</Label>
                                    <Input
                                        id="page-size"
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={binding.pagination?.pageSize || 20}
                                        onChange={(e) =>
                                            updateBinding({
                                                pagination: {
                                                    ...binding.pagination!,
                                                    pageSize: parseInt(e.target.value) || 20
                                                }
                                            })
                                        }
                                    />
                                </div>
                            )}
                        </div>

                        {/* Default Sort - SECOND */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="default-sort-enabled" className="font-medium">Default Sort</Label>
                                <Switch
                                    id="default-sort-enabled"
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
                                        <DefaultSortColumnSelector
                                            tableName={binding.tableName}
                                            dataSourceId={binding.dataSourceId}
                                            columnOrder={binding.columnOrder}
                                            value={binding.sorting?.column || ''}
                                            onValueChange={(column) =>
                                                updateBinding({
                                                    sorting: { ...binding.sorting!, column }
                                                })
                                            }
                                        />
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

                        {/* Search - THIRD */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="search-enabled" className="font-medium">Search</Label>
                                <Switch
                                    id="search-enabled"
                                    checked={binding.filtering?.searchEnabled || false}
                                    onCheckedChange={(checked) =>
                                        updateBinding({
                                            filtering: { ...binding.filtering!, searchEnabled: checked }
                                        })
                                    }
                                />
                            </div>
                            {binding.filtering?.searchEnabled && (
                                <SearchColumnSelector
                                    tableName={binding.tableName}
                                    dataSourceId={binding.dataSourceId}
                                    selectedColumns={binding.searchColumns || []}
                                    onColumnsChange={(columns) => updateBinding({ searchColumns: columns.length > 0 ? columns : undefined })}
                                    columnOrder={binding.columnOrder}
                                />
                            )}
                        </div>

                        {/* Filters - FOURTH */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="filters-enabled" className="font-medium">Filters</Label>
                                <Switch
                                    id="filters-enabled"
                                    checked={(binding.frontendFilters && binding.frontendFilters.length > 0) || (binding.filtering as any)?.filtersEnabled || false}
                                    onCheckedChange={(checked) => {
                                        updateBinding({
                                            filtering: { ...binding.filtering!, filtersEnabled: checked } as any,
                                            // Clear filters if disabled
                                            frontendFilters: checked ? (binding.frontendFilters || []) : []
                                        });
                                    }}
                                />
                            </div>
                            {((binding.frontendFilters && binding.frontendFilters.length > 0) || (binding.filtering as any)?.filtersEnabled) && (
                                <FilterConfigurator
                                    tableName={binding.tableName}
                                    dataSourceId={binding.dataSourceId}
                                    filters={binding.frontendFilters || []}
                                    onFiltersChange={(filters) => updateBinding({ frontendFilters: filters })}
                                    columnOrder={binding.columnOrder}
                                />
                            )}
                        </div>

                        {/* Hidden Filters */}
                        <HiddenFiltersEditor
                            tableName={binding.tableName}
                            dataSourceId={binding.dataSourceId}
                            columns={columns}
                            value={binding.hiddenFilters || []}
                            onChange={(hiddenFilters) => updateBinding({ hiddenFilters })}
                        />

                        {/* Refresh Interval */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <Label htmlFor="refresh-interval" className="font-medium">Refresh Interval</Label>
                            <Select
                                value={binding.refreshInterval?.toString() || '-1'}
                                onValueChange={(value) => updateBinding({ refreshInterval: parseInt(value) })}
                            >
                                <SelectTrigger id="refresh-interval">
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
