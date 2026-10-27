import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { SpacingValue } from '@/lib/styles/types';

interface SpacingControlProps {
    value: SpacingValue;
    onChange: (value: SpacingValue) => void;
}

export const SpacingControl: React.FC<SpacingControlProps> = ({
    value,
    onChange
}) => {
    const [mode, setMode] = useState<'all' | 'custom'>(
        value.top === value.right && value.right === value.bottom && value.bottom === value.left
            ? 'all'
            : 'custom'
    );

    const handleAllChange = (newValue: number) => {
        onChange({
            top: newValue,
            right: newValue,
            bottom: newValue,
            left: newValue
        });
    };

    const handleSideChange = (side: keyof SpacingValue, newValue: number) => {
        onChange({
            ...value,
            [side]: newValue
        });
    };

    const toggleMode = () => {
        setMode(mode === 'all' ? 'custom' : 'all');
    };

    return (
        <div className="flex items-center gap-2 w-full">
            {mode === 'all' ? (
                <>
                    <Input
                        type="number"
                        value={value.top}
                        onChange={(e) => handleAllChange(parseInt(e.target.value) || 0)}
                        min={0}
                        className="w-16 h-7 text-xs text-center"
                    />
                    <button
                        onClick={toggleMode}
                        className="text-xs text-muted-foreground hover:text-primary whitespace-nowrap"
                    >
                        All Sides
                    </button>
                </>
            ) : (
                <div className="flex items-center gap-1 flex-1">
                    <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-muted-foreground">T</span>
                        <Input
                            type="number"
                            value={value.top}
                            onChange={(e) => handleSideChange('top', parseInt(e.target.value) || 0)}
                            min={0}
                            className="w-10 h-7 text-xs text-center px-1"
                        />
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-muted-foreground">R</span>
                        <Input
                            type="number"
                            value={value.right}
                            onChange={(e) => handleSideChange('right', parseInt(e.target.value) || 0)}
                            min={0}
                            className="w-10 h-7 text-xs text-center px-1"
                        />
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-muted-foreground">B</span>
                        <Input
                            type="number"
                            value={value.bottom}
                            onChange={(e) => handleSideChange('bottom', parseInt(e.target.value) || 0)}
                            min={0}
                            className="w-10 h-7 text-xs text-center px-1"
                        />
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-muted-foreground">L</span>
                        <Input
                            type="number"
                            value={value.left}
                            onChange={(e) => handleSideChange('left', parseInt(e.target.value) || 0)}
                            min={0}
                            className="w-10 h-7 text-xs text-center px-1"
                        />
                    </div>
                    <button
                        onClick={toggleMode}
                        className="text-[10px] text-muted-foreground hover:text-primary whitespace-nowrap ml-1"
                    >
                        ←
                    </button>
                </div>
            )}
        </div>
    );
};
