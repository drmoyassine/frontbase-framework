import React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { CSSPropertyConfig } from '@/lib/styles/types';

interface SelectControlProps {
    config: CSSPropertyConfig;
    value: string;
    onChange: (value: string) => void;
}

export const SelectControl: React.FC<SelectControlProps> = ({
    config,
    value,
    onChange
}) => {
    if (!config.options) {
        return null;
    }

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger>
                <SelectValue placeholder={`Select ${config.name}`} />
            </SelectTrigger>
            <SelectContent>
                {config.options.map((option) => (
                    <SelectItem key={option} value={option}>
                        {option}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
