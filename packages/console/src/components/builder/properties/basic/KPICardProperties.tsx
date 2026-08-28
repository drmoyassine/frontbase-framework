/**
 * KPICard Properties Panel
 * Configuration UI for the KPICard component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { CompactColumnConfigurator } from '@/components/builder/data-table/CompactColumnConfigurator';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';
import { DefaultSortColumnSelector } from '@/components/builder/data-table/DataTablePropertiesPanel';
import { useBindingColumns } from '@/hooks/data/useBindingColumns';
import { HiddenFiltersEditor } from '@/components/builder/data-binding/HiddenFiltersEditor';

interface KPICardPropertiesProps {
    activeTab: string;
    componentId: string;
    binding: ComponentDataBinding | null;
    onBindingUpdate: (binding: ComponentDataBinding) => void;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const KPICardProperties: React.FC<KPICardPropertiesProps> = ({
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
        pagination: { enabled: false, pageSize: 1, page: 0 },
        sorting: { enabled: false },
        refreshInterval: -1
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
                            updateBinding({
                                tableName: value,
                                columnOverrides: {},
                                columnOrder: [],
                                sorting: { enabled: false, column: undefined, direction: 'asc' },
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
                        <p>Select a Data Source and Table above to configure KPI card data.</p>
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
                        {/* Sorting */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="kpi-sort-enabled" className="font-medium">Default Sort</Label>
                                <Switch
                                    id="kpi-sort-enabled"
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
                                value={effectiveBinding.refreshInterval?.toString() || '-1'}
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
