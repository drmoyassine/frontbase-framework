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

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerEdgeDatabasesRoutes(app: App, phase2For: (t: string) => Phase2Store, now: () => string): void {
    // GET /api/edge-databases/
    app.get('/api/edge-databases/', async (c) => c.json({ databases: await phase2For(c.get('tenant')).listEdgeResources('database') }));
    // POST /api/edge-databases/
    app.post('/api/edge-databases/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        await phase2For(c.get('tenant')).upsertEdgeResource({ id, kind: 'database', name: b.name ?? 'database', provider: b.provider, config: b.config !== undefined ? JSON.stringify(b.config) : undefined }, now());
        return c.json({ id, name: b.name ?? 'database', provider: b.provider ?? null, config: b.config ?? null, kind: 'database', created_at: now() }, 201);
    });
    // PUT /api/edge-databases/{db_id}
    app.put('/api/edge-databases/:db_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        await phase2For(c.get('tenant')).upsertEdgeResource({ id: c.req.param('db_id'), kind: 'database', name: b.name ?? 'database', provider: b.provider, config: b.config !== undefined ? JSON.stringify(b.config) : undefined }, now());
        return c.json({ success: true, id: c.req.param('db_id') });
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
        let n = 0;
        for (const id of b.ids ?? []) { await store.deleteEdgeResource(id); n++; }
        return c.json({ success: true, deleted: n });
    });
    // ---- graceful acks: no datasource wired in the community worker ----
    // POST /api/edge-databases/test-connection
    app.post('/api/edge-databases/test-connection', (c) => c.json({ success: false, detail: 'No datasource configured' }));
    // POST /api/edge-databases/{db_id}/test
    app.post('/api/edge-databases/:db_id/test', (c) => c.json({ success: false, detail: 'No datasource configured' }));
    // POST /api/edge-databases/discover-schemas
    app.post('/api/edge-databases/discover-schemas', (c) => c.json({ success: false, schemas: [], detail: 'No datasource configured' }));
    // POST /api/edge-databases/create-schema
    app.post('/api/edge-databases/create-schema', (c) => c.json({ success: false, detail: 'No datasource configured' }));
    // POST /api/edge-databases/reset-role-password
    app.post('/api/edge-databases/reset-role-password', (c) => c.json({ success: false, detail: 'No datasource configured' }));
}
