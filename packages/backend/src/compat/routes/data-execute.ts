import {readViewAggregate} from '../view-aggregate.js';
import {recordPaths,projectRecordFields,projectionRelations,sqlRecordReader,type RecordReader} from '../record-fields.js';
import {reportReadFailure} from '../read-failure.js';
import {datasourceSchema,scopedDatasourceConfig} from '../datasource-schema.js';
import {isNativePostgrest,nativePostgrestInspector} from '../postgrest-inspector.js';
// CF-22 Work D — client hydration data plane
import {savedViewFilters} from '@frontbase/edge-core/saved-view-filters';
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';
import type { SyncStore } from '../sync-store.js';
import { datasourceRunner, dialectOf } from '../../db/datasource-runner.js';
import { resolveDatasourceConfig } from '../credential-resolver.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import { mergeAccountConfig, type AccountConfigFor } from '../providers/merge-account.js';
import { validateRpcQueryBody } from '../rpc-body.js';
import { inspectTable } from './sync.js';
import {executeSingleTableRpc} from '../single-table-rpc.js';
import {consoleDataAdministrator,hasPublishedViewPolicy,publishedLiveReadAllowed} from '../published-live-access.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

/**
 * Datasources whose Supabase project DENIES the anon key the RPC (42501 /
 * 401 / 404 — newer Supabase projects do not grant anon EXECUTE on functions
 * by default). Soft per-isolate memo: once a project denies anon, skip the
 * doomed attempt and go straight to the service key until the isolate
 * recycles (a project that later grants anon is picked up on the next
 * isolate). Keyed by datasource id — never holds key material.
 */
const anonRpcDenied = new Set<string>();

interface DataRequest {
    viewId?:string;
    sourceSchema?:string;
    datasourceId?: string;
    fetchStrategy?: 'direct' | 'proxy';
    method?: 'GET' | 'POST';
    url?: string;
    headers?: Record<string, string>;
    body?: unknown;
    queryConfig?: {
        sql?: string;
        table?: string;
        columns?: string[];
        filters?: Array<{ column: string; operator: string; value: unknown }>;
        limit?: number;
        offset?: number;
        orderBy?: { column: string; direction: 'asc' | 'desc' };
        [key: string]: unknown;
    };
    resultPath?: string;
    flattenRelations?: boolean;
}

function isPrivateUrl(urlStr: string): boolean {
    try {
        const parsed = new URL(urlStr);
        const hostname = parsed.hostname.toLowerCase();
        const privatePatterns = [
            'localhost', 'localhost.localdomain', '127.0.0.1', '[::1]', '0.0.0.0',
            '.local', '.localhost', '.internal',
            /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^169\.254\./, /^127\./, /^0\./,
        ];
        for (const pattern of privatePatterns) {
            if (typeof pattern === 'string') {
                if (hostname === pattern || hostname.endsWith(pattern)) return true;
            } else if (pattern.test(hostname)) {
                return true;
            }
        }
        if (hostname.startsWith('[fc') || hostname.startsWith('[fd') || hostname.startsWith('[fe80')) return true;
        return false;
    } catch {
        return true;
    }
}

function getByPath(obj: unknown, path: string): unknown {
    if (!path) return obj;
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function flattenRelations(data: unknown[]): unknown[] {
    return data.map((record) => {
        if (record === null || record === undefined) return record;
        if (typeof record !== 'object') return record;
        if (Array.isArray(record)) return record;
        const flat: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
                    flat[`${key}.${subKey}`] = subValue;
                }
            } else {
                flat[key] = value;
            }
        }
        return flat;
    });
}

