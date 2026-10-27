import React from 'react';
import { Input } from '@/components/ui/input';
import { FilterInputProps } from './types';

export const DateRangeFilterInput: React.FC<FilterInputProps> = ({ filter, onValueChange }) => {
    const value = (filter.value as { lastDays?: number; start?: string; end?: string }) || {};

    return (
        <div className="flex items-center gap-2">
            <Input
                type="number"
                placeholder="Last X days"
                value={value.lastDays ?? ''}
                onChange={(e) => {
                    if (e.target.value) {
                        onValueChange({ lastDays: parseInt(e.target.value) });
                    } else {
                        onValueChange(undefined);
                    }
                }}
                className="h-8 w-28"
            />
        </div>
    );
};
