/**
 * Publish-time binding enrichment — the framework port of the product's
 * publish_serializer.convert_component + data_request.compute_data_request.
 *
 * The product enriches bindings at PAGE-SERVE time (FastAPI public.py →
 * convert_component → compute_data_request) so the client hydration runtime
 * (hydrate.js rH, mode "edge") has a dataRequest to execute. Without it the
 * DataTable silently renders "No data available" (rH: no url && no queryConfig
 * → empty).
 *
 * DELIBERATE DIVERGENCE (2026-08-21): the builder canvas enriches too — the
 * product's canvas shows "No data available" (its enrichment is serve-path
 * only), which reads as broken to builders. The console page reads run
 * enrichLayoutBindings; the save paths run stripLayoutEnrichment so the baked
 * dataRequest (and the normalization copies below) never persist into the
 * stored layout, where a stale queryConfig could shadow later binding edits.
 *
 * Strategy mapping (one deliberate divergence from the product):
 *   - Product, Supabase + http ds_url → fetchStrategy 'direct' (browser POSTs
 *     {ds_url}/rest/v1/rpc/frontbase_get_rows with the public anonKey).
 *   - Product, Supabase + pooler DSN → returns None (no dataRequest at all —
 *     the page shows no data, the known gap for Management-API connections).
 *   - Framework → ALWAYS 'proxy': the client POSTs /api/data/execute with
 *     {datasourceId, queryConfig, body}; the worker resolves credentials
 *     server-side and calls the datasource's own frontbase_get_rows /
 *     frontbase_search_rows RPC (installed by the sync flow). Credentials never
 *     reach the client (same property the product's proxy strategy documents).
 *
 * The baked queryConfig carries the RPC-shaped fields rH rebuilds each fetch
 * from (table_name, columns SQL list, joins, searchColumns, sort fallbacks) so
 * live pagination / sorting / filtering survive — the client never uses the
 * baked `body`.
 */

/** Minimal datasource shape enrichment needs (SyncStore DatasourceRecord subset). */
export interface EnrichableDatasource {
    id: string;
    kind: string;
    config?: Record<string, unknown>;
}

/**
 * Table-column snapshot (inspectTable's ColumnInfo shape — the same keys the
 * schema/ route returns and the Form/InfoList edge hooks parse from
 * `binding.columns`).
 */
export interface SchemaColumnSnapshot {
    name: string;
    type: string;
    nullable: boolean;
    primary_key: boolean;
    default_value: unknown;
}

interface Binding {
    [key: string]: unknown;
}

/** SQL string literal (PG): single quotes doubled. */
export function sqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Quote a PG identifier, preserving case (table/column names contain spaces). */
export function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Build the SQL select-list string baked into queryConfig.columns — same shape
 * the product's _compute_supabase_request produces (the RPC splices `columns`
 * RAW into `SELECT {columns} FROM %I …`, so case-preservation matters):
 *   'tbl.col'  → "tbl"."col" AS "tbl.col"
 *   'col'      → "T"."col"
 *   '*' / ''   → "T".*
 */
export function buildColumnsSql(tableName: string, rawColumnOrder: unknown): string {
    const columnOrder: string[] = [];
    if (Array.isArray(rawColumnOrder)) {
        for (const c of rawColumnOrder) {
            if (typeof c === 'string') columnOrder.push(c);
            else if (c && typeof c === 'object' && 'name' in c) {
                const n = (c as { name?: unknown }).name;
                if (typeof n === 'string' && n) columnOrder.push(n);
            }
        }
    }
    const t = quoteIdent(tableName);
    if (columnOrder.length === 0) return `${t}.*`;

    const parts: string[] = [];
    for (const col of columnOrder) {
        if (col.includes('.')) {
            const dot = col.indexOf('.');
            const a = col.slice(0, dot);
            const b = col.slice(dot + 1);
            if (a && b) {
                parts.push(`${quoteIdent(a)}.${quoteIdent(b)} AS ${quoteIdent(col)}`);
            }
        } else if (col === '*') {
            if (!parts.some((p) => p.endsWith('.*'))) parts.push(`${t}.*`);
        } else {
            parts.push(`${t}.${quoteIdent(col)}`);
        }
    }
    return parts.length ? parts.join(', ') : `${t}.*`;
}

/**
 * JOIN specs from binding-level foreignKeys ({column, referencedTable,
 * referencedColumn} — the edge Zod format convert_component also consumes).
 * ON conditions are fully quoted — the RPC splices join `on` strings raw into
 * dynamic SQL, so quoting is what keeps them identifiers.
 */
