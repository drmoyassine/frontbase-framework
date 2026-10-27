/**
 * CodeField - Code/SQL editor using a textarea with monospace font
 * Future: Could be upgraded to Monaco/CodeMirror
 */

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface CodeFieldProps {
    name: string;
    label?: string;
    value: string;
    onChange: (value: string) => void;
    language?: 'javascript' | 'sql' | 'json';
    description?: string;
    placeholder?: string;
    required?: boolean;
}

export function CodeField({
    name,
    label,
    value,
    onChange,
    language = 'javascript',
    description,
    placeholder,
    required,
}: CodeFieldProps) {
    return (
        <div className="space-y-2">
            {label && (
                <Label htmlFor={name}>
                    {label}
                    {required && <span className="text-destructive ml-1">*</span>}
                    <span className="ml-2 text-xs text-muted-foreground">({language})</span>
                </Label>
            )}
            <Textarea
                id={name}
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="font-mono text-sm min-h-[100px] resize-y"
                rows={5}
            />
            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
