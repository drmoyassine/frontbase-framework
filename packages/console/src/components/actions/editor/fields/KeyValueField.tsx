/**
 * KeyValueField - Key-value pair editor for headers, query params, etc.
 */

import React from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface KeyValuePair {
    key: string;
    value: string;
}

interface KeyValueFieldProps {
    name: string;
    label?: string;
    value: KeyValuePair[];
    onChange: (value: KeyValuePair[]) => void;
    description?: string;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

export function KeyValueField({
    name,
    label,
    value = [],
    onChange,
    description,
    keyPlaceholder = 'Key',
    valuePlaceholder = 'Value',
}: KeyValueFieldProps) {
    const handleAdd = () => {
        onChange([...value, { key: '', value: '' }]);
    };

    const handleRemove = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
    };

    const handleChange = (index: number, field: 'key' | 'value', newValue: string) => {
        const updated = value.map((pair, i) =>
            i === index ? { ...pair, [field]: newValue } : pair
        );
        onChange(updated);
    };

    return (
        <div className="space-y-2">
            {label && <Label>{label}</Label>}

            <div className="space-y-2">
                {value.map((pair, index) => (
                    <div key={index} className="flex gap-2 items-center">
                        <Input
                            placeholder={keyPlaceholder}
                            value={pair.key}
                            onChange={(e) => handleChange(index, 'key', e.target.value)}
                            className="flex-1"
                        />
                        <Input
                            placeholder={valuePlaceholder}
                            value={pair.value}
                            onChange={(e) => handleChange(index, 'value', e.target.value)}
                            className="flex-1"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(index)}
                            className="shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
            </div>

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAdd}
                className="w-full"
            >
                <Plus className="w-4 h-4 mr-2" />
                Add
            </Button>

            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
