import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Pencil } from 'lucide-react';

interface ColumnSettingsPopoverProps {
    columnName: string;
    columnConfig: any;
    onColumnOverrideChange: (columnName: string, updates: any) => void;
    isBuilderMode: boolean;
    isHeader?: boolean;
    children: React.ReactNode;
}

export const ColumnSettingsPopover: React.FC<ColumnSettingsPopoverProps> = ({
    columnName,
    columnConfig = {},
    onColumnOverrideChange,
    isBuilderMode,
    isHeader = false,
    children
}) => {
    if (!isBuilderMode || !onColumnOverrideChange) {
        return <>{children}</>;
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <div
                    className={cn(
                        "cursor-pointer hover:bg-primary/5 transition-colors -m-2 p-2 rounded",
                        isHeader && "flex items-center gap-1"
                    )}
                    title="Click to configure column"
                >
                    {children}
                    {isHeader && <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />}
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Column Settings</h4>
                        <p className="text-sm text-muted-foreground">
                            Configure how {columnName} appears in the table.
                        </p>
                    </div>
                    <div className="grid gap-3">
                        <div className="grid grid-cols-3 items-center gap-4">
                            <Label>Label</Label>
                            <Input
                                value={columnConfig.displayName || ''}
                                onChange={(e) => onColumnOverrideChange(columnName, { displayName: e.target.value })}
                                placeholder={columnName}
                                className="col-span-2 h-8"
                            />
                        </div>
                        <div className="grid grid-cols-3 items-center gap-4">
                            <Label>Type</Label>
                            <Select
                                value={columnConfig.displayType || 'text'}
                                onValueChange={(displayType) => onColumnOverrideChange(columnName, { displayType })}
                            >
                                <SelectTrigger className="col-span-2 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="badge">Badge</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="boolean">Boolean (✓/✗)</SelectItem>
                                    <SelectItem value="currency">Currency</SelectItem>
                                    <SelectItem value="percentage">%</SelectItem>
                                    <SelectItem value="image">Image</SelectItem>
                                    <SelectItem value="link">Link</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {columnConfig.displayType === 'date' && (
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label>Format</Label>
                                <Select
                                    value={columnConfig.dateFormat || 'MMM dd, yyyy'}
                                    onValueChange={(dateFormat) => onColumnOverrideChange(columnName, { dateFormat })}
                                >
                                    <SelectTrigger className="col-span-2 h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MMM dd, yyyy">Dec 10, 2024</SelectItem>
                                        <SelectItem value="dd/MM/yyyy">10/12/2024</SelectItem>
                                        <SelectItem value="MM/dd/yyyy">12/10/2024</SelectItem>
                                        <SelectItem value="yyyy-MM-dd">2024-12-10</SelectItem>
                                        <SelectItem value="dd MMM yyyy">10 Dec 2024</SelectItem>
                                        <SelectItem value="relative">Relative</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
