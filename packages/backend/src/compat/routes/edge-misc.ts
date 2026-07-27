import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
type App = Hono<{ Variables: ConsoleAuthVars }>;

import type { DbRunner } from '@frontbase/edge-infra';
import type { Phase2Store } from '../../db/phase2-store.js';
export function registerEdgeMiscRoutes(app: App, runner: DbRunner, p2: (t: string) => Phase2Store, now: () => string): void {
    // edge-api-keys (5)
    app.get('/api/edge-api-keys', async (c) => c.json({ keys: await runner.query('SELECT id, name, scope, is_active, expires_at FROM edge_api_keys WHERE tenant_slug = ?', [c.get('tenant')]) }));
    app.post('/api/edge-api-keys', async (c) => { const b = await c.req.json().catch(() => ({})); const id = crypto.randomUUID(); const key = 'fbk_' + crypto.randomUUID(); await runner.exec('INSERT INTO edge_api_keys (id, tenant_slug, name, scope, key_hash, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', [id, c.get('tenant'), b.name ?? 'key', b.scope ?? 'user', key, 1, now(), now()]); return c.json({ id, key, name: b.name, scope: b.scope ?? 'user' }); });
    app.put('/api/edge-api-keys/:key_id', async (c) => { const b = await c.req.json().catch(() => ({})); await runner.exec('UPDATE edge_api_keys SET is_active = ?, updated_at = ? WHERE tenant_slug = ? AND id = ?', [b.is_active ? 1 : 0, now(), c.get('tenant'), c.req.param('key_id')]); return c.json({ success: true }); });
    app.delete('/api/edge-api-keys/:key_id', async (c) => { await runner.exec('DELETE FROM edge_api_keys WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('key_id')]); return c.json({ success: true }); });
    app.get('/api/edge-api-keys/:key_id/reveal', async (c) => { const r = await runner.query('SELECT key_hash FROM edge_api_keys WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('key_id')]); return r[0] ? c.json({ key: String(r[0].key_hash) }) : c.json({ detail: 'Not found' }, 404); });
    // edge-gpu (7)
    app.get('/api/edge-gpu/', async (c) => c.json({ models: await p2(c.get('tenant')).listEdgeResources('gpu') }));
    app.get('/api/edge-gpu/schemas', (c) => c.json({ schemas: {}, providers: [] }));
    app.get('/api/edge-gpu/catalog', (c) => c.json({ provider: '', total: 0, models_by_type: {} }));
    app.post('/api/edge-gpu/', async (c) => { const b = await c.req.json().catch(() => ({})); const id = crypto.randomUUID(); await p2(c.get('tenant')).upsertEdgeResource({ id, kind: 'gpu', name: b.name ?? 'GPU Model', provider: b.provider }, now()); return c.json({ id, name: b.name }); });
    app.put('/api/edge-gpu/:model_id', (c) => c.json({ success: true }));
    app.delete('/api/edge-gpu/:model_id', async (c) => { await p2(c.get('tenant')).deleteEdgeResource(c.req.param('model_id')); return c.json({ success: true }); });
    app.post('/api/edge-gpu/:model_id/test', (c) => c.json({ success: false }));
    // Cloudflare Deploy (4) + Inspector (3) + Deno (1).
    // /status is broken out of the loop: CloudflareStatusResult requires
    // `deployed`, not the generic {success, detail} ack the others share.
    app.post('/api/cloudflare/status', (c) => c.json({ deployed: false, account_id: null, url: null, worker_name: null }));
    for (const p of ['/api/cloudflare/connect', '/api/cloudflare/deploy', '/api/cloudflare/teardown', '/api/cloudflare/inspect/content', '/api/cloudflare/inspect/secrets', '/api/cloudflare/inspect/settings', '/api/deno/connect']) {
        app.post(p, (c) => c.json({ success: false, detail: 'Not configured' }));
    }
}

