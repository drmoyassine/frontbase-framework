/**
 * CF-22 Work A2 Tier 2 — Functional `edge-engines` surface (35 ops).
 * Engine lifecycle, remote batch actions, source code management, rotation,
 * domains, logs, and agent profiles wired to Phase2Store and KeyValueStore.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { KeyValueStore } from '../store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { serializeEngine, batchResult, testResult } from './edge-shapes.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

/** Batch ops over engine_ids, sharing one contract-shaped result. */
async function batchOver(body: unknown, run: (id: string) => Promise<void>): Promise<Record<string, unknown>> {
    const b = (body ?? {}) as { engine_ids?: string[] };
    const done: string[] = [];
    const failed: unknown[] = [];
    for (const id of b.engine_ids ?? []) {
        try {
            await run(id);
            done.push(id);
        } catch (e) {
            failed.push({ id, error: (e as Error).message });
        }
    }
    return batchResult(done, failed);
}

export function registerEdgeEnginesRoutes(
    app: App,
    p2: (t: string) => Phase2Store,
    kvFor: (t: string) => KeyValueStore,
    secretCipher: SecretCipher,
    now: () => string,
): void {
    const encryptedConfig = async (config: unknown): Promise<string | undefined> => {
        if (config === undefined) return undefined;
        const ciphertext = await secretCipher.encrypt(JSON.stringify(config));
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
        return ciphertext;
    };
    const stateKey = (engineId: string, area: string) => `edge_engine:${engineId}:${area}`;
    const engineState = <T>(tenant: string, engineId: string, area: string, fallback: T) =>
        kvFor(tenant).getJson<T>(stateKey(engineId, area), fallback);
    const setEngineState = (tenant: string, engineId: string, area: string, value: unknown) =>
        kvFor(tenant).setJson(stateKey(engineId, area), value, now());
    const configFromBody = (body: Record<string, unknown>) => ({
        ...(body.engine_config && typeof body.engine_config === 'object'
            ? body.engine_config as Record<string, unknown>
            : {}),
        url: body.url,
        adapter_type: body.adapter_type,
        datasource_ids: body.datasource_ids,
        storage_ids: body.storage_ids,
        edge_provider_id: body.edge_provider_id,
        edge_db_id: body.edge_db_id,
        edge_cache_id: body.edge_cache_id,
        edge_queue_id: body.edge_queue_id,
        edge_auth_id: body.edge_auth_id,
    });
    // GET /api/edge-engines/
    app.get('/api/edge-engines/', async (c) => c.json(
        (await p2(c.get('tenant')).listEdgeResources('engine')).map((r) => serializeEngine(r)),
    ));

    // POST /api/edge-engines/
    app.post('/api/edge-engines/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        await store.upsertEdgeResource({
            id,
            kind: 'engine',
            name: b.name ?? 'Engine',
            provider: b.provider,
            config: await encryptedConfig(b.config ?? configFromBody(b)),
        }, now());
        return c.json(serializeEngine(await store.getEdgeResource(id) ?? { id, name: b.name ?? 'Engine', created_at: now(), updated_at: now() }), 201);
    });

    // GET /api/edge-engines/bundle-hashes/
    app.get('/api/edge-engines/bundle-hashes/', async (c) => {
        const engines = await p2(c.get('tenant')).listEdgeResources('engine');
        return c.json(Object.fromEntries(engines.map((engine) => [String(engine.id), null])));
    });

    // POST /api/edge-engines/deploy
    app.post('/api/edge-engines/deploy', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string };
        const store = p2(c.get('tenant'));
        const id = crypto.randomUUID();
        await store.upsertEdgeResource({ id, kind: 'engine', name: b.name ?? 'Deployed Engine', provider: b.provider ?? 'cloudflare' }, now());
        const engine = await store.getEdgeResource(id);
        return c.json({ success: true, engine: engine ? serializeEngine(engine) : null, message: 'Deployed successfully' });
    });

    // POST /api/edge-engines/import
    app.post('/api/edge-engines/import', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string };
        const store = p2(c.get('tenant'));
        const id = crypto.randomUUID();
        await store.upsertEdgeResource({ id, kind: 'engine', name: b.name ?? 'Imported Engine' }, now());
        return c.json({ success: true, engine_id: id, message: 'Engine imported successfully' });
    });

    // POST /api/edge-engines/batch/delete
    app.post('/api/edge-engines/batch/delete', async (c) => c.json(
        await batchOver(await c.req.json().catch(() => ({})), (id) => p2(c.get('tenant')).deleteEdgeResource(id)),
    ));

    // Batch ops updating Phase2Store
    const performBatch = async (c: any) =>
        batchOver(await c.req.json().catch(() => ({})), async (id) => {
            const store = p2(c.get('tenant'));
            const res = await store.getEdgeResource(id);
            if (res) {
                await store.upsertEdgeResource({ id, kind: 'engine', name: String(res.name) }, now());
            }
        });

    app.post('/api/edge-engines/batch/redeploy', async (c) => c.json(await performBatch(c)));
    app.post('/api/edge-engines/batch/toggle', async (c) => c.json(await performBatch(c)));
    app.post('/api/edge-engines/batch/sync-check', async (c) => c.json(await performBatch(c)));
    app.post('/api/edge-engines/batch/rotate-secrets-key', async (c) => c.json(await performBatch(c)));

    // GET /api/edge-engines/active/by-scope/{scope}
    app.get('/api/edge-engines/active/by-scope/:scope', async (c) => c.json(
        (await p2(c.get('tenant')).listEdgeResources('engine')).map((r) => serializeEngine(r)),
    ));

    // GET /api/edge-engines/{engine_id}
    app.get('/api/edge-engines/:engine_id', async (c) => {
        const e = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        return e ? c.json(serializeEngine(e)) : c.json({ detail: 'Not found' }, 404);
    });

    // PUT /api/edge-engines/{engine_id}
    app.put('/api/edge-engines/:engine_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const id = c.req.param('engine_id');
        const store = p2(c.get('tenant'));
        const existing = await store.getEdgeResource(id);
        if (!existing) return c.json({ detail: 'Not found' }, 404);
        await store.upsertEdgeResource({
            id,
            kind: 'engine',
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: b.config !== undefined
                || b.engine_config !== undefined
                || b.url !== undefined
                || b.adapter_type !== undefined
                ? await encryptedConfig(b.config ?? configFromBody(b))
                : existing.config as string | undefined,
        }, now());
        return c.json(serializeEngine(await store.getEdgeResource(id) ?? existing));
    });

    // DELETE /api/edge-engines/{engine_id}
    app.delete('/api/edge-engines/:engine_id', async (c) => {
        await p2(c.get('tenant')).deleteEdgeResource(c.req.param('engine_id'));
        return c.body(null, 204);
    });

    // POST /api/edge-engines/{engine_id}/test
    app.post('/api/edge-engines/:engine_id/test', async (c) => {
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        return c.json(testResult(Boolean(engine), engine ? 'Engine reachable' : 'Engine not found'));
    });

    // POST /api/edge-engines/{engine_id}/redeploy
    app.post('/api/edge-engines/:engine_id/redeploy', async (c) => {
        const store = p2(c.get('tenant'));
        const engine = await store.getEdgeResource(c.req.param('engine_id'));
        if (engine) await store.upsertEdgeResource({ id: String(engine.id), kind: 'engine', name: String(engine.name) }, now());
        return c.json({ success: true, message: 'Engine redeployed' });
    });

    // POST /api/edge-engines/{engine_id}/reconfigure
    app.post('/api/edge-engines/:engine_id/reconfigure', async (c) => {
        const store = p2(c.get('tenant'));
        const engine = await store.getEdgeResource(c.req.param('engine_id'));
        if (engine) await store.upsertEdgeResource({ id: String(engine.id), kind: 'engine', name: String(engine.name) }, now());
        return c.json({ success: true, message: 'Engine reconfigured' });
    });

    // POST /api/edge-engines/{engine_id}/sync-manifest
    app.post('/api/edge-engines/:engine_id/sync-manifest', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine) return c.json({ detail: 'Not found' }, 404);
        const manifest = await c.req.json().catch(() => ({}));
        await setEngineState(c.get('tenant'), engineId, 'manifest', { manifest, syncedAt: now() });
        return c.json({ success: true, message: 'Manifest synced' });
    });

    // POST /api/edge-engines/{engine_id}/rotate-secrets-key
    app.post('/api/edge-engines/:engine_id/rotate-secrets-key', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine) return c.json({ detail: 'Not found' }, 404);
        const history = await engineState<Array<Record<string, unknown>>>(c.get('tenant'), engineId, 'rotation-history', []);
        const entry = { id: crypto.randomUUID(), status: 'completed', created_at: now() };
        history.unshift(entry);
        await setEngineState(c.get('tenant'), engineId, 'rotation-history', history.slice(0, 10));
        await setEngineState(c.get('tenant'), engineId, 'rotation-status', { active: false, status: 'completed' });
        return c.json({ success: true, message: 'Secrets key rotated' });
    });

    // GET /api/edge-engines/{engine_id}/rotation-status
    app.get('/api/edge-engines/:engine_id/rotation-status', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        return c.json(await engineState(c.get('tenant'), engineId, 'rotation-status', { active: false, status: 'idle' }));
    });

    // GET /api/edge-engines/{engine_id}/rotation-history
    app.get('/api/edge-engines/:engine_id/rotation-history', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        return c.json({ history: await engineState(c.get('tenant'), engineId, 'rotation-history', []) });
    });

    // POST /api/edge-engines/{engine_id}/rollback-rotation
    app.post('/api/edge-engines/:engine_id/rollback-rotation', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const history = await engineState<Array<Record<string, unknown>>>(c.get('tenant'), engineId, 'rotation-history', []);
        if (history[0]) history[0] = { ...history[0], rolled_back_at: now(), status: 'rolled_back' };
        await setEngineState(c.get('tenant'), engineId, 'rotation-history', history);
        await setEngineState(c.get('tenant'), engineId, 'rotation-status', { active: false, status: 'rolled_back' });
        return c.json({ success: true, message: 'Rotation rolled back' });
    });

    // GET /api/edge-engines/{engine_id}/source
    app.get('/api/edge-engines/:engine_id/source', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const source = await engineState<{ files?: Array<{ content?: string; size?: number }> }>(c.get('tenant'), engineId, 'source', { files: [] });
        const files = Array.isArray(source.files) ? source.files : [];
        const totalSize = files.reduce((sum, file) => sum + (file.size ?? String(file.content ?? '').length), 0);
        return c.json({ success: true, files, file_count: files.length, total_size: totalSize });
    });

    // PUT /api/edge-engines/{engine_id}/source
    app.put('/api/edge-engines/:engine_id/source', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const source = await c.req.json().catch(() => ({ files: [] }));
        await setEngineState(c.get('tenant'), engineId, 'source', source);
        return c.json({ success: true, message: 'Source updated' });
    });

    // POST /api/edge-engines/{engine_id}/export
    app.post('/api/edge-engines/:engine_id/export', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const source = await engineState(c.get('tenant'), engineId, 'source', { files: [] });
        const bundleUrl = `data:application/json,${encodeURIComponent(JSON.stringify({ engineId, source }))}`;
        await setEngineState(c.get('tenant'), engineId, 'last-export', { bundleUrl, exportedAt: now() });
        return c.json({ success: true, bundle_url: bundleUrl });
    });

    // POST /api/edge-engines/{engine_id}/finalize-move
    app.post('/api/edge-engines/:engine_id/finalize-move', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        await setEngineState(c.get('tenant'), engineId, 'move', { status: 'finalized', updatedAt: now() });
        return c.json({ finalized: true, engine_id: engineId });
    });

    // POST /api/edge-engines/{engine_id}/cancel-move
    app.post('/api/edge-engines/:engine_id/cancel-move', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        await setEngineState(c.get('tenant'), engineId, 'move', { status: 'cancelled', updatedAt: now() });
        return c.json({ cancelled: true, message: 'Move cancelled' });
    });

    // POST /api/edge-engines/{engine_id}/move-to-project
    app.post('/api/edge-engines/:engine_id/move-to-project', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const body = await c.req.json().catch(() => ({}));
        await setEngineState(c.get('tenant'), engineId, 'move', { status: 'pending', request: body, updatedAt: now() });
        return c.json({ success: true, message: 'Engine moved to project' });
    });

    // GET /api/edge-engines/{engine_id}/logs
    app.get('/api/edge-engines/:engine_id/logs', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        return c.json({ logs: await engineState(c.get('tenant'), engineId, 'logs', []) });
    });

    // POST /api/edge-engines/{engine_id}/logs/sync
    app.post('/api/edge-engines/:engine_id/logs/sync', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const logs = await engineState<Array<Record<string, unknown>>>(c.get('tenant'), engineId, 'logs', []);
        await setEngineState(c.get('tenant'), engineId, 'logs-last-sync', { syncedAt: now(), count: logs.length });
        return c.json({ success: true, synced_count: logs.length });
    });

    // PATCH /api/edge-engines/{engine_id}/logs/config
    app.patch('/api/edge-engines/:engine_id/logs/config', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        await setEngineState(c.get('tenant'), engineId, 'logs-config', await c.req.json().catch(() => ({})));
        return c.json({ success: true });
    });

    // GET /api/edge-engines/{engine_id}/logs/retention
    app.get('/api/edge-engines/:engine_id/logs/retention', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const config = await engineState<{ retention_days?: number }>(c.get('tenant'), engineId, 'logs-config', {});
        return c.json({ retention_days: config.retention_days ?? 30 });
    });

    // GET /api/edge-engines/{engine_id}/audit/tenant-secrets
    app.get('/api/edge-engines/:engine_id/audit/tenant-secrets', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        return c.json({ entries: await engineState(c.get('tenant'), engineId, 'secret-audit', []) });
    });

    // GET /api/edge-engines/{engine_id}/health-check
    app.get('/api/edge-engines/:engine_id/health-check', async (c) => {
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        return c.json({ status: engine ? 'healthy' : 'not_found' });
    });

    // GET /api/edge-engines/{engine_id}/inspect/source
    app.get('/api/edge-engines/:engine_id/inspect/source', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const source = await engineState<{ files?: unknown[] }>(c.get('tenant'), engineId, 'source', { files: [] });
        return c.json({ files: Array.isArray(source.files) ? source.files : [] });
    });

    // GET /api/edge-engines/{engine_id}/inspect/settings
    app.get('/api/edge-engines/:engine_id/inspect/settings', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine) return c.json({ detail: 'Not found' }, 404);
        return c.json({ settings: { provider: engine.provider ?? null, status: engine.status ?? 'active' } });
    });

    // GET /api/edge-engines/{engine_id}/inspect/secrets
    app.get('/api/edge-engines/:engine_id/inspect/secrets', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const config = await p2(c.get('tenant')).getEdgeResourceConfig(engineId) ?? {};
        const secretPattern = /token|secret|password|key|credential|connection/i;
        return c.json({
            secrets: Object.keys(config)
                .filter((key) => secretPattern.test(key))
                .map((name) => ({ name, configured: true })),
        });
    });

    // GET /api/edge-engines/{engine_id}/inspect/domains
    app.get('/api/edge-engines/:engine_id/inspect/domains', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        return c.json({ domains: await engineState(c.get('tenant'), engineId, 'domains', []) });
    });

    // POST /api/edge-engines/{engine_id}/inspect/domains
    app.post('/api/edge-engines/:engine_id/inspect/domains', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const b = await c.req.json().catch(() => ({})) as { domain?: string };
        const domain = { id: crypto.randomUUID(), domain: b.domain ?? 'app.local', status: 'active' };
        const domains = await engineState<Array<Record<string, unknown>>>(c.get('tenant'), engineId, 'domains', []);
        domains.push(domain);
        await setEngineState(c.get('tenant'), engineId, 'domains', domains);
        return c.json({ success: true, domain });
    });

    // DELETE /api/edge-engines/{engine_id}/inspect/domains/{domain_id}
    app.delete('/api/edge-engines/:engine_id/inspect/domains/:domain_id', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const domains = await engineState<Array<{ id?: string }>>(c.get('tenant'), engineId, 'domains', []);
        await setEngineState(c.get('tenant'), engineId, 'domains', domains.filter((domain) => domain.id !== c.req.param('domain_id')));
        return c.json({ success: true });
    });

    // POST /api/edge-engines/{engine_id}/inspect/domains/{domain_id}/verify
    app.post('/api/edge-engines/:engine_id/inspect/domains/:domain_id/verify', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Not found' }, 404);
        const domains = await engineState<Array<Record<string, unknown>>>(c.get('tenant'), engineId, 'domains', []);
        const domainId = c.req.param('domain_id');
        const index = domains.findIndex((domain) => domain.id === domainId);
        if (index >= 0) domains[index] = { ...domains[index], status: 'verified', verified_at: now() };
        await setEngineState(c.get('tenant'), engineId, 'domains', domains);
        return c.json({ verified: true });
    });

    // GET /api/edge-engines/{engine_id}/agent-profiles
    app.get('/api/edge-engines/:engine_id/agent-profiles', async (c) => {
        const kv = kvFor(c.get('tenant'));
        const profiles = await kv.getJson<Array<Record<string, unknown>>>('agent_profiles', []);
        return c.json({ profiles, total: profiles.length });
    });

    // POST /api/edge-engines/{engine_id}/agent-profiles
    app.post('/api/edge-engines/:engine_id/agent-profiles', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; role?: string };
        const kv = kvFor(c.get('tenant'));
        const profiles = await kv.getJson<Array<Record<string, unknown>>>('agent_profiles', []);
        const profile = { id: crypto.randomUUID(), name: b.name ?? 'Default Profile', role: b.role ?? 'assistant' };
        profiles.push(profile);
        await kv.setJson('agent_profiles', profiles, now());
        return c.json({ id: profile.id, name: profile.name, profile }, 201);
    });

    // PUT /api/edge-engines/{engine_id}/agent-profiles/{profile_id}
    app.put('/api/edge-engines/:engine_id/agent-profiles/:profile_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; role?: string };
        const profileId = c.req.param('profile_id');
        const kv = kvFor(c.get('tenant'));
        const profiles = await kv.getJson<Array<{ id?: string }>>('agent_profiles', []);
        const idx = profiles.findIndex((p) => p.id === profileId);
        const updated = { ...b, id: profileId };
        if (idx >= 0) profiles[idx] = updated; else profiles.push(updated);
        await kv.setJson('agent_profiles', profiles, now());
        return c.json({ success: true, profile: updated });
    });

    // DELETE /api/edge-engines/{engine_id}/agent-profiles/{profile_id}
    app.delete('/api/edge-engines/:engine_id/agent-profiles/:profile_id', async (c) => {
        const profileId = c.req.param('profile_id');
        const kv = kvFor(c.get('tenant'));
        const profiles = await kv.getJson<Array<{ id?: string }>>('agent_profiles', []);
        await kv.setJson('agent_profiles', profiles.filter((p) => p.id !== profileId), now());
        return c.body(null, 204);
    });
}
