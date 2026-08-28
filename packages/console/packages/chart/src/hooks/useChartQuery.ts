import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ComponentDataBinding } from '../types';
import { resolveDateOperator } from '@frontbase/types';

interface UseChartQueryProps {
    mode: 'builder' | 'edge';
    binding: ComponentDataBinding;
    initialData?: any[];
    enabled?: boolean;
}

/**
 * Resolves variables in a template string on the client using the global VariableStore.
 */
function resolveClientTemplate(template: string, store: { get(scope: string, key: string): any }): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
        const [scope, ...rest] = String(expr).trim().split('.');
        const val = store.get(scope, rest.join('.'));
        return val !== undefined && val !== null ? String(val) : '';
    });
}

/** Quote a SQL identifier (supports dotted table.column), escaping embedded quotes. */
function sqlIdent(name: string): string {
    return String(name).split('.').map(p => '"' + p.replace(/"/g, '""') + '"').join('.');
}

/** Quote a SQL string literal, escaping single quotes. */
function sqlLit(value: any): string {
    return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * Build a ` AND <cond> AND <cond>` fragment from already-resolved hidden filters
 * ({ column, op, value }). Mirrors the Postgres dialect of chart_aggregation.py
 * so published-chart filtering matches the builder/datatable paths.
 */
function buildHiddenWhereSql(filters: any[]): string {
    const conds: string[] = [];
    for (const f of filters || []) {
        const col = f?.column;
        if (!col) continue;
        const op = f.op || f.operator || 'eq';
        const c = sqlIdent(col);
        if (op === 'is_null') { conds.push(`${c} IS NULL`); continue; }
        if (op === 'not_null') { conds.push(`${c} IS NOT NULL`); continue; }
        const v = f.value;
        if (v === undefined || v === null || v === '') continue;
        switch (op) {
            case 'eq': conds.push(`${c} = ${sqlLit(v)}`); break;
            case 'neq': conds.push(`${c} IS DISTINCT FROM ${sqlLit(v)}`); break;
            case 'gt': conds.push(`${c} > ${sqlLit(v)}`); break;
            case 'gte': conds.push(`${c} >= ${sqlLit(v)}`); break;
            case 'lt': conds.push(`${c} < ${sqlLit(v)}`); break;
            case 'lte': conds.push(`${c} <= ${sqlLit(v)}`); break;
            case 'contains': conds.push(`CAST(${c} AS TEXT) ILIKE ${sqlLit('%' + v + '%')}`); break;
            case 'in': {
                const arr = Array.isArray(v) ? v : String(v).split(',').map(s => s.trim()).filter(Boolean);
                if (arr.length) conds.push(`${c} IN (${arr.map(sqlLit).join(', ')})`);
                break;
            }
        }
    }
    return conds.length ? ' AND ' + conds.join(' AND ') : '';
}

/** Replace the publish-baked /*__HF__*​/ marker with resolved hidden-filter conditions. */
function injectHiddenFilters(query: string, filters: any[]): string {
    if (typeof query !== 'string' || !query.includes('/*__HF__*/')) return query;
    const fragment = buildHiddenWhereSql(filters);
    // Function replacement avoids `$`-pattern interpretation in the fragment.
    return query.replace('/*__HF__*/', () => fragment);
}

/** Resolve raw hidden filters for builder preview (url/system context + previewValue). */
function resolveBuilderHiddenFilters(hidden: any[] | undefined): any[] {
    if (!hidden || hidden.length === 0) return [];
    const url = typeof window !== 'undefined'
        ? Object.fromEntries(new URLSearchParams(window.location.search))
        : {};
    const ctx: Record<string, any> = { url, system: { date: new Date().toISOString() } };
    const out: any[] = [];
    for (const f of hidden) {
        const op = f.operator;
        if (op === 'is_null' || op === 'not_null') { out.push({ column: f.column, op }); continue; }

        let val = f.value;
        if (typeof val === 'string' && val.includes('{{')) {
            val = val.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m: string, expr: string) => {
                let cur: any = ctx;
                for (const part of String(expr).trim().split('.')) {
                    if (cur == null) break;
                    cur = cur[part];
                }
                return cur !== undefined && cur !== null ? String(cur) : '';
            });
            if (!val || !String(val).trim()) val = f.previewValue || '';
        }

        // Date operators desugar to lt/lte/gt/gte (UTC) via the shared helper.
        const dateExpanded = resolveDateOperator({ column: f.column, op, value: val });
        if (dateExpanded !== null) { out.push(...dateExpanded); continue; }

        if (val !== undefined && val !== null && String(val).trim() !== '') {
            if (op === 'in') val = String(val).split(',').map((s: string) => s.trim()).filter(Boolean);
            out.push({ column: f.column, op, value: val });
        }
    }
    return out;
}

function resolveEnvVars(template: string): string {
    if (typeof window === 'undefined') {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return (process.env as Record<string, string>)[key] || '';
        });
    } else {
        return template;
    }
}

