import React from 'react';
import { cn } from '@/lib/utils';

interface CanvasGridProps {
    visible: boolean;
    gridSize?: number;
}

export const CanvasGrid: React.FC<CanvasGridProps> = ({ visible, gridSize = 20 }) => {
    if (!visible) return null;

    return (
        <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
                backgroundImage: `
          linear-gradient(to right, rgba(128, 128, 128, 0.1) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(128, 128, 128, 0.1) 1px, transparent 1px)
        `,
                backgroundSize: `${gridSize}px ${gridSize}px`
            }}
        />
    );
};
