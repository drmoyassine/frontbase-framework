import React from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { VariableSelector, VariableOption } from './VariableSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RLSValueSource } from '@/types/rls';

interface SmartValueInputProps {
    value: string; // The literal value OR the variable name
    source: RLSValueSource; // 'literal' | 'auth' | 'contacts' | 'user_attribute' | ...
    sourceColumn?: string; // If 'contacts'/'user_attribute', which column?

    onChange: (updates: {
        value?: string;
        source: RLSValueSource;
        sourceColumn?: string;
    }) => void;

    // Context for "Smart" behavior
    targetColumn?: string; // Column we are filtering on (e.g. 'type')
    possibleValues?: string[]; // If it's an enum column, list of options

    // Available variables for selector
    userColumns?: Array<{ name: string; type: string }>;
    targetColumns?: Array<{ name: string; type: string }>;
    allowedSources?: RLSValueSource[];
}

export function SmartValueInput({
    value,
    source,
    sourceColumn,
    onChange,
    targetColumn,
    possibleValues,
    userColumns,
    targetColumns,
    allowedSources
}: SmartValueInputProps) {

    // Compute allowed categories for VariableSelector based on allowedSources
    const allowedCategories: VariableOption['category'][] = React.useMemo(() => {
        if (!allowedSources) return ['user', 'system', 'target']; // Default all

        const cats: VariableOption['category'][] = [];
        // Map RLS sources to VariableSelector categories
        if (allowedSources.some(s => s === 'contacts' || s === 'user_attribute')) cats.push('user');
        if (allowedSources.some(s => s === 'auth' || s === 'literal')) cats.push('system');
        if (allowedSources.some(s => s === 'target_column')) cats.push('target');

        return cats;
    }, [allowedSources]);

    // 1. Variable Chip Mode
    // If source is NOT literal, we show a chip
    if (source !== 'literal') {
        let displayLabel = value;
        let prefix = '';

        if (source === 'auth') {
            displayLabel = value; // e.g., auth.uid()
            prefix = 'System';
        } else if (source === 'contacts' || source === 'user_attribute') {
            displayLabel = sourceColumn || value;
            prefix = 'User';
        } else if (source === 'target_column') {
            displayLabel = sourceColumn || value;
            prefix = 'Record';
        }

        return (
            <div className="flex items-center gap-1 h-8 px-2 bg-secondary/50 rounded-md border border-secondary">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mr-1">
                    {prefix}
                </span>
                <span className="text-sm font-medium font-mono">
                    {displayLabel.replace(/[{}]/g, '')}
                </span>
                <button
                    onClick={() => onChange({ value: '', source: 'literal', sourceColumn: undefined })}
                    className="ml-1 p-0.5 hover:bg-secondary rounded-full"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>
        );
    }

    // 2. Enum Dropdown Mode
    // If we have possible values (and source is literal), show dropdown
    if (possibleValues && possibleValues.length > 0) {
        return (
            <div className="flex items-center gap-1">
                <Select
                    value={value}
                    onValueChange={(val) => onChange({ value: val, source: 'literal' })}
                >
                    <SelectTrigger className="w-[140px] h-8">
                        <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                        {possibleValues.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Still allow switching to variable if needed? Yes. */}
                <VariableSelector
                    onSelect={(val, cat) => handleVariableSelect(val, cat, onChange)}
                    userColumns={userColumns}
                    targetColumns={targetColumns}
                    allowedCategories={allowedCategories}
                />
            </div>
        );
    }

    // 3. Text Input Mode (Default)
    return (
        <div className="flex items-center relative">
            <Input
                value={value || ''}
                onChange={(e) => onChange({ value: e.target.value, source: 'literal' })}
                placeholder="Value..."
                className="w-[140px] h-8 pr-8"
            />
            <div className="absolute right-0 top-0 bottom-0 flex items-center">
                <VariableSelector
                    onSelect={(val, cat) => handleVariableSelect(val, cat, onChange)}
                    userColumns={userColumns}
                    targetColumns={targetColumns}
                    allowedCategories={allowedCategories}
                />
            </div>
        </div>
    );
}

// Global handler for variable selection to map categories to RLS sources
function handleVariableSelect(
    val: string,
    category: 'user' | 'system' | 'target' | 'other',
    onChange: (updates: any) => void
) {
    if (category === 'user') {
        onChange({
            source: 'user_attribute', // Modern source for user fields
            sourceColumn: val,
            value: `{user.${val}}` // Visual representation
        });
    } else if (category === 'system') {
        onChange({
            source: val.startsWith('auth.') ? 'auth' : 'literal',
            value: val,
            sourceColumn: undefined
        });
    } else if (category === 'target') {
        onChange({
            source: 'target_column',
            value: val,
            sourceColumn: val
        });
    }
}