export function buildJoinsFromBinding(tableName: string, foreignKeys: unknown): Array<{ type: string; table: string; on: string }> {
    if (!Array.isArray(foreignKeys)) return [];
    const joins: Array<{ type: string; table: string; on: string }> = [];
    for (const fk of foreignKeys) {
        if (!fk || typeof fk !== 'object') continue;
        const col = (fk as Record<string, unknown>).column;
        const refTable = (fk as Record<string, unknown>).referencedTable ?? (fk as Record<string, unknown>).referenced_table;
        const refCol = (fk as Record<string, unknown>).referencedColumn ?? (fk as Record<string, unknown>).referenced_column;
        if (typeof col === 'string' && col && typeof refTable === 'string' && refTable && typeof refCol === 'string' && refCol) {
            joins.push({
                type: 'left',
                table: refTable,
                on: `${quoteIdent(tableName)}.${quoteIdent(col)} = ${quoteIdent(refTable)}.${quoteIdent(refCol)}`,
            });
        }
    }
    return joins;
}

/**
 * Aggregate SELECT for a chart binding (the product's publish-time bake — its
 * edge hook fse detects `queryConfig.isChartAggregate` and POSTs `body.query`
 * to /api/data/execute, rewriting the __HF__ marker (a C-style comment in the
 * SQL text) into hidden-filter conditions client-side: sse() replaces the
 * marker with ose(filters) which is either '' or ' AND cond AND cond…'.
 * Positioning the marker directly after `TRUE` therefore yields valid SQL in
 * both cases.
 */
export function buildChartAggregateQuery(
    tableName: string,
    chartConfig: Record<string, unknown>,
): string | null {
    const category = strOrNull(chartConfig.category);
    if (!category) return null;
    const aggregation = (strOrNull(chartConfig.aggregation) ?? 'count').toLowerCase();
    const value = strOrNull(chartConfig.value);
    const expression = aggregation === 'count' ? 'COUNT(*)'
        : (value && ['sum', 'average', 'avg', 'min', 'max'].includes(aggregation))
            ? `${aggregation === 'average' ? 'AVG' : aggregation.toUpperCase()}(${quoteIdent(value)})`
            : null;
    if (!expression) return null;
    const limit = typeof chartConfig.maxRows === 'number' && chartConfig.maxRows > 0
        ? Math.min(Math.floor(chartConfig.maxRows), 1000)
        : 10;
    const sort = strOrNull(chartConfig.sort);
    const orderClause = sort === 'asc' || sort === 'desc' ? ` ORDER BY value ${sort.toUpperCase()}` : '';
    return `SELECT ${quoteIdent(category)} AS category, ${expression} AS value `
        + `FROM ${quoteIdent(tableName)} WHERE TRUE/*__HF__*/ `
        + `GROUP BY ${quoteIdent(category)}${orderClause} LIMIT ${limit}`;
}

/**
 * Compute the proxy-strategy dataRequest for a binding. Returns null when the
 * binding has no tableName (nothing to query — matching compute_data_request).
 * `queryConfig.rpcUrl` stays '' — the worker resolves the RPC endpoint from the
 * datasource server-side; no URL or key is baked into the page.
 */
