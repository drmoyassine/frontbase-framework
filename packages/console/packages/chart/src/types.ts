import type { ComponentDataBinding, ColumnOverride } from '@frontbase/types';

export type { ComponentDataBinding, ColumnOverride };

export interface ChartProps {
    mode?: 'builder' | 'edge';
    componentId: string;
    binding?: ComponentDataBinding | null;
    className?: string;
    style?: React.CSSProperties;
    chartType?: 'bar' | 'line' | 'pie';
    height?: string;
    initialData?: any[];
    onConfigureBinding?: () => void;
    configureOverlay?: React.ReactNode;
    title?: string;
}

