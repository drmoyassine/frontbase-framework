import type { ReactNode } from 'react';

/**
 * Raw Column Schema fetched from Database API
 */
export interface ColumnSchema {
    name: string;
    type: string | string[];
    nullable: boolean;
    primary_key: boolean;
    default?: any;
    is_foreign?: boolean;
    foreign_table?: string;
    foreign_column?: string;
}

/**
 * Field Override Configuration (from Builder)
 */
export interface InfoListFieldOverride {
    label?: string;
    hidden?: boolean;
    type?: string; 
    width?: string;
    height?: string;
    [key: string]: any;
}

/**
 * The unified Binding object (passed by Builder and baked by Edge during Publish)
 */
export interface InfoListBinding {
    tableName?: string;
    dataSourceId?: string;
    datasourceId?: string;
    columns?: ColumnSchema[];
    foreignKeys?: any[];
    fieldOverrides?: Record<string, InfoListFieldOverride>;
    fieldOrder?: string[];
    excludeColumns?: string[];
    recordId?: string;
    dataRequest?: any;
}

/**
 * Props for the unified InfoList Component
 */
export interface InfoListProps {
    /** Environment mode - 'builder' runs APIs for live fetching, 'edge' uses pre-baked binding */
    mode?: 'builder' | 'edge';
    /** Unique component ID used for query keys */
    componentId?: string;
    /** Unified binding configuration */
    binding: InfoListBinding;
    /** Optional explicit record ID override */
    recordId?: string;
    /** Optional explicit table name override */
    tableName?: string;
    /** Title override */
    title?: string;
    /** Show card wrapper */
    showCard?: boolean;
    /** CSS classes */
    className?: string;
    /** Inline styles */
    style?: React.CSSProperties;
    /** Layout: 'list' | '1' | '2' | '3' */
    layout?: 'list' | '1' | '2' | '3';
    /** Field spacing: 'compact' | 'normal' | 'relaxed' */
    fieldSpacing?: 'compact' | 'normal' | 'relaxed';
    /** Optional field overrides explicitly passed (merges with binding) */
    fieldOverrides?: Record<string, InfoListFieldOverride>;
    /** Optional explicit column count (overrides layout) */
    columns?: number;
    /** Initial server-fetched data (for SSR hydration) */
    initialData?: Record<string, any> | null;
    /** IoC Slot: Render prop to wrap individual fields with Builder specific UI (e.g. Settings popovers) */
    fieldWrapper?: (fieldName: string, content: ReactNode) => ReactNode;
    /** Callback for empty binding configuration */
    onConfigureBinding?: () => void;
}
