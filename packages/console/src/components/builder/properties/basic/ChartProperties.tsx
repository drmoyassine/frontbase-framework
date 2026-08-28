/**
 * Chart Properties Panel
 * Configuration UI for the Chart component
 */

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { DefaultSortColumnSelector } from '@/components/builder/data-table/DataTablePropertiesPanel';
import { useBindingColumns } from '@/hooks/data/useBindingColumns';
import { ColumnSelect } from '@/components/builder/data-binding/ColumnSelect';
import { HiddenFiltersEditor } from '@/components/builder/data-binding/HiddenFiltersEditor';

interface ChartPropertiesProps {
    activeTab: string;
    componentId: string;
    binding: ComponentDataBinding | null;
    onBindingUpdate: (binding: ComponentDataBinding) => void;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}


/** Label with an inline help tooltip, matching the screenshot's "?" affordance. */
const FieldLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
    <div className="flex items-center gap-1.5">
        <Label className="text-sm">{children}</Label>
        {hint && (
            <TooltipProvider delayDuration={200}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">{hint}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )}
    </div>
);


export const ChartProperties: React.FC<ChartPropertiesProps> = ({
    activeTab,
    componentId,
    binding,
    onBindingUpdate,
    props,
    updateComponentProp
}) => {
    const { globalSchema } = useDataBindingStore();
    const effectiveBinding = binding || {
        componentId: componentId,
        dataSourceId: '',
        tableName: '',
        columnOverrides: {},
        columnOrder: [],
        filtering: { searchEnabled: false, filters: {} },
        pagination: { enabled: false, pageSize: 10, page: 0 },
        sorting: { enabled: false },
        refreshInterval: -1,
        chartConfig: {
            aggregation: 'count',
            maxRows: 10
        }
    };
    const columns = useBindingColumns(effectiveBinding.tableName, effectiveBinding.dataSourceId);


    const chartType = props.chartType || 'bar';

    const updateBinding = (updates: Partial<ComponentDataBinding>) => {
        onBindingUpdate({ ...effectiveBinding, ...updates });
    };

    const updateChartConfig = (updates: Partial<NonNullable<ComponentDataBinding['chartConfig']>>) => {
        onBindingUpdate({
            ...effectiveBinding,
            chartConfig: {
                ...(effectiveBinding.chartConfig || { aggregation: 'count', maxRows: 10 }),
                ...updates
            }
        });
    };


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
                                chartConfig: {
                                    aggregation: 'count',
                                    maxRows: 10
                                }
                            });
                        }}
                        dataSourceId={effectiveBinding.dataSourceId}
                    />
                </div>

                {effectiveBinding.tableName && binding && (
                    <div className="space-y-4 pt-4 border-t">
                        {/* Chart Style */}
                        <div className="space-y-1.5">
                            <FieldLabel>Chart Style</FieldLabel>
                            <Select
                                value={chartType}
                                onValueChange={(value) => updateComponentProp('chartType', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="bar">Bar</SelectItem>
                                    <SelectItem value="line">Line</SelectItem>
                                    <SelectItem value="pie">Pie</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Variant (bar charts only) */}
                        {chartType === 'bar' && (
                            <div className="space-y-1.5">
                                <FieldLabel>Variant</FieldLabel>
                                <Select
                                    value={effectiveBinding.chartConfig?.variant || 'vertical'}
                                    onValueChange={(value: 'vertical' | 'horizontal') =>
                                        updateChartConfig({ variant: value })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="vertical">Vertical</SelectItem>
                                        <SelectItem value="horizontal">Horizontal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Category */}
                        <div className="space-y-1.5">
                            <FieldLabel hint="Column to group by — becomes the X-axis labels / pie slices.">
                                Category
                            </FieldLabel>
                            <ColumnSelect
                                value={effectiveBinding.chartConfig?.category || ''}
                                columns={columns}
                                placeholder="Select Column"
                                onChange={(value) => updateChartConfig({ category: value })}
                            />
                        </div>

                        {/* Aggregation */}
                        <div className="space-y-1.5">
                            <FieldLabel hint="How to summarise each category. Count tallies rows; the rest summarise the Value column.">
                                Aggregation
                            </FieldLabel>
                            <Select
                                value={effectiveBinding.chartConfig?.aggregation || 'count'}
                                onValueChange={(value: 'count' | 'sum' | 'average' | 'min' | 'max') =>
                                    updateChartConfig({ aggregation: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="count">Count</SelectItem>
                                    <SelectItem value="sum">Sum</SelectItem>
                                    <SelectItem value="average">Average</SelectItem>
                                    <SelectItem value="min">Min</SelectItem>
                                    <SelectItem value="max">Max</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Value — only when the aggregation needs a column */}
                        {(effectiveBinding.chartConfig?.aggregation || 'count') !== 'count' && (
                            <div className="space-y-1.5">
                                <FieldLabel hint="The numeric column to aggregate.">Value</FieldLabel>
                                <ColumnSelect
                                    value={effectiveBinding.chartConfig?.value || ''}
                                    columns={columns}
                                    placeholder="Select Column"
                                    onChange={(value) => updateChartConfig({ value })}
                                />
                            </div>
                        )}

                        {/* Sort */}
                        <div className="space-y-1.5">
                            <FieldLabel hint="Order categories by their aggregated value.">
                                Sort
                            </FieldLabel>
                            <Select
                                value={effectiveBinding.chartConfig?.sort || 'none'}
                                onValueChange={(value: 'none' | 'asc' | 'desc') =>
                                    updateChartConfig({ sort: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No sort</SelectItem>
                                    <SelectItem value="desc">Descending (high → low)</SelectItem>
                                    <SelectItem value="asc">Ascending (low → high)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {!binding && (
                    <div className="pt-4 mt-4 border-t border-dashed text-center text-sm text-muted-foreground bg-muted/20 p-4 rounded-lg">
                        <p>Select a Data Source and Table above to configure chart data.</p>
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
                        {/* Display */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <Label className="font-semibold block">Display</Label>
                            <div className="space-y-2">
                                <Label htmlFor="max-rows" className="text-sm">Max Rows</Label>
                                <Input
                                    id="max-rows"
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={effectiveBinding.chartConfig?.maxRows ?? 10}
                                    onChange={(e) => updateChartConfig({ maxRows: parseInt(e.target.value) || 10 })}
                                />
                            </div>
                        </div>

                        {/* Sorting */}
                        <div className="space-y-3 p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="chart-sort-enabled" className="font-medium">Default Sort</Label>
                                <Switch
                                    id="chart-sort-enabled"
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
