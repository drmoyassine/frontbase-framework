/**
 * @frontbase/datatable
 * 
 * Unified DataTable component for Frontbase builder and edge environments.
 */

// Main component
export { DataTable } from './DataTable';
export { default } from './DataTable';

// Types
export type {
    DataTableProps,
    DataTableBinding,
    ColumnOverride,
    FilterConfig,
    DataRequest,
    QueryConfig,
    DataFetcherConfig,
    DataFetcherResult,
} from './types';

// Hooks
export { useDataTableData } from './hooks/useDataTableData';
export { useFilterOptions } from './hooks/useFilterOptions';

// Components
export { SearchableSelect } from './components/SearchableSelect';
export { SearchableMultiSelect } from './components/SearchableMultiSelect';
export { FilterBar } from './components/FilterBar';
export { TableHeader } from './components/TableHeader';
export { TableBody } from './components/TableBody';
export { Pagination } from './components/Pagination';

// Utilities
export { getCellValue } from './utils/getCellValue';
export { formatHeader } from './utils/formatHeader';
export { renderCell } from './utils/renderCell';
export { cn } from './lib/utils';