export function computeProxyDataRequest(binding: Binding, datasource: EnrichableDatasource): Record<string, unknown> | null {
    const tableName = strOrNull(binding.tableName) ?? strOrNull(binding.table_name);
    if (!tableName) return null;

    // Chart bindings with a category aggregate server-side: the client's fse
    // hook posts `body.query` verbatim (hidden filters rewrite the marker).
    const chartConfig = (binding.chartConfig && typeof binding.chartConfig === 'object'
        ? binding.chartConfig : null) as Record<string, unknown> | null;
    const chartQuery = chartConfig ? buildChartAggregateQuery(tableName, chartConfig) : null;
    if (chartConfig?.category && !chartQuery) return null; // unsupported aggregation — no dataRequest

    // columnOrder is authoritative; fall back to `columns` (product maps both).
    const columnOrder = Array.isArray(binding.columnOrder) && binding.columnOrder.length
        ? binding.columnOrder
        : binding.columns;
    const columnsSql = buildColumnsSql(tableName, columnOrder);
    const joins = buildJoinsFromBinding(tableName, binding.foreignKeys ?? binding.foreign_keys);

    const pagination = (binding.pagination && typeof binding.pagination === 'object'
        ? binding.pagination : {}) as Record<string, unknown>;
    const sorting = (binding.sorting && typeof binding.sorting === 'object'
        ? binding.sorting : {}) as Record<string, unknown>;
    const pageSize = typeof pagination.pageSize === 'number' && pagination.pageSize > 0
        ? Math.min(Math.floor(pagination.pageSize), 500)
        : (pagination.enabled === false ? 1000 : 20);
    const sortColumn = sorting.enabled === false ? null : strOrNull(sorting.column);
    const sortDirection = strOrNull(sorting.direction) === 'desc' ? 'desc' : 'asc';

    if (chartQuery) {
        return {
            url: '',
            method: 'POST',
            fetchStrategy: 'proxy',
            datasourceId: datasource.id,
            headers: {},
            body: { query: chartQuery, params: [] },
            resultPath: 'rows',
            flattenRelations: false,
            queryConfig: {
                useRpc: true,
                rpcUrl: '',
                tableName,
                columns: columnsSql,
                joins,
                pageSize,
                sortColumn,
                sortDirection,
                searchColumns: Array.isArray(binding.searchColumns) ? binding.searchColumns : [],
                frontendFilters: Array.isArray(binding.frontendFilters) ? binding.frontendFilters : [],
                hiddenFilters: Array.isArray(binding.hiddenFilters) ? binding.hiddenFilters : [],
                isChartAggregate: true,
            },
        };
    }

    return {
        url: '',
        method: 'POST',
        fetchStrategy: 'proxy',
        datasourceId: datasource.id,
        headers: {},
        // RPC-shaped skeleton (product parity). Grid/KPI/DataTable REBUILD the
        // body client-side from queryConfig; Form/InfoList record loads spread
        // `{...body, query}` (table_name present, query wins server-side) or
        // `{...body, filters}` (page-size-1 RPC row) — both need these fields.
        body: {
            table_name: tableName,
            columns: columnsSql,
            joins,
            page: 1,
            page_size: pageSize,
            filters: [],
        },
        resultPath: 'rows',
        flattenRelations: false,
        queryConfig: {
            useRpc: true,
            rpcUrl: '',
            tableName,
            columns: columnsSql,
            joins,
            pageSize,
            sortColumn,
            sortDirection,
            searchColumns: Array.isArray(binding.searchColumns) ? binding.searchColumns : [],
            frontendFilters: Array.isArray(binding.frontendFilters) ? binding.frontendFilters : [],
            hiddenFilters: Array.isArray(binding.hiddenFilters) ? binding.hiddenFilters : [],
        },
    };
}

function strOrNull(v: unknown): string | null {
    return typeof v === 'string' && v ? v : null;
}

/**
 * Walk a layout tree and attach `binding.dataRequest` to every component bound
 * to a known datasource (the port of convert_component's enrichment step —
 * generic across DataTable/Form/InfoList, like the product's). Also normalizes
 * props.binding → binding and maps columns → columnOrder the way the product
 * does before enrichment. Mutates the parsed layout in place (it is re-parsed
 * per request); returns the same object for convenience.
 *
 * `schemas` (optional, keyed `${datasourceId}::${table}`) additionally bakes
 * `binding.columns` — the schema snapshot Form/InfoList edge hooks need (their
 * edge mode has no schema endpoint; empty columns render "No schema available
 * for '<table>'. Try re-publishing").
 */
