import React from 'react';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// Width units: px, %, vw
type WidthUnit = 'px' | '%' | 'vw';
// Height units: px, vh
type HeightUnit = 'px' | 'vh';

interface DimensionValue {
    value: number | 'auto' | 'none';
    unit: WidthUnit | HeightUnit;
}

interface DimensionControlProps {
    value: DimensionValue;
    onChange: (value: DimensionValue) => void;
    dimension?: 'width' | 'height'; // Determines available units
    placeholder?: string;
}

const defaultValue: DimensionValue = {
    value: 'auto',
    unit: 'px'
};

export const DimensionControl: React.FC<DimensionControlProps> = ({
    value = defaultValue,
    onChange,
    dimension = 'width',
    placeholder = 'auto'
}) => {
    const safeValue = { ...defaultValue, ...value };

    // Get available units based on dimension type
    const units = dimension === 'width'
        ? ['px', '%', 'vw'] as const
        : ['px', 'vh'] as const;

    const handleValueChange = (newValue: string) => {
        const parsed = newValue === '' || newValue === 'auto' || newValue === 'none'
            ? placeholder === 'none' ? 'none' : 'auto'
            : parseInt(newValue) || 0;
        onChange({ ...safeValue, value: parsed });
    };

    const handleUnitChange = (unit: string) => {
        onChange({ ...safeValue, unit: unit as WidthUnit | HeightUnit });
    };

    const displayValue = safeValue.value === 'auto' || safeValue.value === 'none'
        ? ''
        : safeValue.value;

    return (
        <div className="flex items-center gap-1 w-full">
            <Input
                type="text"
                value={displayValue}
                placeholder={placeholder}
                onChange={(e) => handleValueChange(e.target.value)}
                className="flex-1 min-w-0 h-7 text-xs text-center px-2"
            />
            <Select value={safeValue.unit} onValueChange={handleUnitChange}>
                <SelectTrigger className="w-14 h-7 text-xs px-1 flex-shrink-0">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {units.map(unit => (
                        <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};
