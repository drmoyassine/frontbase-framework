/**
 * Shared DataTable Types
 * 
 * Unified type definitions for DataTable across builder and edge.
 */

// =============================================================================
// Column Configuration
// =============================================================================

export interface ColumnOverride {
    displayType?: 'text' | 'image' | 'link' | 'badge' | 'date' | 'boolean' | 'currency' | 'percentage';
    displayName?: string;
    label?: string;  // Alias for displayName
    visible?: boolean;
    width?: string;
    sortable?: boolean;
    filterable?: boolean;
    dateFormat?: string;
    primaryKey?: string;  // For FK reference
}

// =============================================================================
// Filter Configuration
// =============================================================================

export interface FilterConfig {
    id: string;
    column: string;
    filterType: 'text' | 'dropdown' | 'multiselect' | 'number' | 'dateRange' | 'boolean';
    label?: string;
    value?: any;
    options?: string[] | { label: string; value: string }[];
    optionsDataRequest?: DataRequest;
}

// =============================================================================
// Data Request (Pre-computed at publish time)
// =============================================================================

export interface DataRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Record<string, unknown>;
    resultPath?: string;
    flattenRelations?: boolean;
    queryConfig?: QueryConfig;
    fetchStrategy?: 'direct' | 'proxy';
    datasourceId?: string;
}

export interface QueryConfig {
    baseUrl: string;
    selectParam: string;
    pageSize: number;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
    tableName?: string;
    columns?: string;
    joins?: any[];
    searchColumns?: string[];
    frontendFilters?: FilterConfig[];
    useRpc?: boolean;
    rpcUrl?: string;
}

// =============================================================================
// DataTable Binding
// =============================================================================

export interface DataTableBinding {
    // Data source
    tableName?: string;
    dataSourceId?: string;
    refreshInterval?: number;

    // Columns
    columnOrder?: string[];
    columnOverrides?: Record<string, ColumnOverride>;

    // Pagination
    pagination?: {
        enabled: boolean;
        pageSize: number;
        page?: number;
    };

    // Sorting
    sorting?: {
        enabled: boolean;
        column?: string;
        direction?: 'asc' | 'desc';
    };

    // Filtering
    filtering?: {
        searchEnabled: boolean;
        filtersEnabled?: boolean;
        filters?: Record<string, any>;
    };
    searchColumns?: string[];
    frontendFilters?: FilterConfig[];

    // Pre-computed data request (edge mode)
    dataRequest?: DataRequest;
    _resolvedHiddenFilters?: any[];
    _pendingHiddenFilters?: any[];
}

// =============================================================================
// Component Props
// =============================================================================

export interface DataTableProps {
    /** Mode: 'builder' uses FastAPI, 'edge' uses pre-computed DataRequest */
    mode?: 'builder' | 'edge';

    /** Component ID for builder mode */
    componentId?: string;

    /** Data binding configuration */
    binding?: DataTableBinding | null;

    /** Initial data for SSR (edge mode) */
    initialData?: any[];

    /** Initial total count (edge mode) */
    initialTotal?: number;

    /** Additional CSS class */
    className?: string;

    /** Inline styles */
    style?: React.CSSProperties;

    /** Callback for column override changes (builder mode) */
    onColumnOverrideChange?: (columnName: string, updates: Partial<ColumnOverride>) => void;

    /** Callback to open binding configuration (builder mode) */
    onConfigureBinding?: () => void;

    /** Inversion of Control wrapper for injecting builder tools into headers without bundling them */
    headerCellWrapper?: (columnName: string, children: React.ReactNode) => React.ReactNode;

    /** Table title */
    title?: string;
}

// =============================================================================
// Data Fetcher Types
// =============================================================================

export interface DataFetcherConfig {
    mode: 'builder' | 'edge';
    binding: DataTableBinding;
    page: number;
    pageSize: number;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
    filters?: Record<string, any>;
    searchQuery?: string;
}

export interface DataFetcherResult {
    data: any[];
    total: number;
}
