/**
 * POST /api/system/email/inbound — the agent-channel email intake point
 * (framework-only; NOT part of the 334-op community surface).
 *
 * Registered in the UNAUTHENTICATED block: the mail provider / kernel has no
 * browser session. Authentication is the deployment's shared inbound secret
 * (x-internal-secret header, constant-time) — 401 when the secret is unset or
 * mismatched (fail closed). DEC-105 v0: the caller is the kernel's
 * /channels/email/inbound webhook; the payload is the camelCase InboundEmail
 * shape ({providerMessageId, from, to, subject, text, html, receivedAt, ...}).
 *
 * RULE 2 (tenant isolation): workflows are matched and run ONLY inside the
 * body's tenant-scoped store ('_default' when absent — the self-host tenant).
 * Matching parses each ACTIVE workflow's nodes JSON for email_trigger nodes
 * and applies the node's filters (toAddress / subjectIncludes / fromDenyList)
 * against this payload before starting a run. No trigger_type persistence —
 * the nodes JSON is the source of truth, exactly as saved by the editor.
 *
 * Idempotent by design: no matching workflow (or an already-seen message id)
 * answers 200 {ok, skipped:true} so the caller stops redelivering; only a
 * transient store error answers 503. The bounded in-isolate message-id dedupe
 * covers redelivery storms; the kernel's ledger stays the cross-isolate
 * source of truth.
 */
import type { Hono } from 'hono';
import { timingSafeEqual } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import { runAndRecordAt } from '../../routes/phase2.js';
import type { ExecuteOptions } from '@frontbase/edge-core/workflow';

export interface EmailInboundRouteDeps {
    executionOptions?: ExecuteOptions;
    phase2For: (tenant: string) => Phase2Store;
    now: () => string;
    /** Shared inbound secret (host-parsed env, e.g. FRONTBASE_EMAIL_INBOUND_SECRET).
     *  Unset → every request 401s (fail closed). */
    inboundSecret?: string;
    log?: (msg: string) => void;
}

/** The DEC-105 kernel InboundEmail fields this endpoint consumes. */
interface InboundEmailPayload {
    providerMessageId?: unknown;
    from?: unknown;
    to?: unknown;
    subject?: unknown;
    text?: unknown;
    html?: unknown;
    receivedAt?: unknown;
    [key: string]: unknown;
}

/** Bounded dedupe of provider message ids seen by THIS isolate. Insertion-
 *  ordered Map → evict the oldest entry when full. */
const seenMessageIds = new Map<string, number>();
const SEEN_MAX = 500;

function markSeen(id: string): boolean {
    if (seenMessageIds.size >= SEEN_MAX) {
        const oldest = seenMessageIds.keys().next().value;
        if (oldest !== undefined) seenMessageIds.delete(oldest);
    }
    if (seenMessageIds.has(id)) return false;
    seenMessageIds.set(id, Date.now());
    return true;
}

/** Constant-time compare of the presented secret against the configured one
 *  (the shared edge-infra helper; encodes both sides to bytes first). */
function secretMatches(presented: string, configured: string): boolean {
    return timingSafeEqual(new TextEncoder().encode(presented), new TextEncoder().encode(configured));
}

interface EmailTriggerFilters {
    toAddress?: string;
    subjectIncludes?: string;
    fromDenyList?: string;
}

/** Apply one email_trigger node's saved inputs to the payload. Empty filters
 *  match everything — a bare Email node triggers on any inbound email — but a
 *  payload without a sender never matches (the route guards it too). */
export function emailTriggerMatches(email: InboundEmailPayload, f: EmailTriggerFilters): boolean {
    if (typeof email.from !== 'string' || !email.from) return false;
    const to = Array.isArray(email.to) ? email.to.map(String) : typeof email.to === 'string' ? [email.to] : [];
    const from = typeof email.from === 'string' ? email.from.toLowerCase() : '';
    const subject = typeof email.subject === 'string' ? email.subject.toLowerCase() : '';

    if (f.fromDenyList?.trim()) {
        const deny = f.fromDenyList.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        if (deny.some((d) => from === d)) return false;
    }
    if (f.toAddress?.trim()) {
        const want = f.toAddress.trim().toLowerCase();
        if (!to.some((t) => t.toLowerCase() === want)) return false;
    }
    if (f.subjectIncludes?.trim()) {
        if (!subject.includes(f.subjectIncludes.trim().toLowerCase())) return false;
    }
    return true;
}

