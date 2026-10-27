import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterInputProps } from './types';

export const BooleanFilterInput: React.FC<FilterInputProps> = ({ filter, onValueChange }) => {
    const value = filter.value as boolean | undefined;

    return (
        <Select
            value={value === undefined ? '' : value.toString()}
            onValueChange={(val) => {
                if (val === '') {
                    onValueChange(undefined);
                } else {
                    onValueChange(val === 'true');
                }
            }}
        >
            <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder={filter.label || filter.column} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
            </SelectContent>
        </Select>
    );
};
