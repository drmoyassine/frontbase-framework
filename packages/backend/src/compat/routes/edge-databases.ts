/**
 * CF-22 P2 Wave 2 — the `edge-databases` tag (10 ops). CRUD on the database-kind
 * edge resources via Phase2Store (migration v5: edge_resources where kind='database').
 * Connection introspection ops (test/discover/create-schema/reset-role) require a
 * live datasource the community worker doesn't wire, so they return the product's
 * graceful "not configured" acks. RULE 2: tenant from `c.get('tenant')`.
 *
 * Routes registered with EXACT product paths (trailing slashes matter).
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import { serializeEdgeResource, batchResult, testResult } from './edge-shapes.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

const NO_DATASOURCE = 'No datasource configured for this deployment';

/** EdgeDatabaseResponse: the shared edge shape keyed on `db_url`, plus its own optionals. */
const asDatabase = (row: Record<string, unknown>): Record<string, unknown> =>
    serializeEdgeResource(row, 'db_url', { schema_name: null, target_count: 0, warning: null });

export function registerEdgeDatabasesRoutes(app: App, phase2For: (t: string) => Phase2Store, now: () => string): void {
    // GET /api/edge-databases/
    app.get('/api/edge-databases/', async (c) => c.json({
        databases: (await phase2For(c.get('tenant')).listEdgeResources('database')).map(asDatabase),
    }));
    // POST /api/edge-databases/
    app.post('/api/edge-databases/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        const store = phase2For(c.get('tenant'));
        await store.upsertEdgeResource({ id, kind: 'database', name: b.name ?? 'database', provider: b.provider, config: b.config !== undefined ? JSON.stringify(b.config) : undefined }, now());
        return c.json(asDatabase(await store.getEdgeResource(id) ?? { id, name: b.name ?? 'database', created_at: now(), updated_at: now() }), 201);
    });
    // PUT /api/edge-databases/{db_id}
    app.put('/api/edge-databases/:db_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const store = phase2For(c.get('tenant'));
        const existing = await store.getEdgeResource(c.req.param('db_id'));
        if (!existing) return c.json({ detail: 'Database not found' }, 404);
        await store.upsertEdgeResource({
            id: c.req.param('db_id'), kind: 'database',
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: b.config !== undefined ? JSON.stringify(b.config) : (existing.config as string | undefined),
        }, now());
        return c.json(asDatabase(await store.getEdgeResource(c.req.param('db_id')) ?? existing));
    });
    // DELETE /api/edge-databases/{db_id}
    app.delete('/api/edge-databases/:db_id', async (c) => {
        await phase2For(c.get('tenant')).deleteEdgeResource(c.req.param('db_id'));
        return c.json({ success: true, detail: 'Database removed' });
    });
    // POST /api/edge-databases/batch/delete
    app.post('/api/edge-databases/batch/delete', async (c) => {
        const b = await c.req.json().catch(() => ({ ids: [] as string[] })) as { ids?: string[] };
        const store = phase2For(c.get('tenant'));
        const done: string[] = [];
        const failed: unknown[] = [];
        for (const id of b.ids ?? []) {
            try { await store.deleteEdgeResource(id); done.push(id); }
            catch (e) { failed.push({ id, error: (e as Error).message }); }
        }
        return c.json(batchResult(done, failed));
    });
    // ---- graceful acks: no datasource wired in the community worker ----
    // POST /api/edge-databases/test-connection
    app.post('/api/edge-databases/test-connection', (c) => c.json(testResult(false, NO_DATASOURCE)));
    // POST /api/edge-databases/{db_id}/test
    app.post('/api/edge-databases/:db_id/test', (c) => c.json(testResult(false, NO_DATASOURCE)));
    // POST /api/edge-databases/discover-schemas
    app.post('/api/edge-databases/discover-schemas', (c) => c.json({ success: false, schemas: [], detail: 'No datasource configured' }));
    // POST /api/edge-databases/create-schema
    app.post('/api/edge-databases/create-schema', (c) => c.json({ success: false, detail: 'No datasource configured' }));
    // POST /api/edge-databases/reset-role-password
    app.post('/api/edge-databases/reset-role-password', (c) => c.json({ success: false, detail: 'No datasource configured' }));
}
