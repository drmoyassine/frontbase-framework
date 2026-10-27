import type { ComponentDataBinding, ColumnOverride } from '@frontbase/types';

export type { ComponentDataBinding, ColumnOverride };

export interface KPICardProps {
    mode?: 'builder' | 'edge';
    componentId: string;
    binding?: ComponentDataBinding | null;
    className?: string;
    style?: React.CSSProperties;
    initialData?: any[];
    onConfigureBinding?: () => void;
    configureOverlay?: React.ReactNode;
}
