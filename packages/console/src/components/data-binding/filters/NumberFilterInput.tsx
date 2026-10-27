import React from 'react';
import { Input } from '@/components/ui/input';
import { FilterInputProps } from './types';

export const NumberFilterInput: React.FC<FilterInputProps> = ({ filter, onValueChange }) => {
    const value = (filter.value as { min?: number; max?: number }) || {};

    return (
        <div className="flex items-center gap-1">
            <Input
                type="number"
                placeholder="Min"
                value={value.min ?? ''}
                onChange={(e) => {
                    const newVal = e.target.value ? { ...value, min: parseFloat(e.target.value) } : { ...value, min: undefined };
                    if (newVal.min === undefined && newVal.max === undefined) {
                        onValueChange(undefined);
                    } else {
                        onValueChange(newVal);
                    }
                }}
                className="h-8 w-20"
            />
            <span className="text-muted-foreground">-</span>
            <Input
                type="number"
                placeholder="Max"
                value={value.max ?? ''}
                onChange={(e) => {
                    const newVal = e.target.value ? { ...value, max: parseFloat(e.target.value) } : { ...value, max: undefined };
                    if (newVal.min === undefined && newVal.max === undefined) {
                        onValueChange(undefined);
                    } else {
                        onValueChange(newVal);
                    }
                }}
                className="h-8 w-20"
            />
        </div>
    );
};
