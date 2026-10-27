/**
 * Unified DataTable Wrapper for Edge Environment
 * 
 * This is a thin wrapper that imports from @frontbase/datatable.
 * Supports feature flag for gradual migration.
 */

import React from 'react';
import type {
    DataTableBinding as UnifiedBinding,
    FilterConfig,
    ColumnOverride,
    DataRequest,
    QueryConfig
} from '@frontbase/datatable';
import { DataTable as UnifiedDataTable } from '@frontbase/datatable';

// Re-export types for backwards compatibility
export type { ColumnOverride, FilterConfig, DataRequest, QueryConfig };

// Local binding type for edge (matches existing interface)
export interface DataTableBinding {
    tableName?: string;
    dataSourceId?: string;
    columnOrder?: string[];
    columnOverrides?: Record<string, ColumnOverride>;
    pagination?: {
        enabled: boolean;
        pageSize: number;
        page?: number;
    };
    sorting?: {
        enabled: boolean;
        column?: string;
        direction?: 'asc' | 'desc';
    };
    filtering?: {
        searchEnabled: boolean;
        filtersEnabled?: boolean;
        filters?: Record<string, any>;
    };
    searchColumns?: string[];
    frontendFilters?: FilterConfig[];
    dataRequest?: DataRequest;
}

export interface DataTableProps {
    binding: DataTableBinding;
    initialData?: any[];
    initialTotal?: number;
    className?: string;
}

// Feature flag
const USE_UNIFIED_DATATABLE = true; // Set to false to use legacy

/**
 * Edge DataTable Component
 * 
 * Uses the unified @frontbase/datatable package.
 */
export function DataTable({
    binding,
    initialData = [],
    initialTotal = 0,
    className
}: DataTableProps) {
    // Map to unified binding format
    const unifiedBinding: UnifiedBinding = {
        ...binding,
    };

    return (
        <UnifiedDataTable
            mode="edge"
            binding={unifiedBinding}
            initialData={initialData}
            initialTotal={initialTotal}
            className={className}
        />
    );
}

export default DataTable;
