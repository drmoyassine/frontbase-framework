/**
 * CF-22 Work A2 Tier 1 — Functional `database` surface (10 ops).
 * Datasource connection state + real table introspection & SQL execution.
 * Wires to SyncStore datasources or local DbRunner fallback.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 * SECURITY: Identifier whitelist validation on table/column parameters.
 */
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';
import type { SyncStore } from '../sync-store.js';
import { datasourceRunner, dialectOf } from '../../db/datasource-runner.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

function isIdentifier(id: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id);
}

export function registerDatabaseRoutes(
    app: App,
    _runner: DbRunner,
    syncStoreFor: (t: string) => SyncStore,
    kvFor: (t: string) => KeyValueStore,
    externalFetch: CompatFetch,
    now: () => string,
): void {
    type ActiveDatasource = {
        activeRunner: DbRunner;
        dialect: 'sqlite' | 'postgres';
        kind: string;
        config: Record<string, unknown>;
    };

    // Never fall back to the framework control database. That database contains
    // users, sessions, secrets, and records for every tenant.
    async function getActiveRunner(tenant: string): Promise<ActiveDatasource | null> {
        const store = syncStoreFor(tenant);
        const datasources = await store.listDatasources();
        const ds = datasources[0];
        if (ds) {
            return {
                activeRunner: datasourceRunner(ds.kind, ds.config),
                dialect: dialectOf(ds.kind),
                kind: ds.kind,
                config: ds.config,
            };
        }
        return null;
    }

    async function listTableNames(source: ActiveDatasource): Promise<string[]> {
        const sql = source.dialect === 'sqlite'
            ? "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            : "SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public'";
        const rows = await source.activeRunner.query(sql);
        return rows.map((row) => String(row.name));
    }

    async function validateTable(source: ActiveDatasource, table: string): Promise<boolean> {
        if (!isIdentifier(table)) return false;
        return (await listTableNames(source)).includes(table);
    }

    async function listColumnNames(source: ActiveDatasource, table: string): Promise<string[]> {
        if (source.dialect === 'sqlite') {
            const rows = await source.activeRunner.query(`PRAGMA table_info("${table}")`);
            return rows.map((row) => String(row.name));
        }
        const rows = await source.activeRunner.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
            [table],
        );
        return rows.map((row) => String(row.column_name));
    }

    // GET /api/database/connections/
    app.get('/api/database/connections/', async (c) => {
        const source = await getActiveRunner(c.get('tenant'));
        const legacy = await kvFor(c.get('tenant')).getJson<{ connected?: boolean; url?: string; serviceKey?: string }>(
            'db_connection',
            {},
        );
        const connected = source?.kind === 'supabase' || legacy.connected === true;
        return c.json({
            success: true,
            message: 'Connections retrieved successfully',
            data: {
                supabase: {
                    connected,
                    url: source?.kind === 'supabase' ? String(source.config.url ?? '') : String(legacy.url ?? ''),
                    hasServiceKey: source?.kind === 'supabase' || Boolean(legacy.serviceKey),
                },
            },
        });
    });

    // POST /api/database/test-supabase/
    app.post('/api/database/test-supabase/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as {
            url?: string; anonKey?: string; serviceKey?: string;
        };
        const url = String(body.url ?? '').replace(/\/+$/, '');
        const serviceKey = String(body.serviceKey ?? '');
        const anonKey = String(body.anonKey ?? '');
        const key = serviceKey || anonKey;
        if (!url || !key) return c.json({ success: false, message: 'Supabase URL and key are required', data: null });
        try {
            const response = await guardedExternalFetch(externalFetch, `${url}/rest/v1/`, {
                headers: { apikey: key, Authorization: `Bearer ${key}` },
            });
            if (!response.ok) return c.json({ success: false, message: `Failed to connect: ${response.status}`, data: null });
            return c.json({
                success: true,
                message: serviceKey
                    ? 'Successfully connected with Service Role Key. Full admin access available.'
                    : 'Connected with Anon Key. For full admin access, add a Service Role Key.',
                data: null,
            });
        } catch (error) {
            const providerMessage = (error as Error).message === 'invalid_provider_url'
                ? "Request URL is missing an 'http://' or 'https://' protocol."
                : (error as Error).message;
            return c.json({
                success: false,
                message: `Unable to reach Supabase server: ${providerMessage}`,
                data: null,
            });
        }
    });

    // POST /api/database/connect-supabase/
    app.post('/api/database/connect-supabase/', async (c) => {
        const body = await c.req.json() as { url: string; anonKey: string; serviceKey?: string | null };
        await kvFor(c.get('tenant')).setJson('db_connection', {
            connected: true,
            url: body.url,
            serviceKey: body.serviceKey ?? '',
        }, now());
        return c.json({ success: true, message: 'Supabase connection saved successfully', data: null });
    });

    // DELETE /api/database/disconnect-supabase/
    app.delete('/api/database/disconnect-supabase/', async (c) => {
        await kvFor(c.get('tenant')).setJson('db_connection', { connected: false }, now());
        return c.json({ success: true, message: 'Supabase connection removed successfully', data: null });
    });

    // GET /api/database/tables/ & /api/database/supabase-tables/
    const handleListTables = async (c: any) => {
        const source = await getActiveRunner(c.get('tenant'));
        if (!source) {
            return c.json({ success: true, data: { tables: [] }, message: null, error: null });
        }
        const tables = (await listTableNames(source)).map((name) => ({ name, schema: 'public' }));
        return c.json({ success: true, data: { tables }, message: 'Tables fetched', error: null });
    };

    app.get('/api/database/tables/', handleListTables);
    app.get('/api/database/supabase-tables/', handleListTables);

    // GET /api/database/table-data/{table_name}/
    app.get('/api/database/table-data/:table_name/', async (c) => {
        const table = c.req.param('table_name');
        const source = await getActiveRunner(c.get('tenant'));
        if (!source) {
            return c.json({
                success: true,
                message: 'Data retrieved successfully',
                data: [],
                total: 0,
            });
        }
        if (!isIdentifier(table)) {
            return c.json({ success: false, message: 'Invalid table', data: [], total: 0 }, 400);
        }
        if (!await validateTable(source, table)) {
            return c.json({ success: false, message: 'Invalid table', data: [], total: 0 }, 400);
        }
        try {
            const rows = await source.activeRunner.query(`SELECT * FROM "${table}" LIMIT 50`);
            return c.json({
                success: true,
                data: rows,
                total: rows.length,
                message: 'Data retrieved successfully',
            });
        } catch {
            return c.json({ success: false, data: [], total: 0, message: 'Table query failed' });
        }
    });

    // GET /api/database/table-schema/{table_name}/
    app.get('/api/database/table-schema/:table_name/', async (c) => {
        const table = c.req.param('table_name');
        const source = await getActiveRunner(c.get('tenant'));
        if (!source) {
            return c.json({
                detail: 'Supabase connection not configured. Connect a Supabase account in Settings → Accounts.',
            }, 404);
        }
        if (!isIdentifier(table)) {
            return c.json({ success: false, data: { table_name: table, columns: [] }, error: 'Invalid table' }, 400);
        }
        if (!await validateTable(source, table)) {
            return c.json({ detail: `Table ${table} not found in schema` }, 404);
        }
        try {
            let columns: any[] = [];
            if (source.dialect === 'sqlite') {
                const rows = await source.activeRunner.query(`PRAGMA table_info("${table}")`);
                columns = rows.map((r) => ({
                    name: String(r.name),
                    column_name: String(r.name),
                    type: String(r.type ?? 'TEXT'),
                    data_type: String(r.type ?? 'TEXT'),
                    nullable: Number(r.notnull) === 0,
                    is_nullable: Number(r.notnull) === 0 ? 'YES' : 'NO',
                    primary_key: Number(r.pk) > 0,
                    is_primary: Number(r.pk) > 0,
                }));
            } else {
                const rows = await source.activeRunner.query(
                    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
                    [table],
                );
                columns = rows.map((r) => ({
                    name: String(r.column_name),
                    column_name: String(r.column_name),
                    type: String(r.data_type ?? 'text'),
                    data_type: String(r.data_type ?? 'text'),
                    nullable: String(r.is_nullable).toUpperCase() === 'YES',
                    is_nullable: String(r.is_nullable).toUpperCase(),
                    primary_key: false,
                    is_primary: false,
                }));
            }
            return c.json({ success: true, data: { table_name: table, columns, foreign_keys: [] }, error: null });
        } catch (err) {
            return c.json({ success: false, data: { table_name: table, columns: [] }, error: (err as Error).message });
        }
    });

    // POST /api/database/advanced-query/
    app.post('/api/database/advanced-query/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            rpcName?: string; params?: Record<string, unknown>;
        };
        const source = await getActiveRunner(c.get('tenant'));
        if (!source) {
            return c.json({ success: false, data: [], rows: [], error: 'Database not configured' });
        }
        try {
            if (!b.rpcName || source.kind !== 'supabase' || !isIdentifier(b.rpcName)) {
                return c.json({ success: false, data: [], rows: [], error: 'Supabase RPC datasource required' }, 400);
            }
            const url = String(source.config.url ?? source.config.supabaseUrl ?? '').replace(/\/+$/, '');
            const key = String(source.config.serviceKey ?? source.config.anonKey ?? source.config.jwt ?? '');
            if (!url || !key) return c.json({ success: false, data: [], rows: [], error: 'Supabase credentials missing' }, 400);
            const response = await guardedExternalFetch(externalFetch, `${url}/rest/v1/rpc/${b.rpcName}`, {
                method: 'POST',
                headers: {
                    apikey: key,
                    Authorization: `Bearer ${key}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify(b.params ?? {}),
            });
            if (!response.ok) return c.json({ success: false, data: [], rows: [], error: `RPC failed: ${response.status}` }, 400);
            const data = await response.json() as unknown;
            const rows = Array.isArray(data)
                ? data
                : (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).rows))
                    ? (data as Record<string, unknown>).rows
                    : [];
            return c.json({ success: true, data, rows, error: null });
        } catch {
            return c.json({ success: false, data: [], rows: [], error: 'query_failed' }, 400);
        }
    });

    // POST /api/database/distinct-values/
    app.post('/api/database/distinct-values/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            table_name?: string; tableName?: string; column_name?: string; columnName?: string; column?: string;
        };
        const table = b.table_name ?? b.tableName ?? '';
        const col = b.column_name ?? b.columnName ?? b.column ?? '';
        const source = await getActiveRunner(c.get('tenant'));
        if (!source) {
            return c.json({ success: true, data: [], error: null });
        }
        if (!isIdentifier(table) || !isIdentifier(col)) {
            return c.json({ success: false, data: [], values: [], error: 'Invalid table or column' }, 400);
        }
        if (
            !await validateTable(source, table)
            || !isIdentifier(col)
            || !(await listColumnNames(source, table)).includes(col)
        ) {
            return c.json({ success: false, data: [], values: [], error: 'Invalid table or column' }, 400);
        }
        try {
            const rows = await source.activeRunner.query(`SELECT DISTINCT "${col}" as val FROM "${table}" WHERE "${col}" IS NOT NULL LIMIT 100`);
            const values = rows.map((r) => r.val);
            return c.json({ success: true, data: values, values, error: null });
        } catch {
            return c.json({ success: false, data: [], values: [], error: 'query_failed' });
        }
    });
}
