import React from 'react';
import { Input } from '@/components/ui/input';

interface ColorControlProps {
    value: string;
    onChange: (value: string) => void;
}

export const ColorControl: React.FC<ColorControlProps> = ({
    value,
    onChange
}) => {
    // HTML5 <input type="color"> only accepts hex colors (#rrggbb).
    // For CSS variables (var(--foo)) or complex expressions, only bind when it's a valid hex color.
    const isHexColor = /^#[0-9A-Fa-f]{6}$/.test(value);
    const colorInputValue = value === 'transparent' ? '#FFFFFF' : (isHexColor ? value : '#000000');

    return (
        <div className="flex items-center gap-2">
            <input
                type="color"
                value={colorInputValue}
                onChange={(e) => onChange(e.target.value)}
                className="w-12 h-10 rounded border border-border cursor-pointer"
            />
            <Input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#000000"
                className="flex-1 font-mono text-sm"
            />
        </div>
    );
};
