import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
type App = Hono<{ Variables: ConsoleAuthVars }>;

import type { Phase2Store } from '../../db/phase2-store.js';
function reg(app: App, p2: (t: string) => Phase2Store, now: () => string, pre: string, kind: string, idP: string, tSuf: string): void {
    app.get(pre + '/', async (c) => c.json({ [kind + 's']: await p2(c.get('tenant')).listEdgeResources(kind) }));
    app.post(pre + '/', async (c) => { const b = await c.req.json().catch(() => ({})); const id = crypto.randomUUID(); await p2(c.get('tenant')).upsertEdgeResource({ id, kind, name: b.name ?? kind, provider: b.provider }, now()); return c.json({ id, name: b.name }); });
    app.post(pre + '/batch/delete', async (c) => { const b = await c.req.json().catch(() => ({ ids: [] })); let n=0; for (const id of (b.ids ?? [])) { await p2(c.get('tenant')).deleteEdgeResource(id); n++; } return c.json({ success: true, total: n }); });
    app.post(pre + '/test-connection', (c) => c.json({ success: false, detail: 'Not configured' }));
    app.put(pre + '/' + idP, async (c) => { const b = await c.req.json().catch(() => ({})); const id = c.req.param(idP.replace(':','')) ?? ''; await p2(c.get('tenant')).upsertEdgeResource({ id, kind, name: b.name ?? kind }, now()); return c.json({ success: true }); });
    app.delete(pre + '/' + idP, async (c) => { const id = c.req.param(idP.replace(':','')) ?? ''; await p2(c.get('tenant')).deleteEdgeResource(id); return c.json({ success: true }); });
    app.post(pre + '/' + idP + tSuf, (c) => c.json({ success: false }));
}
export function registerEdgeGenericRoutes(app: App, p2: (t: string) => Phase2Store, now: () => string): void {
    reg(app, p2, now, '/api/edge-caches', 'cache', ':cache_id', '/test');
    reg(app, p2, now, '/api/edge-queues', 'queue', ':queue_id', '/test/');
    reg(app, p2, now, '/api/edge-vectors', 'vector', ':vector_id', '/test');
}