export function registerDataExecuteRoute(
    app: App,
    _runner: DbRunner,
    syncStoreFor: (t: string) => SyncStore,
    _kvFor: (t: string) => KeyValueStore,
    externalFetch: CompatFetch,
    _now: () => string,
    accountConfigFor?: AccountConfigFor,
    resolvePrincipal?: (req: Request) => Promise<{ user: unknown; tenant?: string }>,
    requestTenant?: (req: Request) => Promise<string | undefined>,
): void {
    // Tenant context for these PUBLIC routes (registered before
    // defaultDenyAuth, so the tenant context middleware never runs): a
    // builder/admin canvas call carries the session cookie (real tenant); an
    // anonymous published-page visitor falls back to the request's host tenant
    // (CLOUD) or the deployment's own tenant ('_root', self-host). Tenant
    // isolation for the data itself is the datasource-ownership checks below.
    const principalForRequest = async (req: Request): Promise<{
        principal: { user: unknown; tenant?: string } | null;
        tenant: string;
    }> => {
        const principal = resolvePrincipal ? await resolvePrincipal(req).catch(() => null) : null;
        const tenant = principal?.tenant
            ?? (requestTenant ? (await requestTenant(req).catch(() => undefined)) : undefined)
            ?? '_root';
        return { principal, tenant };
    };
    app.post('/api/data/execute', async (c) => {
        try {
            const { principal, tenant } = await principalForRequest(c.req.raw);
            const body = await c.req.json().catch(() => ({}));
            // Two wire shapes reach this route (product parity): the Grid/KPI
            // hooks wrap as {dataRequest}, the InfoList record load and the
            // Repeater list hook POST the dataRequest object itself at the top
            // level. Accept both — wrapped wins.
            const dataRequest: DataRequest = body.dataRequest
                ?? ((body.fetchStrategy === 'proxy' || body.datasourceId || body.url)
                    ? body : undefined);

            if (!dataRequest) {
                return c.json({
                    success: false,
                    error: 'Invalid dataRequest: missing dataRequest object',
                }, 400);
            }

            // Resolve the proxy datasourceId ONCE so TS narrows it for the branch below.
            const proxyDatasourceId = dataRequest.fetchStrategy === 'proxy'
                ? dataRequest.datasourceId
                : undefined;
            const isProxy = Boolean(proxyDatasourceId);
            if (!isProxy && !dataRequest.url) {
                return c.json({
                    success: false,
                    error: 'Invalid dataRequest: missing url (direct) or datasourceId (proxy)',
                }, 400);
            }

            let data: unknown[] = [];
            let total: number = 0;

            if (isProxy && proxyDatasourceId) {
                const store = syncStoreFor(tenant);
                const datasources = await store.listDatasources();
                const ds = datasources.find((d) => d.id === dataRequest.datasourceId);
                if (!ds) {
                    return c.json({
                        success: false,
                        error: 'Unauthorized access to this datasource',
                    }, 403);
                }
                let trustedSchema:string|undefined;
                let trustedViewFilters:unknown;
                let trustedViewSort:{column:string;direction:'asc'|'desc'}|null|undefined;
                if(dataRequest.viewId){
                    const view=await store.getView(dataRequest.viewId);
                    const requestBody=dataRequest.body as Record<string,unknown>|undefined;
                    if(!view||view.datasource_id!==ds.id||!requestBody||requestBody.table_name!==view.target_table||'query' in requestBody)return c.json({success:false,error:'Saved view unavailable'},403);
                    try{
                        trustedSchema=view.source_schema??undefined;
                        if(dataRequest.sourceSchema!==undefined&&dataRequest.sourceSchema!==datasourceSchema(ds.kind,ds.config,trustedSchema))return c.json({success:false,error:'Saved view schema mismatch'},403);
                        trustedViewFilters=savedViewFilters(view.filters);
                        trustedViewSort=view.default_sort;
                    }catch{return c.json({success:false,error:'Invalid saved view filters'},422);}
                }

                if(!consoleDataAdministrator(principal)&&!await publishedLiveReadAllowed(_runner,tenant,ds.id,dataRequest.viewId,dataRequest.body,ds.kind==='supabase'?datasourceSchema(ds.kind,ds.config,trustedSchema):undefined))return c.json({success:false,error:'Published view required'},403);
                const merged = await mergeAccountConfig(
                    accountConfigFor, externalFetch, tenant, ds.kind, ds.config,
                ).catch(() => ds.config);
                if(!dataRequest.viewId&&(dataRequest.sourceSchema!==undefined||isNativePostgrest(ds))&&!consoleDataAdministrator(principal))return c.json({success:false,error:'Saved view required for selected schema'},403);
                const requestedSchema=dataRequest.viewId?trustedSchema:dataRequest.sourceSchema;
                const scoped=scopedDatasourceConfig(ds.kind,merged,requestedSchema);
                const config = resolveDatasourceConfig(ds.kind, scoped);

                const requestedFields=recordPaths((dataRequest.body as any)?.related_fields);
                const extra=requestedFields.length?await projectionRelations(_runner,tenant,ds.id,String((dataRequest.body as any)?.table_name??''),ds.kind==='supabase'?datasourceSchema(ds.kind,ds.config,requestedSchema):undefined):[];
                const respondRecords=async(rows:unknown[],total:number,reader:RecordReader)=>{
                    const records=requestedFields.length?await projectRecordFields(reader,String((dataRequest.body as any).table_name),rows as Record<string,unknown>[],requestedFields,extra):rows;
                    return c.json({success:true,data:records,count:records.length,total});
                };
                // Selected schemas use the shared read-only HTTP protocol, never default-schema SQL.
                if((isNativePostgrest(ds)||requestedSchema!==undefined)&&!((dataRequest.body as any)?._aggregate&&requestedSchema==='public'&&!isNativePostgrest(ds))){
                    try{
                        if((dataRequest.body as any)?._aggregate)throw Error('native_aggregation_unavailable');
                        const valid=validateRpcQueryBody(dataRequest.body);if(!valid.ok||valid.payload.joins.length)throw Error('single_table_only');
                        const body=valid.payload,inspector=await nativePostgrestInspector(scoped,externalFetch);
                        const columns=body.columns==='*'?undefined:body.columns.split(',').map(value=>{
                            const match=/^"([^".]+)"$/.exec(value.trim());if(!match)throw Error('invalid_columns');return match[1]!;
                        });
                        const result=await inspector.rows(body.table_name,{offset:(body.page-1)*body.page_size,limit:body.page_size,columns,
                            filters:[...savedViewFilters(trustedViewFilters),...savedViewFilters(body.filters)],
                            sort:body.sort_col??trustedViewSort?.column,order:body.sort_col?body.sort_dir??'asc':trustedViewSort?.direction??'asc',search:body.search_query,searchColumns:body.search_cols});
                        return await respondRecords(result.records,result.total,{schema:async table=>inspector.schema(table),relationships:async()=>inspector.relationships().filter(edge=>{const keys=inspector.schema(edge.target_table).columns.filter(column=>column.primary_key);return keys.length===1&&keys[0]!.name===edge.target_column;}),read:async(table,column,values,fields)=>{
                            if(!values.length)return [];const related=await inspector.rows(table,{filters:[{field:column,operator:'in',value:values}],columns:[...new Set([column,...fields])],limit:500});
                            if(related.has_more)throw Error('related_record_limit');return related.records;
                        }});
                    }catch(error){reportReadFailure('selected-schema',error);return c.json({success:false,error:'Selected-schema read unavailable. Check the table, filters and API permissions.'},422);}
                }
                let runner: DbRunner;
                try {
                    runner = datasourceRunner(ds.kind, config, externalFetch);
                } catch {
                    return c.json({
                        success: false,
                        error: 'Datasource not supported or misconfigured',
                    }, 400);
                }

                if((dataRequest.body as any)?._aggregate){
                    try{if(!dataRequest.viewId)throw Error('saved_view_required');const rows=await readViewAggregate(runner,dialectOf(ds.kind),(dataRequest.body as any).table_name,(dataRequest.body as any)._aggregate,(dataRequest.body as any).filters,trustedViewFilters);return c.json({success:true,data:rows,total:rows.length});}
                    catch{return c.json({success:false,error:'Saved-view aggregation unavailable. Check the selected fields and adapter capability.'},422);}
                }
                // Parameterized SELECT body — the Form/InfoList record loads
                // (a7/p7 edge hooks) and the chart aggregate fetch (fse) POST
                // `{...body, query, params}`: a single-row lookup or the baked
                // aggregate SELECT (whose /*__HF__*/ marker the client has
                // already rewritten into hidden-filter conditions). Read-only
                // guard — SELECT only: the runner's query path wraps the SQL in
                // a SELECT, but a data-modifying CTE (`WITH d AS (DELETE …)
                // SELECT …`) is also SELECT-shaped and would execute, so WITH
                // is rejected outright. Writes go through the sync records API
                // and the /api/data/:table routes, never here.
                const rawBody = dataRequest.body;
                if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
                    const query = (rawBody as Record<string, unknown>).query;
                    if (typeof query === 'string' && /^\s*select\b/i.test(query)) {
                        const rawParams = (rawBody as Record<string, unknown>).params;
                        const params = (Array.isArray(rawParams) && rawParams.length <= 50
                            && rawParams.every((p) => ['string', 'number', 'boolean', 'null'].includes(typeof p)
                                || p === null || p instanceof Date))
                            ? rawParams
                            : [];
                        try {
                            const rows = await runner.query(query, params);
                            return await respondRecords(rows,rows.length,sqlRecordReader(runner,dialectOf(ds.kind)));
                        } catch {
                            return c.json({ success: false, error: 'Query execution failed' }, 500);
                        }
                    }
                }

                // RPC-shaped body — the client hydration runtime rebuilds it from
                // the baked queryConfig on every fetch ({table_name, columns,
                // joins, page, page_size, filters, sort_col, sort_dir}).
                // Execute it against the datasource's own frontbase_* RPC when
                // the datasource exposes an HTTP API (Supabase): same function
                // the product's direct strategy calls, but with credentials
                // resolved server-side (proxy). Falls through to the
                // queryConfig SQL paths below when the RPC is unavailable.
                if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
                    && 'table_name' in (rawBody as Record<string, unknown>)) {
                    const validated = validateRpcQueryBody(rawBody);
                    if (!validated.ok) {
                        return c.json({
                            success: false,
                            error: `Invalid data request: ${validated.error}`,
                        }, 400);
                    }
                    const rpcBase = String(config.url ?? '').replace(/\/+$/, '');
                    if(trustedViewSort&&!validated.payload.sort_col){validated.payload.sort_col=trustedViewSort.column;validated.payload.sort_dir=trustedViewSort.direction;}
                    if(requestedFields.length||['postgres','neon','sqlite','turso','d1'].includes(ds.kind)||!!trustedViewFilters){
                        try{
                            const result=await executeSingleTableRpc(runner,dialectOf(ds.kind),validated.payload,trustedViewFilters);
                            return await respondRecords(result.rows,result.total,sqlRecordReader(runner,dialectOf(ds.kind)));
                        }catch(error){
                            reportReadFailure('single-table',error);
                            const message=error instanceof Error?error.message:'';
                            const invalid=['single_table_only','invalid_columns','invalid_column'].includes(message)||message.startsWith('invalid_identifier:');
                            return c.json({success:false,error:'Single-table query failed'},invalid?422:502);
                        }
                    }
                    // Key policy: authenticated console/preview callers use the
                    // service-role key; anonymous published-page visitors prefer
                    // the public anon key (the product's direct-strategy trust
                    // model). Projects that do not grant anon EXECUTE on the RPC
                    // (the Supabase default on newer projects) fall back to the
                    // service key so published pages keep working — see
                    // anonRpcDenied.
                    const serviceRpcKey = String(config.serviceKey ?? '');
                    const anonRpcKey = String(config.anonKey ?? '');
                    let rpcKey: string;
                    if (principal?.user) {
                        rpcKey = serviceRpcKey;
                    } else {
                        rpcKey = (anonRpcKey && !anonRpcDenied.has(ds.id)) ? anonRpcKey : serviceRpcKey;
                    }
                    if (ds.kind === 'supabase' && rpcBase.startsWith('http') && rpcKey) {
                        const rpcName = validated.search ? 'frontbase_search_rows' : 'frontbase_get_rows';
                        const rpcFetch = (key: string) => guardedExternalFetch(externalFetch, `${rpcBase}/rest/v1/rpc/${rpcName}`, {
                            method: 'POST',
                            headers: {
                                apikey: key,
                                Authorization: `Bearer ${key}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(validated.payload),
                        });
                        try {
                            let response = await rpcFetch(rpcKey);
                            if (!response.ok && rpcKey === anonRpcKey && rpcKey !== serviceRpcKey
                                && (response.status === 401 || response.status === 403 || response.status === 404)) {
                                // Project denies the anon role on this RPC — memo it
                                // and retry once with the service key.
                                anonRpcDenied.add(ds.id);
                                rpcKey = serviceRpcKey;
                                response = await rpcFetch(rpcKey);
                            }
                            if (response.ok) {
                                const json = await response.json() as Record<string, unknown>;
                                const rows = Array.isArray(json.rows) ? json.rows : [];
                                const total = typeof json.total === 'number' ? json.total : rows.length;
                                // RPC rows are already flat (product sets
                                // flattenRelations:false for RPC data).
                                return await respondRecords(rows,total,sqlRecordReader(runner,dialectOf(ds.kind)));
                            }
                            // RPC missing/unavailable (404 etc.) → try the SQL paths.
                        } catch {
                            // RPC transport failure → try the SQL paths.
                        }
                    }
                }

                const qc = dataRequest.queryConfig || {};
                let sql = '';
                const params: unknown[] = [];

                if (qc.sql) {
                    sql = qc.sql;
                } else if (qc.table) {
                    const cols = qc.columns && qc.columns.length > 0
                        ? qc.columns.map((c) => `"${c}"`).join(', ')
                        : '*';
                    sql = `SELECT ${cols} FROM "${qc.table}"`;

                    if (qc.filters && qc.filters.length > 0) {
                        const conditions: string[] = [];
                        for (const f of qc.filters) {
                            if (f.operator === 'eq') {
                                conditions.push(`"${f.column}" = ?`);
                                params.push(f.value);
                            } else if (f.operator === 'like') {
                                conditions.push(`"${f.column}" LIKE ?`);
                                params.push(`%${f.value}%`);
                            } else if (f.operator === 'in') {
                                if (Array.isArray(f.value) && f.value.length > 0) {
                                    const placeholders = f.value.map(() => '?').join(', ');
                                    conditions.push(`"${f.column}" IN (${placeholders})`);
                                    params.push(...f.value);
                                }
                            }
                        }
                        if (conditions.length > 0) {
                            sql += ` WHERE ${conditions.join(' AND ')}`;
                        }
                    }

                    if (qc.orderBy) {
                        sql += ` ORDER BY "${qc.orderBy.column}" ${qc.orderBy.direction.toUpperCase()}`;
                    }

                    if (qc.limit) {
                        const dialect = dialectOf(ds.kind);
                        if (dialect === 'postgres') {
                            sql += ` LIMIT ${qc.limit}`;
                            if (qc.offset) sql += ` OFFSET ${qc.offset}`;
                        } else {
                            sql += ` LIMIT ${qc.limit}${qc.offset ? ` OFFSET ${qc.offset}` : ''}`;
                        }
                    }
                } else {
                    return c.json({
                        success: false,
                        error: 'Invalid dataRequest: missing queryConfig.sql or queryConfig.table',
                    }, 400);
                }

                try {
                    const rows = await runner.query(sql, params);
                    data = rows;
                    // Real total for pagination: COUNT(*) when the query was paged;
                    // the page length is only a fallback (product parity — it uses
                    // the provider's content-range / RPC total the same way).
                    if (qc.table && qc.limit) {
                        try {
                            const countRows = await runner.query(
                                `SELECT COUNT(*) AS total FROM "${qc.table}"`,
                            );
                            const t = countRows[0]?.total;
                            total = typeof t === 'number' ? t : rows.length;
                        } catch {
                            total = rows.length;
                        }
                    } else {
                        total = rows.length;
                    }
                } catch {
                    return c.json({
                        success: false,
                        error: 'Query execution failed',
                    }, 500);
                }
            } else {
                const url = dataRequest.url || '';
                if (!url) {
                    return c.json({
                        success: false,
                        error: 'Invalid dataRequest: missing url for direct strategy',
                    }, 400);
                }
                if (isPrivateUrl(url)) {
                    return c.json({
                        success: false,
                        error: 'Access to private URL is blocked',
                    }, 403);
                }

                const headers = dataRequest.headers || {};
                const fetchOpts: RequestInit = {
                    method: dataRequest.method || 'GET',
                    headers,
                };
                if (dataRequest.body) {
                    fetchOpts.body = JSON.stringify(dataRequest.body);
                }

                try {
                    const response = await guardedExternalFetch(externalFetch, url, fetchOpts);
                    if (!response.ok) {
                        return c.json({
                            success: false,
                            error: `HTTP ${response.status}`,
                        }, 400);
                    }

                    const json = await response.json() as unknown;
                    data = getByPath(json, dataRequest.resultPath || '') as unknown[];
                    if (!Array.isArray(data)) {
                        data = data ? [data] : [];
                    }

                    const cr = response.headers.get('content-range');
                    if (cr) {
                        const m = cr.match(/\/(\d+)$/);
                        if (m && m[1] !== undefined) total = parseInt(m[1], 10);
                    } else {
                        total = data.length;
                    }
                } catch {
                    return c.json({
                        success: false,
                        error: 'Direct request failed',
                    }, 500);
                }
            }

            if (dataRequest.flattenRelations !== false) {
                data = flattenRelations(data);
            }

            return c.json({
                success: true,
                data,
                count: data.length,
                total,
            });
        } catch (error) {
            reportReadFailure('data-execute',error);
            return c.json({
                success: false,
                error: 'Unknown error',
            }, 500);
        }
    });

    // ── Edge data API (product parity: /api/data/{table}) ────────────────────
    // The product's edge service exposes table-level reads/writes to published
    // pages: the Form edge submit POSTs here (i7), and the Form/InfoList record
    // hooks fall back to GET /api/data/{table}/{recordId} when a binding has no
    // dataRequest (a7/p7). The client sends NO datasource id — the product's
    // edge fronts a single project database. Mirror: the tenant's single
    // datasource (none → 404; more than one → 400 — such tenants must publish
    // with a baked dataRequest, which carries the id).
    const datasourceAndRunner = async (tenant: string, table: string,principal:{user:unknown}|null) => {
        const store = syncStoreFor(tenant);
        const datasources = await store.listDatasources();
        if (datasources.length === 0) return { error: 404 as const, detail: 'Datasource not found' };
        if (datasources.length > 1) {
            return { error: 400 as const, detail: 'Multiple datasources: table routes require a dataRequest-bound component' };
        }
        const ds = datasources[0];
        if (!ds) return { error: 404 as const, detail: 'Datasource not found' };
        if(!consoleDataAdministrator(principal)&&await hasPublishedViewPolicy(_runner,tenant,ds.id))return {error:403 as const,detail:'Published view reads only'};
        const merged = await mergeAccountConfig(
            accountConfigFor, externalFetch, tenant, ds.kind, ds.config,
        ).catch(() => ds.config);
        try {
            const dialect = dialectOf(ds.kind);
            const runner = datasourceRunner(ds.kind, resolveDatasourceConfig(ds.kind, merged), externalFetch);
            const schema = await inspectTable(runner, dialect, table);
            const pk = schema.columns.find((column) => column.primary_key)?.name ?? 'id';
            return { runner, schema, pk, dialect };
        } catch {
            return { error: 404 as const, detail: 'Table not found' };
        }
    };

    /** Keep only real columns from the client payload (blocklist-free allowlist). */
    const pickColumns = (body: unknown, names: string[], exclude: string[] = []) => {
        const out: Record<string, unknown> = {};
        if (!body || typeof body !== 'object' || Array.isArray(body)) return out;
        for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
            if (!names.includes(key) || exclude.includes(key)) continue;
            out[key] = (value !== null && typeof value === 'object') ? JSON.stringify(value) : value;
        }
        return out;
    };

    app.get('/api/data/:table/:recordId', async (c) => {
        try {
            const { tenant,principal } = await principalForRequest(c.req.raw);
            const res = await datasourceAndRunner(tenant, c.req.param('table'),principal);
            if ('error' in res) return c.json({ detail: res.detail }, res.error);
            const rows = await res.runner.query(
                `SELECT * FROM ${quoteTable(res.schema.table)} WHERE ${quoteTable(res.pk)} = ${ph(res.dialect, 1)} LIMIT 1`,
                [numericLike(c.req.param('recordId'))],
            );
            if (!rows[0]) return c.json({ detail: 'Record not found' }, 404);
            return c.json({ data: rows[0] });
        } catch (err) {
            console.error('[edge-data] fetch failed:', (err as Error)?.message ?? err);
            return c.json({ detail: 'Failed to fetch record' }, 500);
        }
    });

    app.post('/api/data/:table', async (c) => {
        try {
            const { tenant,principal } = await principalForRequest(c.req.raw);
            const res = await datasourceAndRunner(tenant, c.req.param('table'),principal);
            if ('error' in res) return c.json({ detail: res.detail }, res.error);
            const payload = pickColumns(await c.req.json().catch(() => ({})), res.schema.columns.map((column) => column.name));
            const keys = Object.keys(payload);
            if (keys.length === 0) return c.json({ detail: 'No valid columns in payload' }, 400);
            // The runner's query path wraps SQL in a SELECT (no RETURNING through
            // it), so writes go through exec — rowCount only. The response echoes
            // the stored payload (product parity: the sync records POST returns
            // the submitted body too). record_id only when the client sent the pk.
            await res.runner.exec(
                `INSERT INTO ${quoteTable(res.schema.table)} (${keys.map((k) => quoteTable(k)).join(', ')}) `
                + `VALUES (${keys.map((_, i) => ph(res.dialect, i + 1)).join(', ')})`,
                keys.map((k) => payload[k]),
            );
            return c.json({ success: true, data: { ...payload }, ...(payload[res.pk] !== undefined ? { record_id: payload[res.pk] } : {}) });
        } catch (err) {
            console.error('[edge-data] create failed:', (err as Error)?.message ?? err);
            return c.json({ detail: 'Failed to create record' }, 500);
        }
    });

    app.patch('/api/data/:table/:recordId', async (c) => {
        try {
            const { tenant,principal } = await principalForRequest(c.req.raw);
            const res = await datasourceAndRunner(tenant, c.req.param('table'),principal);
            if ('error' in res) return c.json({ detail: res.detail }, res.error);
            const payload = pickColumns(
                await c.req.json().catch(() => ({})),
                res.schema.columns.map((column) => column.name),
                [res.pk],
            );
            const keys = Object.keys(payload);
            if (keys.length === 0) return c.json({ detail: 'No valid columns in payload' }, 400);
            const recordId = numericLike(c.req.param('recordId'));
            // exec for the UPDATE (its rowCount return is not trustworthy — the
            // sync records PATCH ignores it too), then SELECT the row back by
            // pk to both confirm the update and return the stored row.
            await res.runner.exec(
                `UPDATE ${quoteTable(res.schema.table)} SET ${keys.map((k, i) => `${quoteTable(k)} = ${ph(res.dialect, i + 1)}`).join(', ')} `
                + `WHERE ${quoteTable(res.pk)} = ${ph(res.dialect, keys.length + 1)}`,
                [...keys.map((k) => payload[k]), recordId],
            );
            const rows = await res.runner.query(
                `SELECT * FROM ${quoteTable(res.schema.table)} WHERE ${quoteTable(res.pk)} = ${ph(res.dialect, 1)} LIMIT 1`,
                [recordId],
            );
            if (!rows[0]) return c.json({ detail: 'Record not found' }, 404);
            return c.json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('[edge-data] update failed:', (err as Error)?.message ?? err);
            return c.json({ detail: 'Failed to update record' }, 500);
        }
    });
}

/** Quote a SQL identifier (table/column) preserving case — names contain spaces. */
function quoteTable(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

/** Dialect-aware bind placeholder: sqlite `?`, postgres `$N` (1-based). */
function ph(dialect: 'sqlite' | 'postgres', index: number): string {
    return dialect === 'sqlite' ? '?' : `$${index}`;
}

/** Route params are strings; integer PKs need a number param (pg strict typing). */
function numericLike(value: string): string | number {
    return /^\d+$/.test(value) ? Number(value) : value;
}