/** Build the [{field, operator, value}] filter list the data APIs expect. */
function buildFilterList(binding: ComponentDataBinding) {
    if (!binding.filtering?.filters) return [];
    return Object.entries(binding.filtering.filters)
        .filter(([_, v]) => v != null && v !== '')
        .map(([field, value]) => ({
            field,
            operator: '==',
            value: typeof value === 'object' && value && 'value' in value ? (value as any).value : value,
        }));
}

async function fetchAggregateFromBuilder(binding: ComponentDataBinding) {
    const cfg = binding.chartConfig!;
    const params = new URLSearchParams();
    params.append('category', cfg.category!);
    params.append('aggregation', cfg.aggregation || 'count');
    if (cfg.value) params.append('value', cfg.value);
    params.append('sort', cfg.sort || 'none');
    params.append('limit', String(cfg.maxRows || 10));
    const filterList = buildFilterList(binding);
    if (filterList.length > 0) params.append('filters', JSON.stringify(filterList));

    const hiddenFilters = binding._resolvedHiddenFilters || [];
    if (hiddenFilters.length > 0) {
        params.append('hidden_filters', JSON.stringify(hiddenFilters));
    }

    const response = await fetch(
        `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/aggregate/?${params}`
    );
    if (!response.ok) {
        throw new Error('Failed to fetch chart data');
    }
    const result = await response.json();
    return result.records || [];
}

async function fetchFromBuilder(binding: ComponentDataBinding) {
    // Charts aggregate in the database (GROUP BY) so counts/sums are correct for
    // the whole table rather than a fetched page.
    if (binding.chartConfig?.category) {
        return fetchAggregateFromBuilder(binding);
    }

    const params = new URLSearchParams();
    // Default limit to 10 for charts, or use pageSize if pagination enabled
    const limit = binding.pagination?.enabled ? binding.pagination.pageSize : 10;
    params.append('limit', String(limit));
    params.append('offset', '0');

    if (binding.sorting?.column) {
        params.append('sort', binding.sorting.column);
        params.append('order', binding.sorting.direction || 'asc');
    }

    // Add filters & hidden filters
    const filterList = [
        ...buildFilterList(binding),
        ...(binding._resolvedHiddenFilters || [])
    ];
    if (filterList.length > 0) {
        params.append('filters', JSON.stringify(filterList));
    }

    const response = await fetch(
        `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/data?${params}`
    );

    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }

    const result = await response.json();
    return result.records || [];
}

async function fetchFromEdge(binding: ComponentDataBinding) {
    const dataRequest = binding.dataRequest;
    if (!dataRequest) {
        return [];
    }

    const queryConfig = dataRequest.queryConfig;
    const strategy = dataRequest.fetchStrategy || 'proxy';

    // Chart aggregation: the publish step bakes a GROUP BY request (exec_sql for
    // Supabase-direct, or a SQL queryConfig for the proxy). Send it as-is and
    // return the already-aggregated [{category, value}] rows.
    if (binding.chartConfig?.category && (queryConfig as any)?.isChartAggregate) {
        // Inject already-resolved hidden filters into the baked GROUP BY SQL at the
        // /*__HF__*/ marker. Values are resolved (server scopes at SSR, client scopes
        // in the hook) and safely escaped here.
        const resolvedHidden = (binding as any)._resolvedHiddenFilters || [];
        const aggBody: Record<string, any> = { ...(dataRequest.body || {}) };
        if (typeof aggBody.query === 'string') {
            aggBody.query = injectHiddenFilters(aggBody.query, resolvedHidden);
        }
        if (Array.isArray(aggBody.filters)) {
            aggBody.filters = [...aggBody.filters, ...resolvedHidden];
        }

        if (strategy === 'direct') {
            const url = resolveEnvVars(dataRequest.url);
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(dataRequest.headers || {})) {
                headers[key] = resolveEnvVars(value as string);
            }
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(aggBody),
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch chart data (HTTP ${response.status})`);
            }
            return (await response.json()) || [];
        }
        const datasourceId = dataRequest.datasourceId || binding.dataSourceId;
        const response = await fetch('/api/data/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataRequest: {
                    fetchStrategy: 'proxy',
                    datasourceId,
                    method: 'POST',
                    queryConfig: dataRequest.queryConfig || {},
                    body: aggBody,
                    resultPath: dataRequest.resultPath ?? '',
                    flattenRelations: false,
                },
            }),
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch chart data');
        }
        return result.data?.rows || result.data || [];
    }
    const limit = binding.pagination?.enabled ? binding.pagination.pageSize : 10;

    // Build query body
    const queryBody: Record<string, any> = {
        table_name: queryConfig?.tableName || binding.tableName,
        columns: queryConfig?.columns || '*',
        joins: queryConfig?.joins || [],
        page: 1,
        page_size: limit,
        filters: binding._resolvedHiddenFilters || [],
    };

    if (binding.sorting?.column) {
        queryBody.sort_col = binding.sorting.column;
        queryBody.sort_dir = binding.sorting.direction || 'asc';
    }

    if (strategy === 'direct') {
        const url = resolveEnvVars(dataRequest.url);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(dataRequest.headers || {})) {
            headers[key] = resolveEnvVars(value as string);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(queryBody),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data (HTTP ${response.status})`);
        }

        const result = await response.json();
        return result.rows || result.data || [];
    } else {
        const datasourceId = dataRequest.datasourceId || binding.dataSourceId;
        const response = await fetch('/api/data/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataRequest: {
                    fetchStrategy: 'proxy',
                    datasourceId,
                    method: 'POST',
                    queryConfig: dataRequest.queryConfig || {},
                    body: queryBody,
                    resultPath: dataRequest.resultPath || 'rows',
                    flattenRelations: dataRequest.flattenRelations ?? false,
                },
            }),
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch data');
        }
        return result.data?.rows || result.data || [];
    }
}

