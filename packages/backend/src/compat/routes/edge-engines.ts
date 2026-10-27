/**
 * Engine registration/local drafts and actual system-host health.
 * Legacy remote lifecycle/inspection actions explicitly refuse until a reviewed
 * provider executor exists; local metadata is not evidence of remote effects.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono, Context } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { KeyValueStore } from '../store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { serializeEngine, buildSystemEngine, isSystemEngine, batchResult, type SystemEdgeDescriptor } from './edge-shapes.js';
import { engineCapExceeded, planLimitsForCaller, principalRole, type PlanLimits } from '../plans/gates.js';

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
    _secretCipher: SecretCipher,
    now: () => string,
    systemEdge: SystemEdgeDescriptor,
    /** Phase 6 self-aware display: per-tenant resolved cache/queue names for the
     *  system engine card (adopted is_default row name → env label → null).
     *  When provided it wins over the descriptor's static labels; a throw is
     *  swallowed — display falls back to the descriptor, never 5xx. */
    resolveSystemBindings?: (tenant: string) => Promise<{ cache?: string | null; queue?: string | null } | null>,
    /** System-engine health (product /api/health semantics, computed locally —
     *  the worker IS the engine): {status, provider, bindings:{stateDb,cache,
     *  queue,…}} in the shape HealthCheckPopover renders. When omitted the
     *  health-check route keeps its legacy behavior. */
    systemHealth?: (tenant: string) => Promise<Record<string, unknown>>,
): void {
    // Legacy inspector/lifecycle handlers below only maintain local metadata. Until
    // a reviewed provider executor exists, never present those writes as remote
    // deployments, rotations, verified domains, inspections or successful probes.
    const refuseRemoteEngine = async (c:Context<{Variables:ConsoleAuthVars}>) => {
        // Drain a small unparsed body for Worker keep-alive; cancel oversized
        // input without buffering it. Contract validation may already have read it.
        if(c.req.raw.body&&!c.req.raw.bodyUsed){const reader=c.req.raw.body.getReader();let bytes=0;
            try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>131072){await reader.cancel();break;}}}
            catch{/* Unsupported action: no provider work to confirm or retry. */}finally{reader.releaseLock();}
        }
        const id=c.req.param('engine_id');
        if(id){
            if(c.req.path.endsWith('/health-check')&&c.req.method==='GET'&&systemHealth&&isSystemEngine(id))return c.json(await systemHealth(c.get('tenant')));
            const resource=await p2(c.get('tenant')).getEdgeResource(id);
            if(!resource||resource.kind!=='engine')return c.json({detail:'Edge engine not found'},404);
        }
        c.header('X-Frontbase-External-Disabled','remote-engine-management');
        return c.json({code:'remote_engine_operation_unsupported',detail:'Remote engine management is unavailable in this host. No provider action was performed; use the reviewed deployment tooling.'},501);
    };
    // The system edge is the worker itself — synthesized per request with the live
    // origin so preview links resolve here. Listed FIRST everywhere so it is the
    // default publish target.
    const systemEngineFor = async (tenant: string, url: string): Promise<Record<string, unknown>> => {
        let bindings: { cache?: string | null; queue?: string | null } | null = null;
        if (resolveSystemBindings) {
            try {
                bindings = await resolveSystemBindings(tenant);
            } catch { /* display only — descriptor labels stand */ }
        }
        return buildSystemEngine(systemEdge, new URL(url).origin, bindings ?? undefined);
    };
    // Tier gate — the `engine_imports` plan feature flag (product LIMIT_REGISTRY
    // `kind: 'bool'` convention, default False). Deliberately STRICT: unlike the
    // product's other feature flags this one honors no self-host/master bypass —
    // engine import is a paid differentiator on every deployment shape. Unlock:
    // PUT /plans/:id with limits {"engine_imports": true}.
    const importTierError = async (tenant: string): Promise<{ detail: string } | null> => {
        const limits = await p2(tenant).getEffectiveLimits();
        return limits?.engine_imports === true ? null : { detail: 'Engine import requires an upgraded plan' };
    };
    // A-25 WA5 — the `edge_engines` COUNT cap (product LIMIT_REGISTRY 'count'
    // kind): creating one MORE stored engine must stay within the plan. Free
    // tier allows 0, so every stored-engine create is refused while the system
    // edge (synthesized, never stored) stays available. Unlike the import flag
    // this honors the master_admin bypass and is inert without effective
    // limits (self-host ⇒ no catalog ⇒ unlimited).
    const engineCapError = async (c: {
        get(name: 'principal'): unknown;
        get(name: 'tenant'): string;
    }): Promise<{ detail: string; limit: string } | null> => {
        const limits: PlanLimits | null = await planLimitsForCaller(
            (t) => p2(t).getEffectiveLimits(), c.get('tenant'), principalRole(c),
        );
        if (!limits) return null;
        const stored = await p2(c.get('tenant')).listEdgeResources('engine');
        return engineCapExceeded(limits, stored.length) ? { detail: 'limit_exceeded', limit: 'edge_engines' } : null;
    };
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

    const stateKey = (engineId: string, area: string) => `edge_engine:${engineId}:${area}`;
    const engineState = <T>(tenant: string, engineId: string, area: string, fallback: T) =>
        kvFor(tenant).getJson<T>(stateKey(engineId, area), fallback);
    const setEngineState = (tenant: string, engineId: string, area: string, value: unknown) =>
        kvFor(tenant).setJson(stateKey(engineId, area), value, now());
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
        const system = systemEngineFor(c.get('tenant'), c.req.url);
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
        // Discovery imports (FetchEnginesDialog) create engines with is_imported —
        // the tier gate applies to those, not to deploys (DeployEngineWizard).
        if (b.is_imported === true) {
            const denied = await importTierError(c.get('tenant'));
            if (denied) return c.json(denied, 403);
        }
        const capDenied = await engineCapError(c);
        if (capDenied) return c.json(capDenied, 402);
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

    // POST /api/edge-engines/deploy — managed CLI/bootstrap deployment is separate.
    // Metadata registration is not remote provisioning: refuse before any write.
    app.post('/api/edge-engines/deploy', async c => {c.header('X-Frontbase-External-Disabled','remote-deployment');return c.json({
        detail: 'Remote engine deployment is unavailable in this console. Use the reviewed deployment setup for Cloudflare or Vercel.',
        code: 'remote_deployment_unsupported',
    }, 501);});

    // POST /api/edge-engines/import — legacy base64 is not an encrypted transfer.
    app.post('/api/edge-engines/import', async c => {c.header('X-Frontbase-External-Disabled','engine-transfer');return c.json({
        detail: 'Encrypted engine transfer is unavailable. Legacy FBENG1 bundles are not accepted.',
        code: 'engine_transfer_unsupported',
    }, 501);});

    // POST /api/edge-engines/batch/delete
    app.post('/api/edge-engines/batch/delete', async (c) => {
        const body=await c.req.json().catch(() => ({}));
        if(body.delete_remote===true)return refuseRemoteEngine(c);
        return c.json(await batchOver(body, async (id) => {
            const store = p2(c.get('tenant'));
            const resource = await store.getEdgeResource(id);
            if (!resource || resource.kind !== 'engine') throw new Error('Not found');
            await store.deleteEdgeResource(id);
        }));
    });

    // Remote batch operations share the same explicit unsupported capability.
    app.post("/api/edge-engines/batch/redeploy", refuseRemoteEngine);
    app.post("/api/edge-engines/batch/toggle", refuseRemoteEngine);
    app.post("/api/edge-engines/batch/sync-check", refuseRemoteEngine);
    app.post("/api/edge-engines/batch/rotate-secrets-key", refuseRemoteEngine);

    // GET /api/edge-engines/active/by-scope/{scope}
    // The system edge is a valid publish target — include it FIRST so the console's
    // publish dialogs default to it (it's the engine this worker runs on).
    app.get('/api/edge-engines/active/by-scope/:scope', async (c) => {
        const store = p2(c.get('tenant'));
        const system = systemEngineFor(c.get('tenant'), c.req.url);
        return c.json(await Promise.all(
            [system, ...(await store.listEdgeResources('engine')).map((row) => serializeStoredEngine(store, row))],
        ));
    });

    // GET /api/edge-engines/{engine_id}
    app.get('/api/edge-engines/:engine_id', async (c) => {
        const engineId = c.req.param('engine_id');
        if (isSystemEngine(engineId)) return c.json(await systemEngineFor(c.get('tenant'), c.req.url));
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
        if(['true','1','on','yes'].includes((c.req.query('delete_remote')??'').toLowerCase()))return refuseRemoteEngine(c);
        await store.deleteEdgeResource(engineId);
        c.header('content-type', 'application/json');
        return c.body(null, 204);
    });

    // POST /api/edge-engines/{engine_id}/test
    app.post("/api/edge-engines/:engine_id/test", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/redeploy
    app.post("/api/edge-engines/:engine_id/redeploy", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/reconfigure
    app.post("/api/edge-engines/:engine_id/reconfigure", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/sync-manifest
    app.post("/api/edge-engines/:engine_id/sync-manifest", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/rotate-secrets-key
    app.post("/api/edge-engines/:engine_id/rotate-secrets-key", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/rotation-status
    app.get("/api/edge-engines/:engine_id/rotation-status", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/rotation-history
    app.get("/api/edge-engines/:engine_id/rotation-history", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/rollback-rotation
    app.post("/api/edge-engines/:engine_id/rollback-rotation", refuseRemoteEngine);

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
        return c.json({ success: true, message: 'Local source draft saved; no remote deployment was performed' });
    });

    // POST /api/edge-engines/{engine_id}/export — no secret decryption or move transition.
    app.post('/api/edge-engines/:engine_id/export', async c => {
        c.header('X-Frontbase-External-Disabled','engine-transfer');
        const engine = await p2(c.get('tenant')).getEdgeResource(c.req.param('engine_id'));
        if (!engine || engine.kind !== 'engine') return c.json({detail:'Engine not found'},404);
        return c.json({
            detail: 'Encrypted engine transfer is unavailable. No bundle was created and the engine was not moved.',
            code: 'engine_transfer_unsupported',
        },501);
    });

    // POST /api/edge-engines/{engine_id}/finalize-move
    app.post("/api/edge-engines/:engine_id/finalize-move", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/cancel-move
    app.post("/api/edge-engines/:engine_id/cancel-move", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/move-to-project
    app.post("/api/edge-engines/:engine_id/move-to-project", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/logs
    app.get("/api/edge-engines/:engine_id/logs", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/logs/sync
    app.post("/api/edge-engines/:engine_id/logs/sync", refuseRemoteEngine);

    // PATCH /api/edge-engines/{engine_id}/logs/config
    app.patch("/api/edge-engines/:engine_id/logs/config", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/logs/retention
    app.get("/api/edge-engines/:engine_id/logs/retention", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/audit/tenant-secrets
    app.get("/api/edge-engines/:engine_id/audit/tenant-secrets", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/health-check
    app.get("/api/edge-engines/:engine_id/health-check", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/inspect/source
    app.get("/api/edge-engines/:engine_id/inspect/source", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/inspect/settings
    app.get("/api/edge-engines/:engine_id/inspect/settings", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/inspect/secrets
    app.get("/api/edge-engines/:engine_id/inspect/secrets", refuseRemoteEngine);

    // GET /api/edge-engines/{engine_id}/inspect/domains
    app.get("/api/edge-engines/:engine_id/inspect/domains", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/inspect/domains
    app.post("/api/edge-engines/:engine_id/inspect/domains", refuseRemoteEngine);

    // DELETE /api/edge-engines/{engine_id}/inspect/domains/{domain_id}
    app.delete("/api/edge-engines/:engine_id/inspect/domains/:domain_id", refuseRemoteEngine);

    // POST /api/edge-engines/{engine_id}/inspect/domains/{domain_id}/verify
    app.post("/api/edge-engines/:engine_id/inspect/domains/:domain_id/verify", refuseRemoteEngine);

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
