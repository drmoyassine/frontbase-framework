/**
 * FieldSettingsPopover - Inline popover for field settings (displayed near the clicked field).
 * Used by Form and InfoList components in builder mode.
 */

import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface FieldSettingsPopoverProps {
    fieldName: string;
    settings: any;
    onSave: (settings: any) => void;
    componentType?: 'Form' | 'InfoList';
    children: React.ReactNode;
    isBuilderMode?: boolean;
    /** FK table name (for dropdown display column feature) */
    fkTable?: string;
    /** Datasource ID for fetching FK columns */
    dataSourceId?: string;
}

export const FieldSettingsPopover: React.FC<FieldSettingsPopoverProps> = ({
    fieldName,
    settings = {},
    onSave,
    componentType = 'Form',
    children,
    isBuilderMode = true,
    fkTable,
    dataSourceId
}) => {
    const [open, setOpen] = useState(false);
    const [label, setLabel] = useState(settings?.label || fieldName);
    // For FK fields (fkTable present), default to 'select' not 'text'
    const [type, setType] = useState(settings?.type || (fkTable ? 'select' : 'text'));
    const [typeExplicitlyChanged, setTypeExplicitlyChanged] = useState(false);
    const [required, setRequired] = useState(settings?.validation?.required || false);
    const [fkDisplayColumn, setFkDisplayColumn] = useState(settings?.fkDisplayColumn || '');
    const [fkColumns, setFkColumns] = useState<string[]>([]);

    // Fetch FK table columns when fkTable is provided
    useEffect(() => {
        if (!fkTable || !open) return;

        const fetchFkColumns = async () => {
            try {
                const endpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${fkTable}/schema/`
                    : `/api/database/table-schema/${fkTable}/`;

                const response = await fetch(endpoint);
                if (response.ok) {
                    const result = await response.json();
                    const schema = result.data || result;
                    const cols = (schema.columns || []).map((c: any) => c.name || c.column_name).filter(Boolean);
                    setFkColumns(cols);
                }
            } catch (e) {
                console.warn('Failed to fetch FK columns:', e);
            }
        };

        fetchFkColumns();
    }, [fkTable, dataSourceId, open]);

    // Sync state when settings change
    useEffect(() => {
        setLabel(settings?.label || fieldName);
        // For FK fields, default to 'select' not 'text'
        setType(settings?.type || (fkTable ? 'select' : 'text'));
        setRequired(settings?.validation?.required || false);
        setFkDisplayColumn(settings?.fkDisplayColumn || '');
        setTypeExplicitlyChanged(false);
    }, [settings, fieldName]);

    // Don't wrap if not in builder mode
    if (!isBuilderMode) {
        return <>{children}</>;
    }

    const handleSave = (updates: Partial<any>) => {
        const newSettings = {
            ...settings,
            ...updates,
            label: updates.label !== undefined ? updates.label : label,
            // Only save type if it was explicitly changed by user, to prevent corrupting FK detection
            ...(updates.type !== undefined || typeExplicitlyChanged ? { type: updates.type !== undefined ? updates.type : type } : {}),
        };

        if (componentType === 'Form' && updates.required !== undefined) {
            newSettings.validation = {
                ...settings?.validation,
                required: updates.required
            };
        }

        onSave(newSettings);
    };

    const infoListTypes = [
        { value: 'text', label: 'Text' },
        { value: 'number', label: 'Number' },
        { value: 'date', label: 'Date' },
        { value: 'datetime', label: 'Date Time' },
        { value: 'boolean', label: 'Yes/No' },
        { value: 'badge', label: 'Badge(s)' },
        { value: 'image', label: 'Image' },
        { value: 'link', label: 'Link' },
    ];

    const formTypes = [
        { value: 'text', label: 'Text Input' },
        { value: 'textarea', label: 'Text Area' },
        { value: 'number', label: 'Number' },
        { value: 'email', label: 'Email' },
        { value: 'date', label: 'Date Picker' },
        { value: 'datetime', label: 'Date Time' },
        { value: 'checkbox', label: 'Checkbox' },
        { value: 'select', label: 'Select / Dropdown' },
        { value: 'image', label: 'Image' },
    ];

    const typeOptions = componentType === 'InfoList' ? infoListTypes : formTypes;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    className={cn(
                        "cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all rounded-md",
                        open && "ring-2 ring-primary"
                    )}
                    title={`Click to configure ${fieldName}`}
                >
                    {children}
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start" side="right" sideOffset={8}>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h4 className="font-medium leading-none">Field Settings</h4>
                        <p className="text-xs text-muted-foreground">
                            {componentType === 'InfoList'
                                ? `Configure how ${fieldName} is displayed.`
                                : `Configure ${fieldName} input and validation.`}
                        </p>
                    </div>

                    {componentType === 'InfoList' ? (
                        /* InfoList: Simple settings without tabs */
                        <div className="grid gap-3">
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label className="text-xs">Label</Label>
                                <Input
                                    value={label}
                                    onChange={(e) => {
                                        setLabel(e.target.value);
                                        handleSave({ label: e.target.value });
                                    }}
                                    placeholder={fieldName}
                                    className="col-span-2 h-8"
                                />
                            </div>
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label className="text-xs">Display</Label>
                                <Select
                                    value={type}
                                    onValueChange={(value) => {
                                        setType(value);
                                        handleSave({ type: value });
                                    }}
                                >
                                    <SelectTrigger className="col-span-2 h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {typeOptions.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ) : (
                        /* Form: Tabs with General + Validation */
                        <Tabs defaultValue="general" className="w-full">
                            <TabsList className="grid w-full grid-cols-2 h-8">
                                <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
                                <TabsTrigger value="validation" className="text-xs">Validation</TabsTrigger>
                            </TabsList>

                            <TabsContent value="general" className="space-y-3 mt-3">
                                <div className="grid grid-cols-3 items-center gap-4">
                                    <Label className="text-xs">Label</Label>
                                    <Input
                                        value={label}
                                        onChange={(e) => {
                                            setLabel(e.target.value);
                                            handleSave({ label: e.target.value });
                                        }}
                                        placeholder={fieldName}
                                        className="col-span-2 h-8"
                                    />
                                </div>
                                <div className="grid grid-cols-3 items-center gap-4">
                                    <Label className="text-xs">Type</Label>
                                    <Select
                                        value={type}
                                        onValueChange={(value) => {
                                            setType(value);
                                            setTypeExplicitlyChanged(true);
                                            handleSave({ type: value });
                                        }}
                                    >
                                        <SelectTrigger className="col-span-2 h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {typeOptions.map(opt => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Display Column for FK dropdowns */}
                                {fkTable && fkColumns.length > 0 && (
                                    <div className="grid grid-cols-3 items-center gap-4">
                                        <Label className="text-xs">Display</Label>
                                        <Select
                                            value={fkDisplayColumn}
                                            onValueChange={(value) => {
                                                setFkDisplayColumn(value);
                                                handleSave({ fkDisplayColumn: value });
                                            }}
                                        >
                                            <SelectTrigger className="col-span-2 h-8">
                                                <SelectValue placeholder="Select column to show..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="id">ID</SelectItem>
                                                {fkColumns.filter(c => c !== 'id').map(col => (
                                                    <SelectItem key={col} value={col}>{col}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="validation" className="space-y-3 mt-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs">Required</Label>
                                    <Switch
                                        checked={required}
                                        onCheckedChange={(checked) => {
                                            setRequired(checked);
                                            handleSave({ required: checked });
                                        }}
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
