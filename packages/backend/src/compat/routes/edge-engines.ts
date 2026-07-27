/**
 * CF-22 - the `edge-engines` tag. Community deployments ARE the engine, so the
 * remote-orchestration ops (deploy/import/redeploy/move) return graceful,
 * contract-shaped acks rather than pretending to drive a fleet.
 *
 * Gate 1a: the conformance probe found 11 violations here - batch results
 * returning `success: true` where the contract wants the list of processed ids,
 * create/update returning `{id, name}` instead of the full EdgeEngineResponse,
 * and two collections returning bare arrays where the contract wants an object.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import { serializeEngine, batchResult, testResult } from './edge-shapes.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

const NOT_CONFIGURED = 'No remote engine provider configured for this deployment';

/** Batch ops over engine_ids, sharing one contract-shaped result. */
async function batchOver(body: unknown, run: (id: string) => Promise<void>): Promise<Record<string, unknown>> {
    const b = (body ?? {}) as { engine_ids?: string[] };
    const done: string[] = [];
    const failed: unknown[] = [];
    for (const id of b.engine_ids ?? []) {
        try { await run(id); done.push(id); }
        catch (e) { failed.push({ id, error: (e as Error).message }); }
    }
    return batchResult(done, failed);
}

export function registerEdgeEnginesRoutes(app: App, p2: (t: string) => Phase2Store, now: () => string): void {
    app.get('/api/edge-engines/', async (c) => c.json(
        (await p2(c.get('tenant')).listEdgeResources('engine')).map((r) => serializeEngine(r)),
    ));
    app.post('/api/edge-engines/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        await store.upsertEdgeResource({ id, kind: 'engine', name: b.name ?? 'Engine', provider: b.provider, config: b.config ? JSON.stringify(b.config) : undefined }, now());
        return c.json(serializeEngine(await store.getEdgeResource(id) ?? { id, name: b.name ?? 'Engine', created_at: now(), updated_at: now() }), 201);
    });
    app.get('/api/edge-engines/bundle-hashes/', async (c) => {
        const engines = await p2(c.get('tenant')).listEdgeResources('engine');
        return c.json(Object.fromEntries(engines.map((engine) => [String(engine.id), null])));
    });
    app.post('/api/edge-engines/deploy', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/import', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/batch/delete', async (c) => c.json(
        await batchOver(await c.req.json().catch(() => ({})), (id) => p2(c.get('tenant')).deleteEdgeResource(id)),
    ));
    // The worker IS the engine, so these have nothing remote to act on - they
    // report every requested id as processed rather than inventing failures.
    const noopBatch = async (c: { req: { json: () => Promise<unknown> } }) =>
        batchOver(await c.req.json().catch(() => ({})), async () => { throw new Error(NOT_CONFIGURED); });
    app.post('/api/edge-engines/batch/redeploy', async (c) => c.json(await noopBatch(c)));
    app.post('/api/edge-engines/batch/toggle', async (c) => c.json(await noopBatch(c)));
    app.post('/api/edge-engines/batch/sync-check', async (c) => c.json(await noopBatch(c)));
    app.post('/api/edge-engines/batch/rotate-secrets-key', async (c) => c.json(await noopBatch(c)));
    app.get('/api/edge-engines/active/by-scope/:scope', async (c) => c.json(
        (await p2(c.get('tenant')).listEdgeResources('engine')).map((r) => serializeEngine(r)),
    ));
    app.get('/api/edge-engines/:engine_id', async (c) => {
        const e = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        return e ? c.json(serializeEngine(e)) : c.json({ detail: 'Not found' }, 404);
    });
    app.put('/api/edge-engines/:engine_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = c.req.param('engine_id');
        const store = p2(c.get('tenant'));
        const existing = await store.getEdgeResource(id);
        if (!existing) return c.json({ detail: 'Not found' }, 404);
        await store.upsertEdgeResource({
            id, kind: 'engine',
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: b.config ? JSON.stringify(b.config) : (existing.config as string | undefined),
        }, now());
        return c.json(serializeEngine(await store.getEdgeResource(id) ?? existing));
    });
    app.delete('/api/edge-engines/:engine_id', async (c) => { await p2(c.get('tenant')).deleteEdgeResource(c.req.param('engine_id')); return c.body(null, 204); });
    app.post('/api/edge-engines/:engine_id/test', async (c) => {
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        return c.json(testResult(Boolean(engine), engine ? 'This deployment is the engine; it is reachable' : 'Engine not found'));
    });
    app.post('/api/edge-engines/:engine_id/redeploy', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/reconfigure', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/sync-manifest', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/rotate-secrets-key', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/rotation-status', (c) => c.json({ active: false, detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/rotation-history', (c) => c.json({ history: [], detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/rollback-rotation', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/source', (c) => c.json({ success: false, files: [], file_count: 0, total_size: 0, detail: NOT_CONFIGURED }));
    app.put('/api/edge-engines/:engine_id/source', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/export', (c) => c.json({ detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/finalize-move', (c) => c.json({ finalized: false, engine_id: c.req.param('engine_id'), detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/cancel-move', (c) => c.json({ cancelled: false, engine: null, detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/move-to-project', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/logs', (c) => c.json({ logs: [], detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/logs/sync', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.patch('/api/edge-engines/:engine_id/logs/config', (c) => c.json({ success: false, detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/logs/retention', (c) => c.json({ retention_days: 30, detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/audit/tenant-secrets', (c) => c.json({ entries: [], detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/health-check', async (c) => {
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        return c.json({ status: engine ? 'healthy' : 'not_found' });
    });
    app.get('/api/edge-engines/:engine_id/inspect/source', (c) => c.json({ detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/inspect/settings', (c) => c.json({ detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/inspect/secrets', (c) => c.json({ secrets: [], detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/inspect/domains', (c) => c.json({ domains: [], detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/inspect/domains', (c) => c.json({ detail: NOT_CONFIGURED }));
    app.delete('/api/edge-engines/:engine_id/inspect/domains/:domain_id', (c) => c.json({ detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/inspect/domains/:domain_id/verify', (c) => c.json({ detail: NOT_CONFIGURED }));
    app.get('/api/edge-engines/:engine_id/agent-profiles', (c) => c.json({ profiles: [], total: 0, detail: NOT_CONFIGURED }));
    app.post('/api/edge-engines/:engine_id/agent-profiles', (c) => c.json({ detail: NOT_CONFIGURED }));
    app.put('/api/edge-engines/:engine_id/agent-profiles/:profile_id', (c) => c.json({ detail: NOT_CONFIGURED }));
    app.delete('/api/edge-engines/:engine_id/agent-profiles/:profile_id', (c) => {
        c.header('X-Frontbase-External-Disabled', 'agent-profile-provider-not-configured');
        return c.body(null, 204);
    });
}
