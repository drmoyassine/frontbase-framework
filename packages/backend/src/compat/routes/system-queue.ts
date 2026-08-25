/**
 * POST /api/system/queue/receive — the queue provider's redelivery target
 * (framework-only; NOT part of the vendored 334-op product surface).
 *
 * Registered in the UNAUTHENTICATED block: QStash has no browser session.
 * Authentication is the inbound verify (QStash signature JWT over the raw
 * body, keys of this tenant's resolved queue) or the shared callback secret
 * (x-frontbase-callback-secret, constant-time) — 401 otherwise.
 *
 * RULE 2 (tenant isolation): the job's executionId is looked up ONLY in the
 * body's tenant-scoped store — an id leaked from another tenant is skipped,
 * not run. Idempotent by design: a missing or terminal row answers
 * 200 {ok, skipped} so QStash stops redelivering; only a transient store
 * error answers 503 (QStash retries). Closes the standing ESCALATE on
 * qstashDispatcher callback auth (dispatchers.ts).
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { SystemServiceResolver } from '../system-services.js';
import { runAndRecordAt } from '../../routes/phase2.js';
import { RagConfigError } from '../rag/routes.js';

export interface SystemQueueRouteDeps {
    phase2For: (tenant: string) => Phase2Store;
    resolver: SystemServiceResolver;
    now: () => string;
    /** Run one RAG bucket index (the same runner the /api/rag/index route
     *  uses inline). Absent → rag-index jobs are idempotent no-ops. */
    runRagIndex?: (tenant: string, bucketId: string) => Promise<unknown>;
    log?: (msg: string) => void;
}

export function registerSystemQueueRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, deps: SystemQueueRouteDeps): void {
    app.post('/api/system/queue/receive', async (c) => {
        // The signature is computed over the RAW bytes — read text, not JSON,
        // then parse (a re-serialized parse would break the body-hash check).
        const raw = await c.req.text();
        let body: Record<string, unknown>;
        try {
            body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return c.json({ detail: 'Invalid body' }, 400);
        }
        const tenant = typeof body.tenant === 'string' ? body.tenant : '';
        if (!tenant) return c.json({ detail: 'tenant required' }, 400);

        const queue = await deps.resolver.queueFor(tenant);
        const verified = queue
            ? await queue.verifyInbound(
                c.req.header('upstash-signature') ?? null,
                c.req.header('x-frontbase-callback-secret') ?? null,
                raw,
            ).catch(() => false)
            : false;
        if (!verified) return c.json({ detail: 'Authentication required' }, 401);

        // Job union ({type:'execution'} | {type:'rag-index'}). Unknown types are
        // idempotent no-ops — never 5xx, or the provider would redeliver forever.
        if (body.type === 'rag-index') {
            const bucketId = typeof body.bucketId === 'string' ? body.bucketId : '';
            if (!bucketId || !deps.runRagIndex) return c.json({ ok: true, skipped: true });
            try {
                const result = await deps.runRagIndex(tenant, bucketId);
                return c.json({ ok: true, result });
            } catch (error) {
                if (error instanceof RagConfigError) {
                    // Permanent misconfiguration — redelivery cannot fix it.
                    (deps.log ?? (() => {}))(`[system-queue] rag-index skipped (${error.message})`);
                    return c.json({ ok: true, skipped: true });
                }
                // Transient (storage/embed/vector transport): 503 so the provider retries.
                (deps.log ?? (() => {}))(`[system-queue] rag-index failed: ${(error as Error)?.message ?? error}`);
                return c.json({ detail: 'temporarily_unavailable' }, 503);
            }
        }
        if (body.type === 'execution') {
            const executionId = typeof body.executionId === 'string' ? body.executionId : '';
            const workflowId = typeof body.workflowId === 'string' ? body.workflowId : '';
            if (!executionId || !workflowId) return c.json({ ok: true, skipped: true });

            const store = deps.phase2For(tenant);
            let row: Record<string, unknown> | null;
            try {
                row = await store.getExecution(executionId);
            } catch (error) {
                // Transient store failure: 503 so the provider retries.
                (deps.log ?? (() => {}))(`[system-queue] execution lookup failed: ${(error as Error)?.message ?? error}`);
                return c.json({ detail: 'temporarily_unavailable' }, 503);
            }
            // Missing (already handled / foreign tenant) or terminal → done.
            if (!row || row.status !== 'running') return c.json({ ok: true, skipped: true });

            const wf = await store.getWorkflow(workflowId).catch(() => null);
            if (!wf) {
                // Workflow deleted while queued — fail it, don't loop forever.
                await store.completeExecution(executionId, 'error', null, 'workflow_deleted', deps.now());
                return c.json({ ok: true });
            }
            let input: Record<string, unknown> = {};
            try {
                input = typeof row.input === 'string' ? JSON.parse(row.input) as Record<string, unknown> : {};
            } catch { input = {}; }
            await runAndRecordAt(
                store, executionId, workflowId, tenant,
                { name: String(wf.name), nodes: String(wf.nodes), edges: String(wf.edges) },
                input, deps.now,
            );
            return c.json({ ok: true });
        }
        return c.json({ ok: true, skipped: true });
    });
}
