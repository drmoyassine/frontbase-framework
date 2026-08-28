/**
 * @frontbase/types — shared types for data-bound UI components.
 *
 * Single source of truth for the data-binding contract used by the
 * Chart, Grid and KPICard packages (and any future data component).
 * Keep this dependency-free so every package can consume it cheaply.
 */

/**
 * Per-column display configuration set in the Builder.
 */
export interface ColumnOverride {
    visible?: boolean;
    displayName?: string;
    displayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'cover' | 'link' | 'boolean';
    /**
     * Show the field label on the card (default: true). When `false`, the Grid /
     * Repeater render only the value, dropping the label span. Grid/Repeater only.
     */
    showLabel?: boolean;
    /** date-fns-style format string for `displayType: 'date'`. */
    dateFormat?: string;
}

export type HiddenFilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'in' | 'is_null' | 'not_null'
  | 'is_before' | 'is_after' | 'is_on_or_before' | 'is_on_or_after'
  | 'is_within_last_days' | 'is_today';

export interface HiddenFilter {
  id: string;
  column: string;
  operator: HiddenFilterOperator;
  value?: string;
  previewValue?: string;
}

/**
 * The unified data-binding object passed by the Builder at design time and
 * baked by the Edge publisher (carrying a `dataRequest`) at publish time.
 */
export interface ComponentDataBinding {
    componentId: string;
    dataSourceId: string;
    tableName: string;
    refreshInterval?: number;
    pagination: {
        enabled: boolean;
        pageSize: number;
        page: number;
    };
    sorting: {
        enabled: boolean;
        column?: string;
        direction?: 'asc' | 'desc';
    };
    filtering: {
        searchEnabled: boolean;
        filters: Record<string, any>;
    };
    columnOverrides: Record<string, ColumnOverride>;
    columnOrder?: string[];
    hiddenFilters?: HiddenFilter[];
    _resolvedHiddenFilters?: any[];
    _pendingHiddenFilters?: any[];
    dataRequest?: any;
    chartConfig?: {
        /** Column to group by — the X-axis / pie-slice category. */
        category?: string;
        /** Aggregation applied per category. 'count' needs no value column. */
        aggregation?: 'count' | 'sum' | 'average' | 'min' | 'max';
        /** Numeric column to aggregate. Required for everything except 'count'. */
        value?: string;
        /** Sort categories by aggregated value. */
        sort?: 'none' | 'asc' | 'desc';
        variant?: 'vertical' | 'horizontal';
        maxRows?: number;
    };
}

export interface WireFilter {
    column: string;
    op?: string;
    filterType?: string;
    value?: any;
}

// ============ Structured Query Contract (Phase 0) ============
//
// One query shape emitted by every data component (Chart, DataTable, KPI),
// fulfilled differently per datasource. The front-end and publish layers only
// ever produce RowsQuery / AggregateQuery; the edge dispatches on `mode`.

/** A single JOIN clause in a RowsQuery. */
export interface Join {
    /** Table to join. */
    table: string;
    /** Column on the source table (left side). */
    fromColumn?: string;
    /** Column on the joined table (right side). */
    toColumn?: string;
    /** Raw ON expression for non-FK joins (takes precedence when set). */
    on?: string;
    /** Optional alias for the joined table. */
    alias?: string;
    /** Join type (default 'left'). */
    type?: 'left' | 'inner' | 'right' | 'full';
    [key: string]: unknown;
}

/** Row-fetch query — the common case for tables, lists, charts of raw rows. */
export interface RowsQuery {
    kind: 'rows';
    table: string;
    /** Select list (already computed at publish time), e.g. '"users"."id","users"."name"'. */
    columns?: string;
    joins?: Join[];
    /** User filters + resolved hidden filters, merged. */
    filters: WireFilter[];
    search?: string;
    searchColumns?: string[];
    sort?: { column: string; direction: 'asc' | 'desc' } | null;
    /** 0-based page index. */
    page: number;
    pageSize: number;
}

