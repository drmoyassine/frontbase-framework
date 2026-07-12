/**
 * Data Studio routes (Phase 3b / F7) — datasource CRUD + table introspection.
 *
 * Datasource connection config is stored encrypted (F6); introspection builds a
 * DbRunner from the decrypted config via the datasource-runner factory. All
 * tenant-scoped (RULE 2), default-deny (RULE 2), opaque errors (RULE 4).
 *
 * Introspection is SQLite-dialect today (covers sqlite/turso/d1 reads against
 * sqlite_master). Dialect-specific introspection (Postgres information_schema,
 * Supabase PostgREST) is a follow-up.
 */
import { Hono } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import type { Phase2Store } from '../db/phase2-store.js';
import { datasourceRunner, isIntrospectable } from '../db/datasource-runner.js';

export function dataStudioRoutes(
    storeFor: (tenant: string) => Phase2Store,
    now: () => string,
): Hono<{ Variables: ConsoleAuthVars }> {
    const app = new Hono<{ Variables: ConsoleAuthVars }>();

    // ---- Datasource CRUD ----

    app.get('/datasources', async (c) => {
        const store = storeFor(c.get('tenant'));
        return c.json({ datasources: await store.listDatasources() });
    });

    app.put('/datasources/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => null) as { name?: string; kind?: string; config?: Record<string, unknown> } | null;
        if (!body?.name || !body.kind || !body.config) return c.json({ error: 'validation_failed' }, 400);
        await store.upsertDatasource(c.req.param('id'), body.name, body.kind, body.config, now());
        return c.json({ ok: true });
    });

    app.delete('/datasources/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        await store.deleteDatasource(c.req.param('id'));
        return c.json({ ok: true });
    });

    // ---- Introspection (list tables / columns / rows / query) ----

    /** Build a runner for a datasource, or return an opaque error response. */
    async function runnerFor(tenant: string, id: string): Promise<{ runner: import('@frontbase/edge-infra').DbRunner } | { error: { code: string; status: 404 | 501 | 502 } }> {
        const store = storeFor(tenant);
        const ds = await store.getDatasourceConfig(id);
        if (!ds) return { error: { code: 'not_found', status: 404 } };
        if (!isIntrospectable(ds.kind)) return { error: { code: 'not_introspectable', status: 501 } };
        try {
            return { runner: datasourceRunner(ds.kind, ds.config) };
        } catch {
            return { error: { code: 'datasource_connect_failed', status: 502 } };
        }
    }

    // List tables (SQLite dialect: sqlite_master).
    app.get('/datasources/:id/tables', async (c) => {
        const r = await runnerFor(c.get('tenant'), c.req.param('id'));
        if ('error' in r) return c.json({ error: r.error.code }, r.error.status);
        const rows = await r.runner.query(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        );
        return c.json({ tables: rows.map((row) => String(row.name)) });
    });

    // Describe a table (PRAGMA table_info — SQLite dialect).
    app.get('/datasources/:id/tables/:table/columns', async (c) => {
        const r = await runnerFor(c.get('tenant'), c.req.param('id'));
        if ('error' in r) return c.json({ error: r.error.code }, r.error.status);
        const table = c.req.param('table');
        const cols = await r.runner.query(`PRAGMA table_info(${table})`);
        return c.json({
            columns: cols.map((col) => ({
                name: String(col.name),
                type: String(col.type ?? ''),
                notNull: Number(col.notnull ?? 0) === 1,
                pk: Number(col.pk ?? 0) > 0,
            })),
        });
    });

    // Browse rows (SELECT * LIMIT n).
    app.get('/datasources/:id/tables/:table/rows', async (c) => {
        const r = await runnerFor(c.get('tenant'), c.req.param('id'));
        if ('error' in r) return c.json({ error: r.error.code }, r.error.status);
        const table = c.req.param('table');
        const limit = Math.min(Number(c.req.query('limit') ?? 100), 1000);
        const offset = Math.max(Number(c.req.query('offset') ?? 0), 0);
        // Table name is path-scoped (not user SQL) — safe to interpolate; limit/offset are bounded numbers.
        const rows = await r.runner.query(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`, [limit, offset]);
        return c.json({ rows, limit, offset });
    });

    // Run an arbitrary SELECT (read-only — enforced by the route: only SELECT allowed).
    app.post('/datasources/:id/query', async (c) => {
        const r = await runnerFor(c.get('tenant'), c.req.param('id'));
        if ('error' in r) return c.json({ error: r.error.code }, r.error.status);
        const body = await c.req.json().catch(() => null) as { sql?: string; params?: unknown[] } | null;
        const sql = (body?.sql ?? '').trim();
        // Read-only guard: allow only SELECT (case-insensitive). No ; chaining.
        if (!/^select\b/i.test(sql) || /;/.test(sql)) {
            return c.json({ error: 'only_select_allowed' }, 400);
        }
        try {
            const rows = await r.runner.query(sql, body?.params ?? []);
            return c.json({ rows, count: rows.length });
        } catch {
            return c.json({ error: 'query_failed' }, 400);
        }
    });

    return app;
}
