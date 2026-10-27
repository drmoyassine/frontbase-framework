import type { ReactNode } from 'react';

/**
 * Raw Column Schema fetched from Database API
 * (Shared interface — identical to InfoList's ColumnSchema)
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
export interface FormFieldOverride {
    label?: string;
    hidden?: boolean;
    type?: string;
    width?: string;
    height?: string;
    fkDisplayColumn?: string;
    options?: string[];
    validation?: {
        required?: boolean;
        min?: number;
        max?: number;
        pattern?: string;
        patternError?: string;
    };
    [key: string]: any;
}

/**
 * The unified Binding object (passed by Builder and baked by Edge during Publish)
 */
export interface FormBinding {
    tableName?: string;
    dataSourceId?: string;
    datasourceId?: string;
    columns?: ColumnSchema[];
    foreignKeys?: any[];
    fieldOverrides?: Record<string, FormFieldOverride>;
    fieldOrder?: string[];
    excludeColumns?: string[];
    recordId?: string;
    dataRequest?: any;
}

/**
 * Props passed to the fieldRenderer IoC slot
 */
export interface FieldRenderProps {
    column: ColumnSchema;
    fieldType: string;
    label: string;
    value: any;
    onChange: (value: any) => void;
    required: boolean;
    override: FormFieldOverride;
    disabled?: boolean;
}

/**
 * Props for the unified Form Component
 */
export interface FormProps {
    /** Environment mode - 'builder' runs APIs for live fetching, 'edge' uses pre-baked binding */
    mode?: 'builder' | 'edge';
    /** Unique component ID used for query keys */
    componentId?: string;
    /** Unified binding configuration */
    binding: FormBinding;
    /** Optional explicit record ID override (enables edit mode) */
    recordId?: string;
    /** Optional explicit table name override */
    tableName?: string;
    /** Optional explicit data source ID override */
    dataSourceId?: string;
    /** Title override */
    title?: string;
    /** Show card wrapper */
    showCard?: boolean;
    /** CSS classes */
    className?: string;
    /** Inline styles */
    style?: React.CSSProperties;
    /** Columns to exclude from form */
    excludeColumns?: string[];
    /** Columns to mark as read-only */
    readOnlyColumns?: string[];
    /** Optional field overrides explicitly passed (merges with binding) */
    fieldOverrides?: Record<string, FormFieldOverride>;
    /** Optional field order */
    fieldOrder?: string[];
    /** Initial server-fetched data (for SSR hydration / edit mode) */
    initialData?: Record<string, any> | null;
    /** IoC Slot: Render prop to wrap individual fields with Builder specific UI (e.g. Settings popovers) */
    fieldWrapper?: (fieldName: string, content: ReactNode) => ReactNode;
    /** IoC Slot: Custom field renderer override (for injecting shadcn inputs, etc.) */
    fieldRenderer?: (props: FieldRenderProps) => ReactNode;
    /**
     * IoC Slot: Custom field-label renderer (e.g. inline rich-text editing in the
     * Builder). Receives the field name, resolved label text, and required flag.
     * When omitted, the default <label> is rendered.
     */
    labelRenderer?: (fieldName: string, labelText: string, isRequired: boolean) => ReactNode;
    /** Callback when form is submitted successfully */
    onSubmit?: (data: Record<string, any>) => void;
    /** Callback when form is cancelled */
    onCancel?: () => void;
    /** Callback for empty binding configuration */
    onConfigureBinding?: () => void;
}