/** Aggregation query — GROUP BY category for charts/KPIs. */
export interface AggregateQuery {
    kind: 'aggregate';
    table: string;
    category: string;
    aggregation: 'count' | 'sum' | 'average' | 'min' | 'max';
    value?: string;
    filters: WireFilter[];
    sort: 'none' | 'asc' | 'desc';
    limit: number;
}

/** Union of the two query shapes. */
export type StructuredQuery = RowsQuery | AggregateQuery;

/** Result of a RowsQuery. */
export interface RowsResult {
    rows: any[];
    total: number;
}

/** Result of an AggregateQuery. */
export interface AggregateResultItem {
    category: string;
    value: number;
}

export type QueryResult = RowsResult | AggregateResultItem[];

/**
 * How a datasource fulfills the contract. The edge dispatches on this.
 *  - direct-rpc : Supabase — SQL built in DB (frontbase_* RPCs), browser → PostgREST
 *  - proxy-rpc  : Neon/Postgres — frontbase_* installed there, edge → /sql
 *  - proxy-sql  : MySQL/Turso — SQL built in edge (queryBuilder), edge → dialect HTTP
 *  - proxy-http : Google Sheets / REST — query fulfilled by a remote Web App / API
 */
export type QueryMode = 'direct-rpc' | 'proxy-rpc' | 'proxy-sql' | 'proxy-http';

/** The publish-time/baked instruction that selects a fulfillment mode. */
export interface QueryDispatch {
    mode: QueryMode;
    /** For proxy modes: which datasource to resolve credentials for. */
    datasourceId?: string;
    /** Dialect hint for proxy-sql (e.g. 'mysql' | 'sqlite'). */
    dialect?: string;
    /** The structured query itself. */
    spec: StructuredQuery;
}

/** Hidden-filter operators that are UI sugar for date/time ranges. */
export const DATE_OPERATORS = [
    'is_before', 'is_after', 'is_on_or_before', 'is_on_or_after',
    'is_within_last_days', 'is_today',
] as const;

export { executeQuery } from './executeQuery';
export type {
    ExecuteQueryBinding,
    ExecuteQueryOptions,
} from './executeQuery';

/**
 * Desugar a date/time hidden-filter operator into standard wire operators
 * (lt/lte/gt/gte) carrying concrete ISO-8601 values, evaluated in **UTC**.
 *
 * This is the single source of truth for date-operator handling; every resolve
 * site (builder preview, edge runtime, datatable & chart packages) must call it
 * rather than re-implementing the mapping.
 *
 * `value` must already be template-resolved by the caller.
 *
 * Returns:
 *  - `null` when `op` is not a date operator — the caller handles it normally.
 *  - `[]`   when it is a date operator but resolves to nothing (empty absolute
 *           value, or a non-positive/invalid day count) — i.e. the filter is dropped.
 *  - one WireFilter for absolute/relative bounds, or **two** for a full-day range
 *    (`is_today`).
 */
export function resolveDateOperator(filter: { column: string; op?: string; value?: any }): WireFilter[] | null {
    const { column, op, value } = filter;

    switch (op) {
        case 'is_before':
        case 'is_after':
        case 'is_on_or_before':
        case 'is_on_or_after': {
            if (value === undefined || value === null || String(value).trim() === '') return [];
            const mapped = op === 'is_before' ? 'lt'
                : op === 'is_after' ? 'gt'
                : op === 'is_on_or_before' ? 'lte'
                : 'gte';
            return [{ column, op: mapped, value }];
        }
        case 'is_within_last_days': {
            const days = parseInt(value ?? '0', 10);
            if (isNaN(days) || days <= 0) return []; // invalid — drop it
            const date = new Date();
            date.setUTCDate(date.getUTCDate() - days);
            return [{ column, op: 'gte', value: date.toISOString() }];
        }
        case 'is_today': {
            const start = new Date();
            start.setUTCHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 1);
            return [
                { column, op: 'gte', value: start.toISOString() },
                { column, op: 'lt', value: end.toISOString() },
            ];
        }
        default:
            return null;
    }
}
