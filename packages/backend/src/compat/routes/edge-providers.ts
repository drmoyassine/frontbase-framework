import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
type App = Hono<{ Variables: ConsoleAuthVars }>;

import type { Phase2Store } from '../../db/phase2-store.js';
export function registerEdgeProvidersRoutes(app: App, p2: (t: string) => Phase2Store, now: () => string): void {
    app.get('/api/edge-providers/', async (c) => c.json(await p2(c.get('tenant')).listEdgeResources('provider')));
    app.post('/api/edge-providers/', async (c) => { const b = await c.req.json().catch(() => ({})); const id = crypto.randomUUID(); await p2(c.get('tenant')).upsertEdgeResource({ id, kind: 'provider', name: b.name ?? 'Provider', provider: b.provider, config: b.config ? JSON.stringify(b.config) : undefined }, now()); return c.json({ id, name: b.name, provider: b.provider, is_active: true }); });
    app.get('/api/edge-providers/workspace-agent-token', (c) => c.json({ token: null }));
    app.post('/api/edge-providers/workspace-agent-token', (c) => c.json({ token: null }));
    app.get('/api/edge-providers/:provider_id', async (c) => { const all = await p2(c.get('tenant')).listEdgeResources('provider'); const p = all.find((x:any) => x.id === c.req.param('provider_id')); return p ? c.json(p) : c.json({ detail: 'Not found' }, 404); });
    app.put('/api/edge-providers/:provider_id', async (c) => { const b = await c.req.json().catch(() => ({})); await p2(c.get('tenant')).upsertEdgeResource({ id: c.req.param('provider_id'), kind: 'provider', name: b.name ?? 'Provider', provider: b.provider }, now()); return c.json({ success: true }); });
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
    app.delete('/api/edge-providers/:account_id/turso-databases/:db_id', (c) => c.json({ success: true }));
    app.post('/api/edge-providers/:account_id/turso-databases/:db_id/test', (c) => c.json({ success: false }));
}

