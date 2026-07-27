/**
 * CF-22 — the three structurally identical edge resource tags: caches, queues,
 * vectors. One registrar, because their contracts differ only in the name of the
 * URL field (`cache_url` / `queue_url` / `vector_url`) and queues' extra
 * `has_signing_key`.
 *
 * Gate 1a: these handlers used to return ad-hoc shapes ({id, name} on create,
 * {success: true} on update, {success: true, total: n} on batch delete). The
 * contract requires the full resource object on create/update, and batch results
 * where `success` is the LIST of ids processed, not a boolean. The conformance
 * probe (test/compat-conformance.mjs) caught every one of these.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import { serializeEdgeResource as serialize, batchResult, testResult } from './edge-shapes.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

function reg(app: App, p2: (t: string) => Phase2Store, now: () => string, pre: string, kind: string, idP: string, tSuf: string, urlField: string, extra: Record<string, unknown> = {}): void {
    const param = idP.replace(':', '');

    app.get(pre + '/', async (c) => c.json(
        (await p2(c.get('tenant')).listEdgeResources(kind)).map((r) => serialize(r, urlField, extra)),
    ));

    app.post(pre + '/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        await store.upsertEdgeResource({
            id, kind, name: b.name ?? kind, provider: b.provider,
            config: b.config ? JSON.stringify(b.config) : undefined,
        }, now());
        const row = await store.getEdgeResource(id);
        return c.json(serialize(row ?? { id, name: b.name ?? kind, provider: b.provider, created_at: now(), updated_at: now() }, urlField, extra), 201);
    });

    app.post(pre + '/batch/delete', async (c) => {
        const b = await c.req.json().catch(() => ({ ids: [] as string[] })) as { ids?: string[] };
        const store = p2(c.get('tenant'));
        const done: string[] = [];
        const failed: unknown[] = [];
        for (const id of b.ids ?? []) {
            try { await store.deleteEdgeResource(id); done.push(id); }
            catch (e) { failed.push({ id, error: (e as Error).message }); }
        }
        return c.json(batchResult(done, failed));
    });

    app.post(pre + '/test-connection', (c) => c.json(testResult(false, 'No provider configured for this deployment')));

    app.put(pre + '/' + idP, async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = c.req.param(param) ?? '';
        const store = p2(c.get('tenant'));
        const existing = await store.getEdgeResource(id);
        if (!existing) return c.json({ detail: 'Not found' }, 404);
        await store.upsertEdgeResource({
            id, kind,
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: b.config ? JSON.stringify(b.config) : (existing.config as string | undefined),
        }, now());
        return c.json(serialize(await store.getEdgeResource(id) ?? existing, urlField, extra));
    });

    app.delete(pre + '/' + idP, async (c) => {
        await p2(c.get('tenant')).deleteEdgeResource(c.req.param(param) ?? '');
        return c.json({ success: true });
    });

    app.post(pre + '/' + idP + tSuf, (c) => c.json(testResult(false, 'No provider configured for this deployment')));
}

export function registerEdgeGenericRoutes(app: App, p2: (t: string) => Phase2Store, now: () => string): void {
    reg(app, p2, now, '/api/edge-caches', 'cache', ':cache_id', '/test', 'cache_url');
    reg(app, p2, now, '/api/edge-queues', 'queue', ':queue_id', '/test/', 'queue_url', { has_signing_key: false });
    reg(app, p2, now, '/api/edge-vectors', 'vector', ':vector_id', '/test', 'vector_url');
}