export function useChartQuery({
    mode,
    binding,
    initialData,
    enabled = true,
}: UseChartQueryProps) {
    const [storeVersion, setStoreVersion] = useState(0);

    useEffect(() => {
        const store = typeof window !== 'undefined' ? (window as any).__VARIABLE_STORE__ : null;
        if (!store) return;
        return store.subscribe(() => {
            setStoreVersion((v) => v + 1);
        });
    }, []);

    const resolvedHiddenFilters = useMemo(() => {
        // Builder preview has no SSR-injected _resolved/_pending fields — resolve the
        // raw authored hidden filters against the builder context (url/system).
        if (mode === 'builder') {
            return resolveBuilderHiddenFilters(binding.hiddenFilters);
        }

        const resolvedList = [...(binding._resolvedHiddenFilters || [])];
        const pendingList = binding._pendingHiddenFilters || [];
        const store = typeof window !== 'undefined' ? (window as any).__VARIABLE_STORE__ : null;

        for (const filter of pendingList) {
            const operator = filter.operator;
            if (operator === 'is_null' || operator === 'not_null') {
                resolvedList.push({
                    column: filter.column,
                    op: operator,
                });
                continue;
            }

            const value = filter.value;
            let resolvedVal: any = '';
            if (typeof value === 'string') {
                if (store) {
                    resolvedVal = resolveClientTemplate(value, store);
                } else {
                    resolvedVal = filter.previewValue || '';
                }
            } else {
                resolvedVal = value;
            }

            // Date operators desugar to lt/lte/gt/gte (UTC) via the shared helper,
            // which also emits the two-bound range for is_today.
            const dateExpanded = resolveDateOperator({ column: filter.column, op: operator, value: resolvedVal });
            if (dateExpanded !== null) {
                resolvedList.push(...dateExpanded);
                continue;
            }

            if (resolvedVal !== undefined && resolvedVal !== null && String(resolvedVal).trim() !== '') {
                if (operator === 'in') {
                    resolvedVal = String(resolvedVal).split(',').map((s: string) => s.trim()).filter(Boolean);
                }
                resolvedList.push({ column: filter.column, op: operator, value: resolvedVal });
            }
        }
        return resolvedList;
    }, [mode, binding.hiddenFilters, binding._resolvedHiddenFilters, binding._pendingHiddenFilters, storeVersion]);

    return useQuery({
        queryKey: ['chart-data-v2', mode, binding.dataSourceId, binding.tableName, binding.sorting, binding.filtering, binding.chartConfig, resolvedHiddenFilters],
        queryFn: async () => {
            if (!binding.tableName) return [];
            if (mode === 'builder') {
                return fetchFromBuilder({
                    ...binding,
                    _resolvedHiddenFilters: resolvedHiddenFilters
                });
            } else {
                return fetchFromEdge({
                    ...binding,
                    _resolvedHiddenFilters: resolvedHiddenFilters
                });
            }
        },
        initialData: initialData,
        enabled: enabled && !!binding.tableName,
        staleTime: 5 * 60 * 1000, // 5 minutes per AGENTS.md 7.2
        refetchInterval: binding.refreshInterval && binding.refreshInterval > 0
            ? binding.refreshInterval * 1000
            : false,
    });
}
