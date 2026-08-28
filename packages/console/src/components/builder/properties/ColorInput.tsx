/**
 * ColorInput — dual color control: a native color swatch paired with a free-text
 * CSS color input. Extracted from the Badge properties panel (where the same
 * markup was triplicated) so the schema-driven form engine and any other panel
 * can reuse it.
 */

import React from 'react';
import { Input } from '@/components/ui/input';

interface ColorInputProps {
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export const ColorInput: React.FC<ColorInputProps> = ({
    value = '',
    onChange,
    placeholder = 'CSS color',
    disabled,
}) => {
    // HTML5 <input type="color"> only accepts hex colors (#rrggbb).
    // For CSS variables (var(--foo)) or complex expressions (hsl(var(--primary))),
    // we can't bind the value to the color input. Only bind when it's a valid hex color.
    const isHexColor = /^#[0-9A-Fa-f]{6}$/.test(value || '');
    const colorInputValue = isHexColor ? value : '#000000';

    return (
        <div className="flex gap-2">
            <Input
                type="color"
                value={colorInputValue}
                onChange={(e) => onChange(e.target.value)}
                className="w-20 h-9 p-1 cursor-pointer"
                disabled={disabled}
            />
            <Input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="flex-1"
                disabled={disabled}
            />
        </div>
    );
};
