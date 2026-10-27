/**
 * ExpressionField - Expression input with {{ }} syntax highlighting
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ExpressionFieldProps {
    name: string;
    label?: string;
    value: string;
    onChange: (value: string) => void;
    description?: string;
    placeholder?: string;
    required?: boolean;
}

export function ExpressionField({
    name,
    label,
    value,
    onChange,
    description,
    placeholder = '{{ $input.data }}',
    required,
}: ExpressionFieldProps) {
    return (
        <div className="space-y-2">
            {label && (
                <Label htmlFor={name}>
                    {label}
                    {required && <span className="text-destructive ml-1">*</span>}
                </Label>
            )}
            <div className="relative">
                <Input
                    id={name}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="font-mono text-sm"
                />
            </div>
            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
