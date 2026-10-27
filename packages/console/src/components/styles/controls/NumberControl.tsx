import React from 'react';
import { Input } from '@/components/ui/input';
import type { CSSPropertyConfig } from '@/lib/styles/types';

interface NumberControlProps {
    config: CSSPropertyConfig;
    value: number | string;
    onChange: (value: number) => void;
}

export const NumberControl: React.FC<NumberControlProps> = ({
    config,
    value,
    onChange
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const numValue = e.target.value === '' ? 0 : parseFloat(e.target.value);
        onChange(numValue);
    };

    return (
        <div className="flex items-center gap-2">
            <Input
                type="number"
                value={value === 'auto' || value === 'none' ? '' : value}
                onChange={handleChange}
                min={config.min}
                max={config.max}
                step={config.step || 1}
                placeholder={value === 'auto' || value === 'none' ? String(value) : undefined}
                className="flex-1"
            />
            {config.unit && (
                <span className="text-sm text-muted-foreground min-w-[30px]">
                    {config.unit}
                </span>
            )}
        </div>
    );
};
