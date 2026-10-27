/**
 * DynamicSelectField - Select field with dynamic option loading
 * 
 * Fetches options from API when optionType is a string (e.g., 'datasources', 'tables')
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useDynamicOptions } from '../hooks/useDynamicOptions';

interface SelectOption {
    value: string;
    label: string;
}

interface DynamicSelectFieldProps {
    name: string;
    label?: string;
    value: string;
    options: string | SelectOption[];
    onChange: (value: string) => void;
    description?: string;
    required?: boolean;
    dependsOnValue?: string;
    placeholder?: string;
}

export function DynamicSelectField({
    label,
    value,
    options: optionsProp,
    onChange,
    description,
    required,
    dependsOnValue,
    placeholder = 'Select...',
}: DynamicSelectFieldProps) {
    const { options, loading, error } = useDynamicOptions(optionsProp, dependsOnValue);

    return (
        <div className="space-y-2">
            {label && (
                <Label>
                    {label}
                    {required && <span className="text-destructive ml-1">*</span>}
                </Label>
            )}

            <Select value={value || ''} onValueChange={onChange} disabled={loading}>
                <SelectTrigger className="w-full">
                    {loading ? (
                        <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Loading...</span>
                        </div>
                    ) : (
                        <SelectValue placeholder={placeholder} />
                    )}
                </SelectTrigger>
                <SelectContent>
                    {options.length === 0 && !loading && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            {error || 'No options available'}
                        </div>
                    )}
                    {options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
