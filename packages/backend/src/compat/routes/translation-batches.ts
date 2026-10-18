import { z } from 'zod';
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { planTranslationBatch, startTranslationBatch, continueTranslationBatch, cancelTranslationBatch, translationBatchStatus,
    translationBatchPlanSchema, type TranslationBatchHost } from '../translation-batches.js';

const actionSchema = z.object({ reviewHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const startSchema = actionSchema.extend({ approveContentTransmission: z.literal(true) }).strict();
const cancelSchema = actionSchema.extend({ unknownDisposition: z.enum(['hold', 'count-as-consumed']).default('hold') }).strict();
async function body(request: Request) {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    let bytes = 0, raw = ''; const decoder = new TextDecoder();
    while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 16384) { await reader.cancel(); throw Error(); }
        raw += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
}
/** Explicit host gate defaults disabled; no model probe or unattended scheduling from route registration. */
export function registerTranslationBatchRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, db: DbRunner, host: TranslationBatchHost,
    now: () => string, executionEnabled: boolean): void {
    const root = '/api/project/translation-batches/';
    app.use(`${root}*`, async (c, next) => {
        c.header('Cache-Control', 'no-store');
        const user = c.get('principal').user as { id?: string; role?: string } | null;
        if (!user?.id || !user.role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(user.role))
            return c.json({ detail: 'Translation batches are unavailable' }, 403);
        await next();
    });
    app.get(root, c => c.json({ version: 1, executionAvailable: executionEnabled, sourceKinds: ['page-default-plain-text'],
        maxItems: 4, maxJobsPerContinuation: 1, delivery: 'administrator-continuation', draftOnly: true }));
    app.post(`${root}plans/`, async c => {
        try { const input = translationBatchPlanSchema.parse(await body(c.req.raw));
            return c.json(await planTranslationBatch(host, db, c.get('tenant'), input, now()), 201);
        } catch { return c.json({ detail: 'Review could not be prepared. Check owned plain-text selections and current translation settings.' }, 422); }
    });
    app.get(`${root}:id/`, async c => {
        try { return c.json(await translationBatchStatus(host, db, c.get('tenant'), c.req.param('id'))); }
        catch { return c.json({ detail: 'Translation batch is unavailable' }, 404); }
    });
    app.post(`${root}:id/start/`, async c => {
        if (!executionEnabled) return c.json({ detail: 'Translation execution is not enabled on this host' }, 503);
        try { const input = startSchema.parse(await body(c.req.raw)), tenant = c.get('tenant');
            await startTranslationBatch(host, db, tenant, c.req.param('id'), input.reviewHash, String(c.get('principal').user!.id), now());
            return c.json(await translationBatchStatus(host, db, tenant, c.req.param('id')));
        } catch { return c.json({ detail: 'Batch could not start. Reload the review and check its allowance/settings.' }, 409); }
    });
    app.post(`${root}:id/continue/`, async c => {
        if (!executionEnabled) return c.json({ detail: 'Translation execution is not enabled on this host' }, 503);
        try { const input = actionSchema.parse(await body(c.req.raw)), tenant = c.get('tenant');
            await continueTranslationBatch(host, db, tenant, c.req.param('id'), input.reviewHash, now());
            return c.json(await translationBatchStatus(host, db, tenant, c.req.param('id')));
        } catch { return c.json({ detail: 'Batch could not continue. Check source/settings changes or reconcile its allowance.' }, 409); }
    });
    app.post(`${root}:id/cancel/`, async c => {
        try { const input = cancelSchema.parse(await body(c.req.raw)), tenant = c.get('tenant');
            await cancelTranslationBatch(host, db, tenant, c.req.param('id'), input.reviewHash, input.unknownDisposition, now());
            return c.json(await translationBatchStatus(host, db, tenant, c.req.param('id')));
        } catch { return c.json({ detail: 'Cancellation needs reconciliation. Restore the original owned destination and retry.' }, 409); }
    });
}
