import React from 'react';
import { Input } from '@/components/ui/input';
import { FilterInputProps } from './types';

export const TextFilterInput: React.FC<FilterInputProps> = ({ filter, onValueChange }) => (
    <Input
        placeholder={filter.label || filter.column}
        value={(filter.value as string) || ''}
        onChange={(e) => onValueChange(e.target.value || undefined)}
        className="h-8 w-40"
    />
);
