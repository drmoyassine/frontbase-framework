import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorControl } from './ColorControl';
import type { CSSPropertyConfig } from '@/lib/styles/types';

interface CompositeControlProps {
    config: CSSPropertyConfig;
    value: Record<string, any>;
    onChange: (value: Record<string, any>) => void;
}

export const CompositeControl: React.FC<CompositeControlProps> = ({
    config,
    value,
    onChange
}) => {
    if (!config.fields) {
        return null;
    }

    const handleFieldChange = (fieldName: string, fieldValue: any) => {
        onChange({
            ...value,
            [fieldName]: fieldValue
        });
    };

    return (
        <div className="space-y-3">
            {config.fields.map((field) => (
                <div key={field.name} className="space-y-1">
                    <Label className="text-xs capitalize">{field.name}</Label>

                    {field.controlType === 'number' && (
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                value={value[field.name] || 0}
                                onChange={(e) => handleFieldChange(field.name, parseInt(e.target.value) || 0)}
                                min={field.min}
                                max={field.max}
                                step={field.step || 1}
                                className="flex-1"
                            />
                            {field.unit && (
                                <span className="text-sm text-muted-foreground min-w-[30px]">
                                    {field.unit}
                                </span>
                            )}
                        </div>
                    )}

                    {field.controlType === 'color' && (
                        <ColorControl
                            value={value[field.name] || '#000000'}
                            onChange={(v) => handleFieldChange(field.name, v)}
                        />
                    )}

                    {field.controlType === 'select' && field.options && (
                        <select
                            value={value[field.name] || ''}
                            onChange={(e) => handleFieldChange(field.name, e.target.value)}
                            className="w-full px-3 py-2 border rounded-md"
                        >
                            {field.options.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    )}
                </div>
            ))}
        </div>
    );
};