export function registerEmailInboundRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, deps: EmailInboundRouteDeps): void {
    app.post('/api/system/email/inbound', async (c) => {
        // The secret is compared over the RAW bytes — read text, not JSON,
        // then parse (same ordering as the queue receiver).
        const raw = await c.req.text();
        let body: Record<string, unknown>;
        try {
            body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return c.json({ detail: 'Invalid body' }, 400);
        }

        if (!deps.inboundSecret || !secretMatches(c.req.header('x-internal-secret') ?? '', deps.inboundSecret)) {
            return c.json({ detail: 'Authentication required' }, 401);
        }

        const tenant = typeof body.tenant === 'string' && body.tenant ? body.tenant : '_default';
        const email = (body.email ?? {}) as InboundEmailPayload;
        const messageId = typeof email.providerMessageId === 'string' ? email.providerMessageId : '';
        if (!messageId || typeof email.from !== 'string') {
            // Malformed payload — never 5xx, or the caller would retry forever.
            return c.json({ ok: true, skipped: true });
        }
        if (!markSeen(messageId)) return c.json({ ok: true, skipped: true });

        let workflows: Record<string, unknown>[];
        try {
            workflows = await deps.phase2For(tenant).listWorkflows();
        } catch (error) {
            // Transient store failure: 503 so the caller retries. Drop the
            // dedupe mark so the retry isn't skipped as a duplicate.
            seenMessageIds.delete(messageId);
            (deps.log ?? (() => {}))(`[email-inbound] workflow lookup failed: ${(error as Error)?.message ?? error}`);
            return c.json({ detail: 'temporarily_unavailable' }, 503);
        }

        let started = 0;
        for (const wf of workflows) {
            // is_active arrives as a SQLite int (0/1) or a boolean, depending on
            // the driver — a truthiness check covers both spellings.
            if (!wf.is_active) continue;
            let nodes: Array<Record<string, unknown>>;
            try {
                nodes = JSON.parse(String(wf.nodes ?? '[]')) as Array<Record<string, unknown>>;
            } catch { continue; }

            for (const node of nodes) {
                if (node.type !== 'email_trigger') continue;
                // The editor saves nodes flat ({id, name, type, inputs, outputs});
                // accept the nested data.inputs spelling too (validation.ts does).
                const rawInputs = Array.isArray(node.inputs)
                    ? node.inputs
                    : ((node.data as Record<string, unknown> | undefined)?.inputs);
                const nodeInputs = Array.isArray(rawInputs) ? rawInputs as Array<{ name?: unknown; value?: unknown }> : [];
                const filter = (name: string): string => {
                    const inp = nodeInputs.find((i) => i?.name === name);
                    return typeof inp?.value === 'string' ? inp.value : '';
                };
                const matches = emailTriggerMatches(email, {
                    toAddress: filter('toAddress'),
                    subjectIncludes: filter('subjectIncludes'),
                    fromDenyList: filter('fromDenyList'),
                });
                if (!matches) continue;

                // Run start mirrors the queue receiver: persisted 'running' row
                // first, then the synchronous run + terminal record.
                const execId = `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                const store = deps.phase2For(tenant);
                await store.createExecution(execId, String(wf.id), 'email', deps.now(), { email });
                await runAndRecordAt(
                    store, execId, String(wf.id), tenant,
                    { name: String(wf.name), nodes: String(wf.nodes), edges: String(wf.edges) },
                    { email }, deps.now, deps.executionOptions,
                );
                started++;
            }
        }
        return c.json({ ok: true, started });
    });
}
