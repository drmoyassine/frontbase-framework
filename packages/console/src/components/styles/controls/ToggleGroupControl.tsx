import React from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    AlignHorizontalJustifyStart,
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    Minimize2,
    Maximize2
} from 'lucide-react';
import type { CSSPropertyConfig } from '@/lib/styles/types';

interface ToggleGroupControlProps {
    config: CSSPropertyConfig;
    value: string;
    onChange: (value: string) => void;
}

// Icon mapping for common flex properties
const ICON_MAP: Record<string, Record<string, React.ReactNode>> = {
    flexDirection: {
        row: <AlignHorizontalJustifyStart className="h-4 w-4" />,
        column: <AlignVerticalJustifyStart className="h-4 w-4" />,
    },
    alignItems: {
        'flex-start': <AlignVerticalJustifyStart className="h-4 w-4" />,
        center: <AlignVerticalJustifyCenter className="h-4 w-4" />,
        'flex-end': <AlignVerticalJustifyEnd className="h-4 w-4" />,
        stretch: <Maximize2 className="h-4 w-4" />,
    },
    justifyContent: {
        'flex-start': <AlignLeft className="h-4 w-4" />,
        center: <AlignCenter className="h-4 w-4" />,
        'flex-end': <AlignRight className="h-4 w-4" />,
        'space-between': <AlignJustify className="h-4 w-4" />,
        'space-around': <Minimize2 className="h-4 w-4" />,
    },
};

const LABEL_MAP: Record<string, Record<string, string>> = {
    flexDirection: {
        row: 'Row',
        column: 'Column',
    },
};

export const ToggleGroupControl: React.FC<ToggleGroupControlProps> = ({
    config,
    value,
    onChange
}) => {
    if (!config.options) {
        return null;
    }

    const hasIcons = !!ICON_MAP[config.id];
    const hasLabels = !!LABEL_MAP[config.id];

    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(v) => v && onChange(v)}
            className="justify-start"
        >
            {config.options.map((option) => {
                const icon = ICON_MAP[config.id]?.[option];
                const label = LABEL_MAP[config.id]?.[option];

                return (
                    <ToggleGroupItem
                        key={option}
                        value={option}
                        className="px-3"
                        aria-label={option}
                    >
                        {hasIcons && icon}
                        {hasLabels && <span className="ml-2">{label}</span>}
                        {!hasIcons && !hasLabels && option}
                    </ToggleGroupItem>
                );
            })}
        </ToggleGroup>
    );
};
