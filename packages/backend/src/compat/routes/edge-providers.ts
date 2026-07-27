import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { serializeEdgeResource } from './edge-shapes.js';
type App = Hono<{ Variables: ConsoleAuthVars }>;

import type { Phase2Store } from '../../db/phase2-store.js';
/** EdgeProviderAccountResponse: id, name, provider, is_active, created_at, updated_at. */
function asProvider(row: Record<string, unknown>): Record<string, unknown> {
    const base = serializeEdgeResource(row, '_unused');
    delete base._unused;
    return {
        id: base.id, name: base.name, provider: base.provider,
        is_active: String(row.status ?? 'active') === 'active',
        has_credentials: Boolean(row.config),
        provider_metadata: null,
        created_at: base.created_at, updated_at: base.updated_at,
    };
}

export function registerEdgeProvidersRoutes(app: App, p2: (t: string) => Phase2Store, now: () => string): void {
    app.get('/api/edge-providers/', async (c) => c.json(
        (await p2(c.get('tenant')).listEdgeResources('provider')).map(asProvider),
    ));
    app.post('/api/edge-providers/', async (c) => {
        const b = await c.req.json().catch(() => ({}));
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        await store.upsertEdgeResource({ id, kind: 'provider', name: b.name ?? 'Provider', provider: b.provider, config: b.config ? JSON.stringify(b.config) : undefined }, now());
        return c.json(asProvider(await store.getEdgeResource(id) ?? { id, name: b.name ?? 'Provider', provider: b.provider, created_at: now(), updated_at: now() }), 201);
    });
    app.get('/api/edge-providers/workspace-agent-token', (c) => c.json({ token: null }));
    app.post('/api/edge-providers/workspace-agent-token', (c) => c.json({ token: null }));
    app.get('/api/edge-providers/:provider_id', async (c) => {
        const p = await p2(c.get('tenant')).getEdgeResource(c.req.param('provider_id'));
        return p ? c.json(asProvider(p)) : c.json({ detail: 'Not found' }, 404);
    });
    app.put('/api/edge-providers/:provider_id', async (c) => {
        const b = await c.req.json().catch(() => ({}));
        const id = c.req.param('provider_id');
        const store = p2(c.get('tenant'));
        const existing = await store.getEdgeResource(id);
        if (!existing) return c.json({ detail: 'Not found' }, 404);
        await store.upsertEdgeResource({ id, kind: 'provider', name: b.name ?? String(existing.name), provider: b.provider ?? existing.provider }, now());
        return c.json(asProvider(await store.getEdgeResource(id) ?? existing));
    });
    app.delete('/api/edge-providers/:provider_id', async (c) => { await p2(c.get('tenant')).deleteEdgeResource(c.req.param('provider_id')); return c.json({ success: true }); });
    app.get('/api/edge-providers/:provider_id/credentials', (c) => c.json({ detail: 'No credentials stored' }));
    app.post('/api/edge-providers/retest/:provider_id', (c) => c.json({ success: false }));
    app.post('/api/edge-providers/test-connection', (c) => c.json({ success: false }));
    app.post('/api/edge-providers/discover', (c) => c.json({ resources: [] }));
    app.post('/api/edge-providers/discover-by-account/:account_id', (c) => c.json({ resources: [] }));
    app.post('/api/edge-providers/create-resource-by-account/:account_id', (c) => c.json({ success: false }));
    app.get('/api/edge-providers/accounts/:account_id/tables', (c) => c.json([]));
    app.post('/api/edge-providers/:account_id/list-engines', (c) => c.json({ success: false, engines: [] }));
    app.post('/api/edge-providers/:account_id/turso-databases', (c) => c.json({ success: true, database: {} }));
    // RemoveTursoDatabaseResult requires both `success` and `detail`.
    app.delete('/api/edge-providers/:account_id/turso-databases/:db_id', (c) => c.json({ success: true, detail: 'Database unlinked' }));
    app.post('/api/edge-providers/:account_id/turso-databases/:db_id/test', (c) => c.json({ success: false }));
}

