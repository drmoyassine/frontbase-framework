import {RecordFieldPicker} from '@/components/builder/data-binding/RecordFieldPicker';
import {DataTablePropertiesPanel} from '@/components/builder/data-table/DataTablePropertiesPanel';
import {LiveSourceSelector,updateAuthoredBinding} from '@/components/builder/data-binding/LiveSourceSelector';
/**
 * Grid Properties Panel
 * Configuration UI for the Grid component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CompactColumnConfigurator } from '@/components/builder/data-table/CompactColumnConfigurator';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';
import { DefaultSortColumnSelector } from '@/components/builder/data-table/DataTablePropertiesPanel';
import { useBindingColumns } from '@/hooks/data/useBindingColumns';
import { HiddenFiltersEditor } from '@/components/builder/data-binding/HiddenFiltersEditor';

interface GridPropertiesProps {
    activeTab: string;
    componentId: string;
    binding: ComponentDataBinding | null;
    onBindingUpdate: (binding: ComponentDataBinding) => void;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const GridProperties: React.FC<GridPropertiesProps> = ({
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

    const updateBinding = (updates: Partial<ComponentDataBinding>) => {
        onBindingUpdate(updateAuthoredBinding(effectiveBinding,updates));
    };

    const columns = useBindingColumns(effectiveBinding.tableName, effectiveBinding.dataSourceId, effectiveBinding.sourceSchema);

    if (activeTab === 'general') {
        return (
            <div className="space-y-4">
                <LiveSourceSelector binding={effectiveBinding} onChange={onBindingUpdate}/>
                <RecordFieldPicker binding={effectiveBinding} onChange={onBindingUpdate}/>

                {effectiveBinding.tableName && binding && (
                    <div className="space-y-4 pt-4 border-t">
                        {/* Grid Columns Layout Selector */}
                        <div className="space-y-2">
                            <Label htmlFor="grid-columns" className="font-semibold block text-sm">Grid Layout Columns</Label>
                            <Select
                                value={(props.columns || 3).toString()}
                                onValueChange={(value) => updateComponentProp('columns', parseInt(value))}
                            >
                                <SelectTrigger id="grid-columns">
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
                    </div>
                )}

                {!binding && (
                    <div className="pt-4 mt-4 border-t border-dashed text-center text-sm text-muted-foreground bg-muted/20 p-4 rounded-lg">
                        <p>Select a Data Source and Table above to configure grid data.</p>
                    </div>
                )}
            </div>
        );
    }

    if(activeTab==='options')return <DataTablePropertiesPanel activeTab={activeTab} componentId={componentId} binding={binding} onBindingUpdate={onBindingUpdate}/>;
    return null;
};
