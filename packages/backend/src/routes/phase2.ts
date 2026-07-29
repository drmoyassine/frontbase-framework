/**
 * Phase 2 console routes — automations, edge resources, storage, settings,
 * variables. All tenant-scoped via the default-deny auth context (RULE 2).
 * Every handler reads `tenant` from c.get('tenant'), never from the body.
 *
 * CF-18 Phase 2 (full functionality).
 */
import { Hono } from 'hono';
import { executeWorkflow } from '@frontbase/edge-core/workflow';
import type { StorageProvider, Provisioner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../mw/auth.js';
import type { Phase2Store } from '../db/phase2-store.js';
import { requireRole } from '../auth/roles.js';

export function phase2Routes(
    storeFor: (tenant: string) => Phase2Store,
    now: () => string,
    /** Optional object-storage provider (F4). When present, file upload/download
     *  round-trips real bytes; when absent, the route stores metadata only. */
    storage?: StorageProvider,
    /** Optional resource provisioner (F5). When it handles the kind, edge-resource
     *  create provisions a REAL provider resource; otherwise config-only. */
    provisioner?: Provisioner,
    /** Optional background dispatcher (F3b). When present, workflow execution is
     *  async (fire-and-track): the route returns immediately with status 'running'
     *  and the dispatcher runs the workflow in the background, updating the record
     *  on completion. On CF, wire this to ctx.waitUntil. */
    dispatcher?: (work: () => Promise<void>) => void,
): Hono<{ Variables: ConsoleAuthVars }> {
    const app = new Hono<{ Variables: ConsoleAuthVars }>();

    /** Run a workflow and record the result/error. Thin closure over `now` for the
     *  sync/async execute paths. (The recovery sweep uses the module-scope version.) */
    const runAndRecord = (store: Phase2Store, execId: string, workflowId: string, tenant: string, wf: { name: string; nodes: string; edges: string }, input: Record<string, unknown>) =>
        runAndRecordAt(store, execId, workflowId, tenant, wf, input, now);

    // ============ AUTOMATIONS (workflows + executions) ============

    app.get('/automations', async (c) => {
        const store = storeFor(c.get('tenant'));
        return c.json({ workflows: await store.listWorkflows() });
    });

    app.get('/automations/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        const wf = await store.getWorkflow(c.req.param('id'));
        if (!wf) return c.json({ error: 'not_found' }, 404);
        return c.json({ workflow: wf });
    });

    app.put('/automations/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => null) as { name?: string; nodes?: string; edges?: string; isActive?: boolean } | null;
        if (!body?.name || !body.nodes || !body.edges) return c.json({ error: 'validation_failed' }, 400);
        const { version } = await store.upsertWorkflow({
            id: c.req.param('id'),
            name: body.name,
            nodes: typeof body.nodes === 'string' ? body.nodes : JSON.stringify(body.nodes),
            edges: typeof body.edges === 'string' ? body.edges : JSON.stringify(body.edges),
            isActive: body.isActive,
        }, now());
        return c.json({ ok: true, version });
    });

    app.delete('/automations/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        await store.deleteWorkflow(c.req.param('id'));
        return c.json({ ok: true });
    });

    app.post('/automations/:id/toggle', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => ({})) as { isActive?: boolean };
        await store.toggleWorkflow(c.req.param('id'), body.isActive ?? false, now());
        return c.json({ ok: true });
    });

    app.get('/automations/:id/executions', async (c) => {
        const store = storeFor(c.get('tenant'));
        return c.json({ executions: await store.listExecutions(c.req.param('id')) });
    });

    app.post('/automations/:id/execute', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => ({})) as { trigger?: string; input?: Record<string, unknown> };
        const workflowId = c.req.param('id');
        const trigger = body.trigger ?? 'manual';

        // Load the workflow (must exist + be active for a real run).
        const wf = await store.getWorkflow(workflowId);
        if (!wf) return c.json({ error: 'not_found' }, 404);
        if (!wf.is_active) return c.json({ error: 'workflow_inactive' }, 409);

        // Record the run as started (F3b-durable: persist the input so a crashed
        // run can be replayed by the recovery sweep).
        const execId = `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const tenant = c.get('tenant');
        const input = body.input ?? {};
        await store.createExecution(execId, workflowId, trigger, now(), input);

        // F3b: when a background dispatcher is configured, fire-and-track — return
        // immediately with 'running' and let the dispatcher complete the work.
        // Otherwise run synchronously (F3) and return the final status.
        const wfShape = { name: String(wf.name), nodes: String(wf.nodes), edges: String(wf.edges) };

        if (dispatcher) {
            // Don't await — the dispatcher schedules the work (ctx.waitUntil on CF,
            // queueMicrotask in-process). Errors are recorded inside runAndRecord.
            dispatcher(async () => { await runAndRecord(store, execId, workflowId, tenant, wfShape, input); });
            return c.json({ executionId: execId, status: 'running' });
        }

        const outcome = await runAndRecord(store, execId, workflowId, tenant, wfShape, input);
        if (outcome.status === 'error') return c.json({ executionId: execId, status: 'error', error: 'execution_failed' }, 500);
        return c.json({ executionId: execId, status: outcome.status, result: outcome.result });
    });

    // F3b-durable: on-demand recovery sweep — master_admin only. Replays stuck
    // 'running' executions (older than the cutoff, presumed dead) from their
    // persisted input. Also kicked automatically on boot (createConsole).
    app.post('/automations/_recover', requireRole('master_admin'), async (c) => {
        const ageMinutes = Math.max(1, Number(c.req.query('ageMinutes') ?? 5));
        const cutoffIso = new Date(Date.now() - ageMinutes * 60_000).toISOString();
        const result = await recoverStuckExecutions(storeFor, now, cutoffIso);
        return c.json({ recovered: result.recovered, failed: result.failed, cutoff: cutoffIso });
    });

    // ============ EDGE RESOURCES ============

    app.get('/edge-resources', async (c) => {
        const store = storeFor(c.get('tenant'));
        const kind = c.req.query('kind');
        const resources = (await store.listEdgeResources(kind)).map(({ config, ...resource }) => ({
            ...resource,
            hasConfig: config !== null && config !== undefined && config !== '',
        }));
        return c.json({ resources });
    });

    app.put('/edge-resources/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => null) as { kind?: string; name?: string; provider?: string; config?: string; status?: string; provision?: boolean } | null;
        if (!body?.kind || !body.name) return c.json({ error: 'validation_failed' }, 400);

        // F5: provision a REAL provider resource when a provisioner is configured
        // and it handles this kind. The returned remoteId is merged into config.
        let provisioned = false;
        let remoteId: string | undefined;
        let extraConfig: Record<string, unknown> = {};
        if (body.provision !== false && provisioner?.handles(body.kind)) {
            try {
                const result = await provisioner.create(body.kind, body.name);
                provisioned = result.provisioned;
                remoteId = result.remoteId;
                extraConfig = result.info ?? {};
            } catch {
                // Provisioning failed — surface opaque, but still record the resource
                // as config-only so the user can retry. RULE 4.
                return c.json({ error: 'provisioning_failed' }, 502);
            }
        }

        const configObj = typeof body.config === 'string' ? JSON.parse(body.config || '{}') : (body.config ?? {});
        await store.upsertEdgeResource({
            id: c.req.param('id'),
            kind: body.kind,
            name: body.name,
            provider: body.provider ?? (provisioned ? String(extraConfig.provider ?? 'cloudflare') : undefined),
            config: JSON.stringify({ ...configObj, ...extraConfig, ...(remoteId ? { remoteId } : {}) }),
            status: provisioned ? 'provisioned' : (body.status ?? 'active'),
        }, now());
        return c.json({ ok: true, provisioned, remoteId });
    });

    app.delete('/edge-resources/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        // De-provision the real resource BEFORE dropping the row (mirror of BUG-1 fix —
        // previously provisioned D1/KV/Queues/Vectors leaked on delete). Best-effort.
        if (provisioner) {
            const resourceId = c.req.param('id');
            const res = await store.getEdgeResource(resourceId);
            if (res) {
                try {
                    const cfg = await store.getEdgeResourceConfig(resourceId);
                    if (cfg?.remoteId && provisioner.handles(String(res.kind))) {
                        await provisioner.remove(String(res.kind), String(cfg.remoteId));
                    }
                } catch { /* best-effort: row delete proceeds regardless */ }
            }
        }
        await store.deleteEdgeResource(c.req.param('id'));
        return c.json({ ok: true });
    });

    // ============ STORAGE ============

    app.get('/storage/buckets', async (c) => {
        const store = storeFor(c.get('tenant'));
        const buckets = (await store.listBuckets()).map(({ config, ...bucket }) => ({
            ...bucket,
            hasConfig: config !== null && config !== undefined && config !== '',
        }));
        return c.json({ buckets });
    });

    app.put('/storage/buckets/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => null) as { name?: string; provider?: string; config?: string } | null;
        if (!body?.name) return c.json({ error: 'validation_failed' }, 400);
        await store.upsertBucket({
            id: c.req.param('id'),
            name: body.name,
            provider: body.provider,
            config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config ?? {}),
        }, now());
        return c.json({ ok: true });
    });

    app.delete('/storage/buckets/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        await store.deleteBucket(c.req.param('id'));
        return c.json({ ok: true });
    });

    app.get('/storage/buckets/:id/files', async (c) => {
        const store = storeFor(c.get('tenant'));
        return c.json({ files: await store.listFiles(c.req.param('id')) });
    });

    app.post('/storage/buckets/:id/files', async (c) => {
        const store = storeFor(c.get('tenant'));
        const bucketId = c.req.param('id');

        // F4b: multipart/form-data upload (server-proxied). The browser POSTs a real
        // file + a `path` field; we stream the bytes to the provider. Don't set
        // content-type manually — FormData sets its own boundary.
        const ct = c.req.header('content-type') ?? '';
        if (storage && ct.includes('multipart/form-data')) {
            const form = await c.req.formData();
            const file = form.get('file');
            const path = String(form.get('path') ?? '');
            if (!(file instanceof File) || !path) return c.json({ error: 'validation_failed' }, 400);
            const bytes = new Uint8Array(await file.arrayBuffer());
            try { await storage.put({ bucket: bucketId, key: path, bytes, contentType: file.type }); }
            catch { return c.json({ error: 'storage_upload_failed' }, 500); }
            const fileId = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            await store.createFile({ id: fileId, bucketId, path, name: file.name, size: bytes.length, mimeType: file.type }, now());
            return c.json({ id: fileId, ok: true, stored: true });
        }

        // JSON path: base64-encoded bytes (content) for API simplicity, OR metadata-only.
        const body = await c.req.json().catch(() => null) as { path?: string; name?: string; size?: number; mimeType?: string; content?: string } | null;
        if (!body?.path || !body.name) return c.json({ error: 'validation_failed' }, 400);

        // If a storage provider is configured AND bytes were supplied, write them.
        if (storage && body.content) {
            const bytes = base64ToBytes(body.content);
            try {
                await storage.put({
                    bucket: bucketId,
                    key: body.path,
                    bytes,
                    contentType: body.mimeType,
                });
            } catch {
                return c.json({ error: 'storage_upload_failed' }, 500);
            }
            body.size = body.size ?? bytes.length;
        }

        const fileId = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        await store.createFile({
            id: fileId,
            bucketId,
            path: body.path,
            name: body.name,
            size: body.size,
            mimeType: body.mimeType,
        }, now());
        return c.json({ id: fileId, ok: true, stored: !!(storage && body.content) });
    });

    // Issue a presigned URL for direct-to-provider upload (F4b). Client PUTs bytes
    // to the returned URL, then POSTs .../files with { path, name } to record metadata.
    app.post('/storage/buckets/:id/upload-url', async (c) => {
        if (!storage) return c.json({ error: 'storage_not_configured' }, 501);
        const body = await c.req.json().catch(() => null) as { path?: string; contentType?: string } | null;
        if (!body?.path) return c.json({ error: 'validation_failed' }, 400);
        const url = await storage.signedUploadUrl(c.req.param('id'), body.path, body.contentType);
        return c.json({ url, method: 'PUT' });
    });

    // Download a file's bytes (only when a storage provider is configured — F4).
    app.get('/storage/buckets/:bid/files/:fid/raw', async (c) => {
        if (!storage) return c.json({ error: 'storage_not_configured' }, 501);
        const store = storeFor(c.get('tenant'));
        const files = await store.listFiles(c.req.param('bid'));
        const file = files.find((f) => String(f.id) === c.req.param('fid'));
        if (!file) return c.json({ error: 'not_found' }, 404);
        try {
            const { bytes, contentType } = await storage.get(c.req.param('bid'), String(file.path));
            return new Response(bytes as BodyInit, { headers: { 'content-type': contentType ?? 'application/octet-stream' } });
        } catch {
            return c.json({ error: 'not_found' }, 404);
        }
    });

    // A presigned URL for temporary direct access (F4).
    app.get('/storage/buckets/:bid/files/:fid/url', async (c) => {
        if (!storage) return c.json({ error: 'storage_not_configured' }, 501);
        const store = storeFor(c.get('tenant'));
        const files = await store.listFiles(c.req.param('bid'));
        const file = files.find((f) => String(f.id) === c.req.param('fid'));
        if (!file) return c.json({ error: 'not_found' }, 404);
        const url = await storage.signedUrl(c.req.param('bid'), String(file.path));
        return c.json({ url });
    });

    app.delete('/storage/files/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        // BUG-1 fix: resolve bucket_id + path BEFORE deleting the row, so the real
        // provider object is removed (not just the metadata). storage_files already
        // stores both columns — the old code passed an empty bucket + the file ID.
        if (storage) {
            const file = await store.getFile(c.req.param('id'));
            if (file) {
                try { await storage.delete(file.bucketId, file.path); }
                catch { /* best-effort: metadata row still goes; object may already be gone */ }
            }
        }
        await store.deleteFile(c.req.param('id'));
        return c.json({ ok: true });
    });

    // ============ SETTINGS ============

    app.get('/settings', async (c) => {
        const store = storeFor(c.get('tenant'));
        return c.json({ settings: await store.listSettings() });
    });

    app.put('/settings/:key', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => null) as { value?: string } | null;
        if (!body?.value) return c.json({ error: 'validation_failed' }, 400);
        await store.upsertSetting(c.req.param('key'), body.value, now());
        return c.json({ ok: true });
    });

    app.delete('/settings/:key', async (c) => {
        const store = storeFor(c.get('tenant'));
        await store.deleteSetting(c.req.param('key'));
        return c.json({ ok: true });
    });

    // ============ VARIABLES ============

    app.get('/variables', async (c) => {
        const store = storeFor(c.get('tenant'));
        const vars = await store.listVariables();
        // Don't leak secret values — return masked
        const masked = vars.map((v) => ({
            ...v,
            value: v.is_secret ? '••••••••' : v.value,
        }));
        return c.json({ variables: masked });
    });

    app.put('/variables/:key', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => null) as { value?: string; isSecret?: boolean } | null;
        if (!body?.value) return c.json({ error: 'validation_failed' }, 400);
        await store.upsertVariable(c.req.param('key'), body.value, body.isSecret ?? false, now());
        return c.json({ ok: true });
    });

    app.delete('/variables/:key', async (c) => {
        const store = storeFor(c.get('tenant'));
        await store.deleteVariable(c.req.param('key'));
        return c.json({ ok: true });
    });

    return app;
}

/** Decode a base64 string to bytes (URL-safe tolerant). */
function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ============ F3b-durable: recovery sweep (module scope) ============

/** Run a workflow and record the result/error at a given clock. Shared by the
 *  execute route (sync + async) and the recovery sweep. Completion is idempotent
 *  (guarded on status='running' in the store), so a late original + a recovery
 *  re-run can't double-complete. */
export async function runAndRecordAt(
    store: Phase2Store, execId: string, workflowId: string, tenant: string,
    wf: { name: string; nodes: string; edges: string }, input: Record<string, unknown>, now: () => string,
): Promise<{ status: string; result?: unknown }> {
    try {
        const result = await executeWorkflow(execId, { id: workflowId, name: wf.name, nodes: wf.nodes, edges: wf.edges, tenantSlug: tenant }, input, { tenantSlug: tenant });
        const status = result.status === 'completed' ? 'completed' : 'error';
        await store.completeExecution(execId, status, JSON.stringify(result.result ?? {}), result.error ?? null, now());
        return { status, result: result.result };
    } catch (e) {
        await store.completeExecution(execId, 'error', null, (e as Error)?.message ?? 'execution_failed', now());
        return { status: 'error' };
    }
}

/**
 * Recovery sweep (F3b-durable). For each 'running' execution older than `cutoffIso`
 * (presumed dead — e.g. an isolate evicted mid-run), replay it from its persisted
 * input. If the workflow no longer exists, mark the execution `error: workflow_deleted`
 * (don't leave it stuck forever). Returns the count of rows acted on.
 *
 * `storeFor` must yield the right tenant's store per row (the stuck list is
 * cross-tenant; replay is tenant-scoped). Safe against races with a late original:
 * completion is idempotent.
 */
export async function recoverStuckExecutions(
    storeFor: (tenant: string) => Phase2Store,
    now: () => string,
    cutoffIso: string,
): Promise<{ recovered: number; failed: number }> {
    // Any store instance can list stuck rows (it's a cross-tenant system read).
    const stuck = await storeFor('_default').listStuckExecutions(cutoffIso);
    let recovered = 0;
    let failed = 0;
    for (const row of stuck) {
        const store = storeFor(row.tenantSlug);
        const wf = await store.getWorkflow(row.workflowId);
        if (!wf) {
            // Workflow deleted while a run was in flight — fail it, don't loop forever.
            await store.completeExecution(row.id, 'error', null, 'workflow_deleted', now());
            failed++;
            continue;
        }
        await runAndRecordAt(store, row.id, row.workflowId, row.tenantSlug, { name: String(wf.name), nodes: String(wf.nodes), edges: String(wf.edges) }, row.input, now);
        recovered++;
    }
    return { recovered, failed };
}
