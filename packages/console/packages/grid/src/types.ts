import type { ReactNode } from 'react';
import type { ComponentDataBinding, ColumnOverride } from '@frontbase/types';

export type { ComponentDataBinding, ColumnOverride };

export interface GridProps {
    mode?: 'builder' | 'edge';
    componentId: string;
    binding?: ComponentDataBinding | null;
    className?: string;
    style?: React.CSSProperties;
    columns?: number;
    initialData?: any[];
    onConfigureBinding?: () => void;
    configureOverlay?: ReactNode;
    cardWrapper?: (item: any, content: ReactNode) => ReactNode;
}
