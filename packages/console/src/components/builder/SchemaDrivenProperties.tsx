/**
 * SchemaDrivenProperties — renders a list of property fields described by a
 * `PropertyFieldConfig[]` (see registry/propertySchemas.ts).
 *
 * Replaces the bespoke `*Properties.tsx` panels for simple components. Each
 * field maps to a shared UI primitive (VariableInput, Select, ColorInput,
 * IconPicker, …) so rendering stays consistent and new components need only a
 * schema — no new file and no switch case.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VariableInput } from './VariableInput';
import { IconPicker } from './properties/IconPicker';
import { ColorInput } from './properties/ColorInput';
import type { PropertyFieldConfig } from './registry/propertySchemas';

interface SchemaDrivenPropertiesProps {
    fields: PropertyFieldConfig[];
    props: Record<string, any>;
    updateProp: (key: string, value: any) => void;
}

/**
 * Render a list of schema-described fields, inserting a small group heading
 * whenever a run of fields shares the same `group` (framework
 * PropDefinition.group). Fields without a group render headerless, preserving
 * the legacy look for product-local schemas that don't set groups.
 */
export const SchemaDrivenProperties: React.FC<SchemaDrivenPropertiesProps> = ({
    fields,
    props,
    updateProp,
}) => {
    let lastGroup: string | undefined = undefined;
    let groupIndex = 0;

    return (
        <>
            {fields.map((field) => {
                const showGroupHeader =
                    field.group !== undefined && field.group !== lastGroup;
                lastGroup = field.group;

                return (
                    <React.Fragment key={field.name}>
                        {showGroupHeader && (
                            <div
                                key={`group-${field.group}-${groupIndex++}`}
                                className="col-span-full mt-2 first:mt-0 -mb-1"
                            >
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {field.group}
                                </h4>
                            </div>
                        )}
                        <PropertyField
                            field={field}
                            value={props[field.name]}
                            onChange={(value) => updateProp(field.name, value)}
                            allProps={props}
                        />
                    </React.Fragment>
                );
            })}
        </>
    );
};

interface PropertyFieldProps {
    field: PropertyFieldConfig;
    value: any;
    onChange: (value: any) => void;
    allProps: Record<string, any>;
}

const PropertyField: React.FC<PropertyFieldProps> = ({ field, value, onChange, allProps }) => {
    // Conditional visibility (e.g. icon options only when an icon is set).
    if (field.visible && !field.visible(allProps)) return null;

    const label = field.label ?? field.name;
    // Variable-capable text inputs show the "@ for variables" hint, matching the
    // previous bespoke panels (Heading, Badge, Text).
    const showVariableHint = field.type === 'text';

    const renderLabel = () => (
        <Label className="text-sm font-medium">
            {label}
            {showVariableHint && (
                <span className="text-muted-foreground text-xs"> (@ for variables)</span>
            )}
        </Label>
    );

    const renderDescription = () =>
        field.description ? (
            <p className="text-xs text-muted-foreground">{field.description}</p>
        ) : null;

    switch (field.type) {
        case 'text':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <VariableInput
                        value={value ?? ''}
                        onChange={onChange}
                        syntaxContext={field.syntaxContext ?? 'output'}
                        multiline={field.multiline}
                        placeholder={field.placeholder}
                        allowedGroups={field.allowedGroups}
                    />
                    {renderDescription()}
                </div>
            );

        case 'input':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <Input
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder}
                    />
                    {renderDescription()}
                </div>
            );

        case 'textarea':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <Textarea
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder}
                        rows={field.rows ?? 3}
                    />
                    {renderDescription()}
                </div>
            );

        case 'number':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <Input
                        type="number"
                        value={value ?? field.defaultValue ?? ''}
                        onChange={(e) => onChange(parseInt(e.target.value, 10))}
                        min={field.min}
                        max={field.max}
                    />
                    {renderDescription()}
                </div>
            );

        case 'select':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <Select
                        value={value ?? field.defaultValue ?? ''}
                        onValueChange={onChange}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {field.options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {renderDescription()}
                </div>
            );

        case 'boolean':
            return (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">{label}</Label>
                        <Switch
                            checked={value ?? field.defaultValue ?? false}
                            onCheckedChange={onChange}
                        />
                    </div>
                    {renderDescription()}
                </div>
            );

        case 'color':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <ColorInput value={value ?? ''} onChange={onChange} />
                    {renderDescription()}
                </div>
            );

        case 'icon':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <IconPicker value={value ?? ''} onChange={onChange} />
                    {renderDescription()}
                </div>
            );

        default:
            return null;
    }
};