export function enrichLayoutBindings(
    layout: unknown,
    datasources: EnrichableDatasource[],
    schemas?: Map<string, SchemaColumnSnapshot[]>,
): unknown {
    if (!Array.isArray(datasources) || datasources.length === 0) return layout;
    const byId = new Map(datasources.map((d) => [d.id, d]));

    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!node || typeof node !== 'object') return;
        const comp = node as Record<string, unknown>;

        // normalize_binding_location: props.binding → binding (builder-fresh layouts)
        const props = comp.props;
        if (props && typeof props === 'object' && !Array.isArray(props)) {
            const propsBinding = (props as Record<string, unknown>).binding;
            if (propsBinding && typeof propsBinding === 'object' && !comp.binding) {
                comp.binding = propsBinding;
            }
        }

        const binding = comp.binding;
        if (binding && typeof binding === 'object' && !Array.isArray(binding)) {
            const b = binding as Binding;
            const dsId = strOrNull(b.dataSourceId) ?? strOrNull(b.datasourceId) ?? strOrNull(b.datasource_id);
            const ds = dsId ? byId.get(dsId) : undefined;
            if (ds) {
                if (!strOrNull(b.datasourceId)) b.datasourceId = ds.id;
                // product parity: columns → columnOrder (React DataTable reads
                // columnOrder). Strings only — Form/InfoList `columns` are
                // schema OBJECTS (snapshot bake below), never a name list.
                if (Array.isArray(b.columns) && b.columns.length
                    && b.columns.every((c) => typeof c === 'string')
                    && !Array.isArray(b.columnOrder)) {
                    b.columnOrder = b.columns;
                }
                if (!b.dataRequest) {
                    const dataRequest = computeProxyDataRequest(b, ds);
                    if (dataRequest) b.dataRequest = dataRequest;
                }
                // Schema snapshot bake — Form/InfoList edge hooks render fields
                // from binding.columns (no live schema fetch in edge mode).
                // Gated to those types: DataTable `columns` is an authored name
                // list, never a snapshot target. The schemaSnapshot flag marks
                // the bake as ours so strip can remove exactly these columns —
                // shape heuristics can't (authored Form columns are objects too).
                if ((comp.type === 'Form' || comp.type === 'InfoList')
                    && schemas && !(Array.isArray(b.columns) && b.columns.length)) {
                    const table = strOrNull(b.tableName) ?? strOrNull(b.table_name);
                    const snapshot = table ? schemas.get(`${ds.id}::${table}`) : undefined;
                    if (snapshot && snapshot.length > 0) {
                        b.columns = snapshot;
                        b.schemaSnapshot = true;
                    }
                }
            }
        }

        // Recurse: children arrays + nested component containers (columns → widgets).
        for (const value of Object.values(comp)) {
            if (value && typeof value === 'object') walk(value);
        }
    };

    walk(layout);
    return layout;
}

/**
 * Revert everything enrichLayoutBindings added — the save-path counterpart to
 * enrich-on-read. The console builder round-trips the layout it holds, so
 * without this the baked dataRequest and the normalization copies would be
 * persisted into stored layouts, where a stale queryConfig (old table, old
 * columns) could shadow later binding edits. Removes ONLY our artifacts:
 *   - comp.binding when props.binding also exists (the normalization alias —
 *     the builder authors props.binding, never both);
 *   - binding.dataRequest when it is OURS (proxy + empty url). A pre-existing
 *     dataRequest (e.g. a legacy direct-strategy request) is left alone;
 *   - binding.columns + the schemaSnapshot flag when the schema bake set them
 *     (authored columns never carry the flag);
 *   - binding.columnOrder when it duplicates `columns`;
 *   - binding.datasourceId when a dataSourceId/datasource_id variant remains.
 * Accepts a JSON string layout (parse → strip → re-stringify). Mutates in
 * place; returns the same value (same type as the input).
 */
export function stripLayoutEnrichment(layout: unknown): unknown {
    if (typeof layout === 'string') {
        try { return JSON.stringify(stripLayoutEnrichment(JSON.parse(layout))); } catch { return layout; }
    }
    if (!layout || typeof layout !== 'object') return layout;

    const stripBinding = (b: Record<string, unknown>): void => {
        const dr = b.dataRequest as Record<string, unknown> | undefined;
        const ours = !!(dr && typeof dr === 'object' && dr.fetchStrategy === 'proxy' && !dr.url);
        if (ours) {
            delete b.dataRequest;
            // Remove the schema snapshot bake when its marker is present — and
            // only then (authored Form columns are objects too; shape cannot
            // tell them apart, the flag can).
            if (b.schemaSnapshot === true) {
                delete b.columns;
                delete b.schemaSnapshot;
            }
        }
        if (Array.isArray(b.columnOrder) && Array.isArray(b.columns)
            && JSON.stringify(b.columnOrder) === JSON.stringify(b.columns)) {
            delete b.columnOrder;
        }
        if (b.datasourceId !== undefined && (b.dataSourceId !== undefined || b.datasource_id !== undefined)) {
            delete b.datasourceId;
        }
    };

    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!node || typeof node !== 'object') return;
        const comp = node as Record<string, unknown>;

        const props = comp.props;
        if (props && typeof props === 'object' && !Array.isArray(props)) {
            if ((props as Record<string, unknown>).binding && comp.binding) {
                delete comp.binding; // our normalization alias — props.binding is authoritative
            }
        }
        const binding = comp.binding ?? (props && typeof props === 'object' && !Array.isArray(props)
            ? (props as Record<string, unknown>).binding : undefined);
        if (binding && typeof binding === 'object' && !Array.isArray(binding)) {
            stripBinding(binding as Record<string, unknown>);
        }

        for (const value of Object.values(comp)) {
            if (value && typeof value === 'object') walk(value);
        }
    };

    walk(layout);
    return layout;
}
