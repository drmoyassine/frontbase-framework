import { registerTranslationHomepageRoutes } from './translation-homepage.js';
import { z } from 'zod';
import { translationPagePreview, saveTranslationPageField } from '../translation-page-preview.js';
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { planTranslationBatch, startTranslationBatch, continueTranslationBatch, cancelTranslationBatch, retryTranslationBatch, translationBatchStatus,
    translationBatchPlanSchema, translationBatchPages, translationBatchFields, translationBatchHistory, translationBatchReview, type TranslationBatchHost } from '../translation-batches.js';
import { batchReviewSchema, batchStatusSchema, batchRecordSelectionSchema, batchViewSelectionSchema, batchPreviewItemSchema, batchRetryReviewSchema } from '@frontbase/edge-core/localization/batches';
import { translationMenus, translationMenuFields, translationDatasources, translationViews, extractRecordInput, extractViewRecordInput } from '../translation-inputs.js';
import { discoverTranslationCoverage } from '../translation-discovery.js';
import { currentTranslationHostPin } from '../translation-allowance.js';

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
    registerTranslationHomepageRoutes(app,db,host,now);
    app.get(`${root}page-preview/:pageId/`, async c => {
        try { return c.json(await translationPagePreview(host, db, c.get('tenant'), c.req.param('pageId'), c.req.query('locale') ?? '')); }
        catch { return c.json({ detail: 'Saved-page translation preview is unavailable. Check language/storage settings and reload the saved page.' }, 422); }
    });
    app.post(`${root}page-preview/field/`, async c => {
        try { return c.json(await saveTranslationPageField(host, db, c.get('tenant'), await body(c.req.raw))); }
        catch { return c.json({ detail: 'Translation could not be saved. Reload translations; the source, settings or revision may have changed.' }, 409); }
    });
    app.get(root, c => c.json({ version: 1, executionAvailable: executionEnabled, sourceKinds: ['page-default-plain-text','menu-plain-text','record-plain-text','view-record-plain-text'],
        maxItems: 4, maxJobsPerContinuation: 1, delivery: 'administrator-continuation', draftOnly: true }));
    app.get(`${root}menus/`, async c => {
        try { return c.json(await translationMenus(db, c.get('tenant'))); }
        catch { return c.json({ detail: 'Menu selection is unavailable' }, 422); }
    });
    app.get(`${root}menus/:menuId/`, async c => {
        try { const tenant = c.get('tenant'); return c.json(await translationMenuFields(db, tenant, c.req.param('menuId'), await currentTranslationHostPin(host, db, tenant), c.req.query('after'))); }
        catch { return c.json({ detail: 'Menu text is unavailable' }, 422); }
    });
    app.get(`${root}datasources/`, async c => {
        try { return c.json(await translationDatasources(db, c.get('tenant'), c.req.query('after'))); }
        catch { return c.json({ detail: 'Datasource selection is unavailable' }, 422); }
    });
    app.get(`${root}datasources/:datasourceId/views/`, async c => {
        try { return c.json(await translationViews(db, host, c.get('tenant'), c.req.param('datasourceId'), c.req.query('after'))); }
        catch { return c.json({ detail: 'Saved views are unavailable' }, 422); }
    });
    app.post(`${root}view-field/`, async c => {
        try { const selection = batchViewSelectionSchema.parse(await body(c.req.raw)), tenant = c.get('tenant');
            const input = await extractViewRecordInput(host, db, tenant, selection, await currentTranslationHostPin(host, db, tenant));
            return c.json(batchPreviewItemSchema.parse({ selection, text: input.unit.text, context: input.context }));
        } catch { return c.json({ detail: 'Saved-view field is unavailable. Check visible key/text columns, current filters and the owned HTTP connection.' }, 422); }
    });
    app.post(`${root}record-field/`, async c => {
        try { const selection = batchRecordSelectionSchema.parse(await body(c.req.raw)), tenant = c.get('tenant');
            const input = await extractRecordInput(host, tenant, selection, await currentTranslationHostPin(host, db, tenant));
            return c.json(batchPreviewItemSchema.parse({ selection, text: input.unit.text, context: input.context }));
        } catch { return c.json({ detail: 'Selected text field is unavailable. Check the owned HTTP connection, table, column and unique record key.' }, 422); }
    });
    app.get(`${root}sources/`, async c => {
        try { return c.json(await translationBatchPages(db, c.get('tenant'), c.req.query('after'))); }
        catch { return c.json({ detail: 'Page selection is unavailable' }, 422); }
    });
    app.get(`${root}coverage/`, async c => {
        try { return c.json(await discoverTranslationCoverage(host, db, c.get('tenant'),
            { surfacesAfter: c.req.query('surfacesAfter') || undefined, recordsAfter: c.req.query('recordsAfter') || undefined })); }
        catch { return c.json({ detail: 'Coverage is unavailable. Check language/storage settings and the reviewed publication.' }, 422); }
    });
    app.get(`${root}sources/:pageId/`, async c => {
        try { return c.json(await translationBatchFields(host, db, c.get('tenant'), c.req.param('pageId'), c.req.query('after'))); }
        catch { return c.json({ detail: 'Text selection is unavailable. Check page ownership and saved translation settings.' }, 422); }
    });
    app.get(`${root}reviews/`, async c => {
        try { return c.json(await translationBatchHistory(db, c.get('tenant'), c.req.query('after'))); }
        catch { return c.json({ detail: 'Saved batches are unavailable' }, 422); }
    });
    app.get(`${root}:id/review/`, async c => {
        try { return c.json(await translationBatchReview(host, db, c.get('tenant'), c.req.param('id'))); }
        catch { return c.json({ detail: 'Review is outdated or unavailable. Cancel this batch and create a new review.' }, 409); }
    });
    app.post(`${root}plans/`, async c => {
        try { const input = translationBatchPlanSchema.parse(await body(c.req.raw));
            return c.json(batchReviewSchema.parse(await planTranslationBatch(host, db, c.get('tenant'), input, now())), 201);
        } catch { return c.json({ detail: 'Review could not be prepared. Check owned plain-text selections and current translation settings.' }, 422); }
    });
    app.get(`${root}:id/`, async c => {
        try { return c.json(batchStatusSchema.parse(await translationBatchStatus(host, db, c.get('tenant'), c.req.param('id')))); }
        catch { return c.json({ detail: 'Translation batch is unavailable' }, 404); }
    });
    app.post(`${root}:id/start/`, async c => {
        if (!executionEnabled) return c.json({ detail: 'Translation execution is not enabled on this host' }, 503);
        try { const input = startSchema.parse(await body(c.req.raw)), tenant = c.get('tenant');
            await startTranslationBatch(host, db, tenant, c.req.param('id'), input.reviewHash, String(c.get('principal').user!.id), now());
            return c.json(batchStatusSchema.parse(await translationBatchStatus(host, db, tenant, c.req.param('id'))));
        } catch { return c.json({ detail: 'Batch could not start. Reload the review and check its allowance/settings.' }, 409); }
    });
    app.post(`${root}:id/continue/`, async c => {
        if (!executionEnabled) return c.json({ detail: 'Translation execution is not enabled on this host' }, 503);
        try { const input = actionSchema.parse(await body(c.req.raw)), tenant = c.get('tenant');
            await continueTranslationBatch(host, db, tenant, c.req.param('id'), input.reviewHash, now());
            return c.json(batchStatusSchema.parse(await translationBatchStatus(host, db, tenant, c.req.param('id'))));
        } catch { return c.json({ detail: 'Batch could not continue. Check source/settings changes or reconcile its allowance.' }, 409); }
    });
    app.post(`${root}:id/retry/`, async c => {
        try { return c.json(batchRetryReviewSchema.parse(await retryTranslationBatch(host, db, c.get('tenant'), c.req.param('id'), now())), 201); }
        catch { return c.json({ detail: 'Retry plan is unavailable. Nothing eligible remains, the batch is only an unexecuted review, or storage/settings changed.' }, 422); }
    });
    app.post(`${root}:id/cancel/`, async c => {
        try { const input = cancelSchema.parse(await body(c.req.raw)), tenant = c.get('tenant');
            await cancelTranslationBatch(host, db, tenant, c.req.param('id'), input.reviewHash, input.unknownDisposition, now());
            return c.json(batchStatusSchema.parse(await translationBatchStatus(host, db, tenant, c.req.param('id'))));
        } catch { return c.json({ detail: 'Cancellation needs reconciliation. Restore the original owned destination and retry.' }, 409); }
    });
}
