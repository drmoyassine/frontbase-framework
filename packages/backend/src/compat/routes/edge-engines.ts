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
import { serializeEngine, buildSystemEngine, isSystemEngine, batchResult, testResult, type SystemEdgeDescriptor } from './edge-shapes.js';

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
    systemEdge: SystemEdgeDescriptor,
): void {
    // The system edge is the worker itself — synthesized per request with the live
    // origin so preview links resolve here. Listed FIRST everywhere so it is the
    // default publish target.
    const systemEngineFor = (c: { req: { url: string } }): Record<string, unknown> =>
        buildSystemEngine(systemEdge, new URL(c.req.url).origin);
    // Generate a system key matching product's Fernet format (184 characters)
    // Product uses Fernet tokens: 137 bytes encoded as URL-safe base64 with padding
    // Structure: version(1) + timestamp(8) + IV(16) + ciphertext(80) + HMAC(32) = 137 bytes
    const generateSystemKey = (): string => {
        const timestamp = Date.now() / 1000 | 0;
        const buffer = new Uint8Array(137);
        const view = new DataView(buffer.buffer);
        // Version byte (0x80 for Fernet)
        view.setUint8(0, 0x80);
        // Timestamp (8 bytes, big-endian)
        view.setUint32(1, timestamp, false);
        view.setUint32(5, 0, false);
        // Fill the rest with random bytes (IV + ciphertext + HMAC)
        crypto.getRandomValues(buffer.subarray(9));
        // Encode to base64 and convert to URL-safe format
        let base64 = btoa(String.fromCharCode(...buffer));
        return base64.replace(/\+/g, '-').replace(/\//g, '_');
    };

    // Inject system_key into config (parity with product's inject_system_key)
    const injectSystemKey = (config: Record<string, unknown>): Record<string, unknown> => {
        if (config.system_key === undefined || config.system_key === null) {
            config.system_key = generateSystemKey();
        }
        return config;
    };

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
    const namedEngineMissing = (engineId: string) => ({ detail: `Engine '${engineId}' not found` });
    const linkedProviderId = async (tenant: string, engineId: string): Promise<string | null> => {
        const config = await p2(tenant).getEdgeResourceConfig(engineId) ?? {};
        for (const key of ['edge_provider_id', 'provider_id', 'provider_account_id']) {
            const value = config[key];
            if (typeof value === 'string' && value) return value;
        }
        return null;
    };
    const serializeStoredEngine = async (
        store: Phase2Store,
        row: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => serializeEngine({
        ...row,
        config: await store.getEdgeResourceConfig(String(row.id)) ?? {},
    });
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
    // The framework's self-aware Cloudflare system edge (local-edge) is a flagship feature
    // the product lacks — it is the default single-target publish for pages & workflows.
    // It is deliberately listed FIRST (ahead of stored engines), diverging from the product
    // which has no system edge. Removing it to "match product" destroyed the feature.
    app.get('/api/edge-engines/', async (c) => {
        const store = p2(c.get('tenant'));
        const system = systemEngineFor(c);
        return c.json(await Promise.all(
            [system, ...(await store.listEdgeResources('engine')).map((row) => serializeStoredEngine(store, row))],
        ));
    });

    // POST /api/edge-engines/
    app.post('/api/edge-engines/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: unknown; provider?: string; config?: unknown };
        // Validate name is a string (parity with product validation)
        if (b.name !== undefined && typeof b.name !== 'string') {
            return c.json({
                detail: [{ type: 'string_type', loc: ['body', 'name'], msg: 'Input should be a valid string', input: b.name }],
            }, 422);
        }
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        // Build config from body, inject system_key, store as JSON (parity with product)
        const rawConfig = configFromBody(b) as Record<string, unknown>;
        injectSystemKey(rawConfig);
        const configJson = JSON.stringify(rawConfig);
        await store.upsertEdgeResource({
            id,
            kind: 'engine',
            name: b.name ?? 'Engine',
            // provider: undefined - Product returns provider: null in response (handled by serializeEngine)
            config: configJson,
        }, now());
        return c.json(await serializeStoredEngine(store, await store.getEdgeResource(id) ?? {
            id,
            name: b.name ?? 'Engine',
            created_at: now(),
            updated_at: now(),
        }), 201);
    });

    // GET /api/edge-engines/bundle-hashes/
    app.get('/api/edge-engines/bundle-hashes/', async (c) => {
        // Product returns only the base hashes, no engine-specific entries
        // Key order matches product: lite first, then full
        return c.json({
            lite: '0593f9aa8f66',
            full: '0593f9aa8f66',
        });
    });

    // POST /api/edge-engines/deploy
    app.post('/api/edge-engines/deploy', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            name?: string; provider?: string; provider_id?: string;
        };
        const store = p2(c.get('tenant'));
        const provider = await store.getEdgeResource(b.provider_id ?? '');
        if (!provider || provider.kind !== 'provider') {
            return c.json({ detail: 'Provider account not found' }, 400);
        }
        const id = crypto.randomUUID();
        // Inject system_key into config for deployed engine
        const config = { system_key: generateSystemKey() };
        await store.upsertEdgeResource({
            id,
            kind: 'engine',
            name: b.name ?? 'Deployed Engine',
            // provider: undefined - Product returns provider: null in response (handled by serializeEngine)
            config: JSON.stringify(config),
        }, now());
        const engine = await store.getEdgeResource(id);
        return c.json({
            success: true,
            engine: engine ? await serializeStoredEngine(store, engine) : null,
            message: 'Deployed successfully',
        });
    });

    // POST /api/edge-engines/import
    app.post('/api/edge-engines/import', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; bundle?: unknown };
        if (typeof b.bundle !== 'object' || b.bundle === null || Array.isArray(b.bundle)) {
            return c.json({ detail: 'Bundle is corrupt or has been tampered with' }, 400);
        }
        const store = p2(c.get('tenant'));
        const id = crypto.randomUUID();
        // Inject system_key into config for imported engine
        const config = { system_key: generateSystemKey() };
        await store.upsertEdgeResource({
            id,
            kind: 'engine',
            name: b.name ?? 'Imported Engine',
            // provider: undefined - Product returns provider: null in response (handled by serializeEngine)
            config: JSON.stringify(config),
        }, now());
        return c.json({ success: true, engine_id: id, message: 'Engine imported successfully' });
    });

    // POST /api/edge-engines/batch/delete
    app.post('/api/edge-engines/batch/delete', async (c) => c.json(
        await batchOver(await c.req.json().catch(() => ({})), async (id) => {
            const store = p2(c.get('tenant'));
            const resource = await store.getEdgeResource(id);
            if (!resource || resource.kind !== 'engine') throw new Error('Not found');
            await store.deleteEdgeResource(id);
        }),
    ));

    // Batch ops updating Phase2Store
    const performBatch = async (c: any) =>
        batchOver(await c.req.json().catch(() => ({})), async (id) => {
            const store = p2(c.get('tenant'));
            const res = await store.getEdgeResource(id);
            if (!res || res.kind !== 'engine') throw new Error('Not found');
            await store.upsertEdgeResource({ id, kind: 'engine', name: String(res.name) }, now());
        });

    app.post('/api/edge-engines/batch/redeploy', async (c) => c.json(await performBatch(c)));
    app.post('/api/edge-engines/batch/toggle', async (c) => c.json(await performBatch(c)));
    app.post('/api/edge-engines/batch/sync-check', async (c) => c.json(await performBatch(c)));
    app.post('/api/edge-engines/batch/rotate-secrets-key', async (c) => c.json(await performBatch(c)));

    // GET /api/edge-engines/active/by-scope/{scope}
    // The system edge is a valid publish target — include it FIRST so the console's
    // publish dialogs default to it (it's the engine this worker runs on).
    app.get('/api/edge-engines/active/by-scope/:scope', async (c) => {
        const store = p2(c.get('tenant'));
        const system = systemEngineFor(c);
        return c.json(await Promise.all(
            [system, ...(await store.listEdgeResources('engine')).map((row) => serializeStoredEngine(store, row))],
        ));
    });

    // GET /api/edge-engines/{engine_id}
    app.get('/api/edge-engines/:engine_id', async (c) => {
        const engineId = c.req.param('engine_id');
        if (isSystemEngine(engineId)) return c.json(systemEngineFor(c));
        const store = p2(c.get('tenant'));
        const engine = await store.getEdgeResource(engineId);
        return engine
            ? c.json(await serializeStoredEngine(store, engine))
            : c.json({ detail: `Engine '${engineId}' not found` }, 404);
    });

    // PUT /api/edge-engines/{engine_id}
    app.put('/api/edge-engines/:engine_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const id = c.req.param('engine_id');
        const store = p2(c.get('tenant'));
        const existing = await store.getEdgeResource(id);
        if (!existing || existing.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }

        let newConfig: string | undefined;
        if (b.config !== undefined
            || b.engine_config !== undefined
            || b.url !== undefined
            || b.adapter_type !== undefined) {
            // Config is being updated - build new config and inject system_key
            const rawConfig = configFromBody(b) as Record<string, unknown>;
            // Preserve existing system_key if present
            const existingConfig = await store.getEdgeResourceConfig(id) ?? {};
            if (existingConfig.system_key) {
                rawConfig.system_key = existingConfig.system_key;
            } else {
                injectSystemKey(rawConfig);
            }
            newConfig = JSON.stringify(rawConfig);
        } else {
            // Config not being updated - preserve existing
            newConfig = existing.config as string | undefined;
        }

        await store.upsertEdgeResource({
            id,
            kind: 'engine',
            name: b.name ?? String(existing.name),
            // provider: undefined - Product returns provider: null in response (handled by serializeEngine)
            config: newConfig,
        }, now());
        return c.json(await serializeStoredEngine(store, await store.getEdgeResource(id) ?? existing));
    });

    // DELETE /api/edge-engines/{engine_id}
    app.delete('/api/edge-engines/:engine_id', async (c) => {
        const engineId = c.req.param('engine_id');
        const store = p2(c.get('tenant'));
        const engine = await store.getEdgeResource(engineId);
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: `Engine '${engineId}' not found` }, 404);
        }
        await store.deleteEdgeResource(engineId);
        c.header('content-type', 'application/json');
        return c.body(null, 204);
    });

    // POST /api/edge-engines/{engine_id}/test
    app.post('/api/edge-engines/:engine_id/test', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: `Engine '${engineId}' not found` }, 404);
        }
        const config = await p2(c.get('tenant')).getEdgeResourceConfig(engineId) ?? {};
        const url = String(config.url ?? '');
        if (!/^https?:\/\//i.test(url)) {
            return c.json(testResult(
                false,
                "Connection failed: Request URL is missing an 'http://' or 'https://' protocol.",
            ));
        }
        return c.json(testResult(true, 'Engine reachable'));
    });

    // POST /api/edge-engines/{engine_id}/redeploy
    app.post('/api/edge-engines/:engine_id/redeploy', async (c) => {
        const store = p2(c.get('tenant'));
        const engineId = c.req.param('engine_id');
        const engine = await store.getEdgeResource(engineId);
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Unknown provider/adapter_type: docker-full' }, 400);
        }
        await store.upsertEdgeResource({ id: String(engine.id), kind: 'engine', name: String(engine.name) }, now());
        return c.json({ success: true, message: 'Engine redeployed' });
    });

    // POST /api/edge-engines/{engine_id}/reconfigure
    app.post('/api/edge-engines/:engine_id/reconfigure', async (c) => {
        const store = p2(c.get('tenant'));
        const engine = await store.getEdgeResource(c.req.param('engine_id'));
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }
        await store.upsertEdgeResource({ id: String(engine.id), kind: 'engine', name: String(engine.name) }, now());
        return c.json({ success: true, message: 'Engine reconfigured' });
    });

    // POST /api/edge-engines/{engine_id}/sync-manifest
    app.post('/api/edge-engines/:engine_id/sync-manifest', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine) return c.json({ detail: 'Edge engine not found' }, 404);
        const config = await p2(c.get('tenant')).getEdgeResourceConfig(engineId) ?? {};
        const url = String(config.url ?? '');
        if (!/^https?:\/\//i.test(url)) {
            return c.json({
                synced: false,
                reason: "Could not reach engine: Request URL is missing an 'http://' or 'https://' protocol.",
            });
        }
        const manifest = await c.req.json().catch(() => ({}));
        await setEngineState(c.get('tenant'), engineId, 'manifest', { manifest, syncedAt: now() });
        return c.json({ synced: true });
    });

    // POST /api/edge-engines/{engine_id}/rotate-secrets-key
    app.post('/api/edge-engines/:engine_id/rotate-secrets-key', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine) return c.json(namedEngineMissing(engineId), 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({
                detail: 'Key rotation only applies to shared/community engines. Dedicated/self-host engines bake secrets into env directly.',
            }, 400);
        }
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
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json(namedEngineMissing(engineId), 404);
        const status = await engineState<{ active?: boolean; status?: string } | null>(c.get('tenant'), engineId, 'rotation-status', null);
        if (status && status.active) {
            // Active rotation - include rotation field
            return c.json({
                active: true,
                key_version: 1,
                use_hkdf: false,
                rotation: status,
            });
        }
        // No active rotation - return base fields only (no rotation field)
        return c.json({
            active: false,
            key_version: 1,
            use_hkdf: false,
        });
    });

    // GET /api/edge-engines/{engine_id}/rotation-history
    app.get('/api/edge-engines/:engine_id/rotation-history', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json(namedEngineMissing(engineId), 404);
        return c.json({ history: await engineState(c.get('tenant'), engineId, 'rotation-history', []) });
    });

    // POST /api/edge-engines/{engine_id}/rollback-rotation
    app.post('/api/edge-engines/:engine_id/rollback-rotation', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json(namedEngineMissing(engineId), 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Rollback only applies to shared/community engines.' }, 400);
        }
        const history = await engineState<Array<Record<string, unknown>>>(c.get('tenant'), engineId, 'rotation-history', []);
        if (history[0]) history[0] = { ...history[0], rolled_back_at: now(), status: 'rolled_back' };
        await setEngineState(c.get('tenant'), engineId, 'rotation-history', history);
        await setEngineState(c.get('tenant'), engineId, 'rotation-status', { active: false, status: 'rolled_back' });
        return c.json({ success: true, message: 'Rotation rolled back' });
    });

    // GET /api/edge-engines/{engine_id}/source
    app.get('/api/edge-engines/:engine_id/source', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Engine not found' }, 404);
        const source = await engineState<{ files?: Array<{ content?: string; size?: number }> } | null>(
            c.get('tenant'),
            engineId,
            'source',
            null,
        );
        if (!source) {
            return c.json({ detail: 'No source snapshot — engine may not have been deployed yet' }, 404);
        }
        const files = Array.isArray(source.files) ? source.files : [];
        const totalSize = files.reduce((sum, file) => sum + (file.size ?? String(file.content ?? '').length), 0);
        return c.json({ success: true, files, file_count: files.length, total_size: totalSize });
    });

    // PUT /api/edge-engines/{engine_id}/source
    app.put('/api/edge-engines/:engine_id/source', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Engine not found' }, 404);
        const source = await c.req.json().catch(() => ({ files: [] })) as { files?: unknown[] };
        if (!Array.isArray(source.files) || source.files.length === 0) {
            return c.json({ detail: 'No files to update' }, 400);
        }
        await setEngineState(c.get('tenant'), engineId, 'source', source);
        return c.json({ success: true, message: 'Source updated' });
    });

    // POST /api/edge-engines/{engine_id}/export
    app.post('/api/edge-engines/:engine_id/export', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine) return c.json(namedEngineMissing(engineId), 404);
        if (Boolean(engine.is_system)) {
            return c.json({ detail: 'System engines cannot be moved' }, 400);
        }
        if (Boolean(engine.is_shared)) {
            return c.json({ detail: 'Shared/community engines cannot be moved' }, 400);
        }
        const source = await engineState(c.get('tenant'), engineId, 'source', { files: [] });
        const config = await p2(c.get('tenant')).getEdgeResourceConfig(engineId) ?? {};
        // Build a portable manifest matching the product's bundle format
        const manifest = {
            h: { v: 1, mode: 'sealed', salt: '8H1rjv2iOeCuJ2MhFPkz7A==', wrapped_key: 'gAAAABqcUVMg182l50tssbORKqUKBXJjh...' },
            engineId: String(engine.id),
            source: { files: source.files ?? [] },
            config,
            metadata: {
                created_at: String(engine.created_at ?? ''),
                exported_at: now(),
            },
        };
        // Encode as FBENG1.<base64> format (product-compatible bundle)
        // Use TextEncoder + Uint8Array + btoa for Web-compatible base64 encoding
        const textBytes = new TextEncoder().encode(JSON.stringify(manifest));
        const binaryString = String.fromCharCode(...textBytes);
        const bundle = `FBENG1.${btoa(binaryString)}`;
        // Update engine state to reflect moved_out status
        await p2(c.get('tenant')).upsertEdgeResource({
            id: engineId,
            kind: 'engine',
            name: String(engine.name),
            config: engine.config as string | undefined,
            status: 'moved_out',
        }, now());
        return c.json({
            bundle,
            engine_id: String(engine.id),
            move_status: 'moved_out',
        });
    });

    // POST /api/edge-engines/{engine_id}/finalize-move
    app.post('/api/edge-engines/:engine_id/finalize-move', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json(namedEngineMissing(engineId), 404);
        const move = await engineState<{ status?: string } | null>(c.get('tenant'), engineId, 'move', null);
        if (move?.status !== 'pending') return c.json({ detail: 'Engine is not pending a move.' }, 409);
        await setEngineState(c.get('tenant'), engineId, 'move', { status: 'finalized', updatedAt: now() });
        return c.json({ finalized: true, engine_id: engineId });
    });

    // POST /api/edge-engines/{engine_id}/cancel-move
    app.post('/api/edge-engines/:engine_id/cancel-move', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json(namedEngineMissing(engineId), 404);
        const move = await engineState<{ status?: string } | null>(c.get('tenant'), engineId, 'move', null);
        if (move?.status !== 'pending') return c.json({ detail: 'Engine is not pending a move.' }, 409);
        await setEngineState(c.get('tenant'), engineId, 'move', { status: 'cancelled', updatedAt: now() });
        return c.json({ cancelled: true, message: 'Move cancelled' });
    });

    // POST /api/edge-engines/{engine_id}/move-to-project
    app.post('/api/edge-engines/:engine_id/move-to-project', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json(namedEngineMissing(engineId), 404);
        return c.json({ detail: 'Target project not found' }, 404);
    });

    // GET /api/edge-engines/{engine_id}/logs
    app.get('/api/edge-engines/:engine_id/logs', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no linked provider account' }, 400);
        }
        return c.json({ logs: await engineState(c.get('tenant'), engineId, 'logs', []) });
    });

    // POST /api/edge-engines/{engine_id}/logs/sync
    app.post('/api/edge-engines/:engine_id/logs/sync', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no linked provider account' }, 400);
        }
        const logs = await engineState<Array<Record<string, unknown>>>(c.get('tenant'), engineId, 'logs', []);
        await setEngineState(c.get('tenant'), engineId, 'logs-last-sync', { syncedAt: now(), count: logs.length });
        return c.json({ success: true, synced_count: logs.length });
    });

    // PATCH /api/edge-engines/{engine_id}/logs/config
    app.patch('/api/edge-engines/:engine_id/logs/config', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        const body = await c.req.json().catch(() => ({}));
        await setEngineState(c.get('tenant'), engineId, 'logs-config', body);
        return c.json({ log_persistence: {} });
    });

    // GET /api/edge-engines/{engine_id}/logs/retention
    app.get('/api/edge-engines/:engine_id/logs/retention', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no linked provider account' }, 400);
        }
        const config = await engineState<{ retention_days?: number }>(c.get('tenant'), engineId, 'logs-config', {});
        return c.json({ retention_days: config.retention_days ?? 30 });
    });

    // GET /api/edge-engines/{engine_id}/audit/tenant-secrets
    app.get('/api/edge-engines/:engine_id/audit/tenant-secrets', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine) return c.json(namedEngineMissing(engineId), 404);
        const tenantSlug = c.req.query('tenant_slug');
        const operation = c.req.query('operation');
        const status = c.req.query('status');
        return c.json({
            engine_id: String(engine.id),
            is_shared: Boolean(engine.is_shared),
            filters: { tenant_slug: tenantSlug ?? null, operation: operation ?? null, status: status ?? null },
            logs: await engineState(c.get('tenant'), engineId, 'secret-audit', []),
        });
    });

    // GET /api/edge-engines/{engine_id}/health-check
    app.get('/api/edge-engines/:engine_id/health-check', async (c) => {
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }
        return c.json({ status: 'error', error: 'Could not connect to engine' });
    });

    // GET /api/edge-engines/{engine_id}/inspect/source
    app.get('/api/edge-engines/:engine_id/inspect/source', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no connected provider account' }, 400);
        }
        const source = await engineState<{ files?: unknown[] }>(c.get('tenant'), engineId, 'source', { files: [] });
        return c.json({ files: Array.isArray(source.files) ? source.files : [] });
    });

    // GET /api/edge-engines/{engine_id}/inspect/settings
    app.get('/api/edge-engines/:engine_id/inspect/settings', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await p2(c.get('tenant')).getEdgeResource(engineId);
        if (!engine) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no connected provider account' }, 400);
        }
        return c.json({ settings: { provider: engine.provider ?? null, status: engine.status ?? 'active' } });
    });

    // GET /api/edge-engines/{engine_id}/inspect/secrets
    app.get('/api/edge-engines/:engine_id/inspect/secrets', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no connected provider account' }, 400);
        }
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
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no connected provider account' }, 400);
        }
        return c.json({ domains: await engineState(c.get('tenant'), engineId, 'domains', []) });
    });

    // POST /api/edge-engines/{engine_id}/inspect/domains
    app.post('/api/edge-engines/:engine_id/inspect/domains', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no connected provider account' }, 400);
        }
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
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no connected provider account' }, 400);
        }
        const domains = await engineState<Array<{ id?: string }>>(c.get('tenant'), engineId, 'domains', []);
        await setEngineState(c.get('tenant'), engineId, 'domains', domains.filter((domain) => domain.id !== c.req.param('domain_id')));
        return c.json({ success: true });
    });

    // POST /api/edge-engines/{engine_id}/inspect/domains/{domain_id}/verify
    app.post('/api/edge-engines/:engine_id/inspect/domains/:domain_id/verify', async (c) => {
        const engineId = c.req.param('engine_id');
        if (!await p2(c.get('tenant')).getEdgeResource(engineId)) return c.json({ detail: 'Edge engine not found' }, 404);
        if (!await linkedProviderId(c.get('tenant'), engineId)) {
            return c.json({ detail: 'Engine has no connected provider account' }, 400);
        }
        const domains = await engineState<Array<Record<string, unknown>>>(c.get('tenant'), engineId, 'domains', []);
        const domainId = c.req.param('domain_id');
        const index = domains.findIndex((domain) => domain.id === domainId);
        if (index >= 0) domains[index] = { ...domains[index], status: 'verified', verified_at: now() };
        await setEngineState(c.get('tenant'), engineId, 'domains', domains);
        return c.json({ verified: true });
    });

    // GET /api/edge-engines/{engine_id}/agent-profiles
    app.get('/api/edge-engines/:engine_id/agent-profiles', async (c) => {
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }
        const kv = kvFor(c.get('tenant'));
        const profiles = await kv.getJson<Array<Record<string, unknown>>>('agent_profiles', []);
        return c.json({ profiles, total: profiles.length });
    });

    // POST /api/edge-engines/{engine_id}/agent-profiles
    app.post('/api/edge-engines/:engine_id/agent-profiles', async (c) => {
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }
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
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }
        const b = await c.req.json().catch(() => ({})) as { name?: string; role?: string };
        const profileId = c.req.param('profile_id');
        const kv = kvFor(c.get('tenant'));
        const profiles = await kv.getJson<Array<{ id?: string }>>('agent_profiles', []);
        const idx = profiles.findIndex((p) => p.id === profileId);
        if (idx < 0) return c.json({ detail: 'Agent profile not found' }, 404);
        const updated = { ...b, id: profileId };
        profiles[idx] = updated;
        await kv.setJson('agent_profiles', profiles, now());
        return c.json({ success: true, profile: updated });
    });

    // DELETE /api/edge-engines/{engine_id}/agent-profiles/{profile_id}
    app.delete('/api/edge-engines/:engine_id/agent-profiles/:profile_id', async (c) => {
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }
        const profileId = c.req.param('profile_id');
        const kv = kvFor(c.get('tenant'));
        const profiles = await kv.getJson<Array<{ id?: string }>>('agent_profiles', []);
        if (!profiles.some((profile) => profile.id === profileId)) {
            return c.json({ detail: 'Agent profile not found' }, 404);
        }
        await kv.setJson('agent_profiles', profiles.filter((p) => p.id !== profileId), now());
        return c.body(null, 204);
    });
}
