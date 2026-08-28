/**
 * SelectField - Dropdown select component for workflow node properties
 */

import React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Option {
    value: string;
    label: string;
}

interface SelectFieldProps {
    name: string;
    label?: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    description?: string;
    required?: boolean;
    placeholder?: string;
}

export function SelectField({
    name,
    label,
    value,
    options,
    onChange,
    description,
    required,
    placeholder = 'Select...',
}: SelectFieldProps) {
    return (
        <div className="space-y-2">
            {label && (
                <Label htmlFor={name}>
                    {label}
                    {required && <span className="text-destructive ml-1">*</span>}
                </Label>
            )}
            <Select value={value || ''} onValueChange={onChange}>
                <SelectTrigger id={name}>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
