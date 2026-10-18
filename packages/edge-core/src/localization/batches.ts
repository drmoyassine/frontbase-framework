/** Frontbase host/UI contracts. The standalone translation engine does not depend on these. */
import { z } from 'zod';
import { localeSchema, translationContextSchema } from '@frontbase/translation';
const id = z.string().min(1).max(160), uuid = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/);
export const batchSelectionSchema = z.object({ pageId: id, blockId: id, field: z.enum(['content', 'text', 'value']) }).strict();
export const batchLimitsSchema = z.object({ maxRequests: z.number().int().min(1).max(4), maxConcurrent: z.literal(1), maxMessageBytes: z.number().int().min(512).max(65536) }).strict();
export const batchPlanInputSchema = z.object({ targetLocale: localeSchema, selections: z.array(batchSelectionSchema).min(1).max(4), limits: batchLimitsSchema }).strict();
export const batchPhaseSchema = z.enum(['planned', 'preparing', 'queued', 'done', 'cancelling', 'closed']);
export const batchPreviewItemSchema = z.object({ selection: batchSelectionSchema, text: z.string().max(4000), context: translationContextSchema }).strict();
export const batchReviewSchema = z.object({ id: uuid, reviewHash: hash, sourceLocale: localeSchema, targetLocale: localeSchema,
    providerAccountId: id, model: z.string().max(200), limits: batchLimitsSchema, maxOutputTokens: z.number().int().positive(),
    items: z.array(batchPreviewItemSchema).min(1).max(4), monetaryEstimate: z.null(), delivery: z.literal('administrator-continuation'), draftOnly: z.literal(true) }).strict();
export const batchCapabilitiesSchema = z.object({ version: z.literal(1), executionAvailable: z.boolean(), sourceKinds: z.array(z.literal('page-default-plain-text')),
    maxItems: z.literal(4), maxJobsPerContinuation: z.literal(1), delivery: z.literal('administrator-continuation'), draftOnly: z.literal(true) }).strict();
export const batchPagesSchema = z.object({ pages: z.array(z.object({ id, name: z.string().max(500) }).strict()).max(25), next: id.nullable() }).strict();
export const batchFieldsSchema = z.object({ pageId: id, items: z.array(batchPreviewItemSchema).max(100), truncated: z.boolean(), next: z.string().regex(/^\d{1,5}$/).nullable().default(null) }).strict();
export const batchHistorySchema = z.object({ items: z.array(z.object({ id: uuid, reviewHash: hash, targetLocale: localeSchema,
    state: batchPhaseSchema, createdAt: z.string().datetime() }).strict()).max(20), next: uuid.nullable() }).strict();
const totals = z.object({ consumedRequests: z.number().int().nonnegative(), retainedUnknownRequests: z.number().int().nonnegative(), releasedRequests: z.number().int().nonnegative() }).strict();
export const batchLifecycleSchema = z.discriminatedUnion('phase', [
    z.object({ phase: z.literal('closing'), policyHash: hash, stage: z.enum(['cancel', 'reconcile', 'review']), cursor: z.number().int().nonnegative(), totals }).strict(),
    z.object({ phase: z.literal('closed'), policyHash: hash, totals, closedAt: z.string().datetime() }).strict(),
]);
export const batchStatusSchema = z.object({ id: uuid, reviewHash: hash, state: batchPhaseSchema, preparedItems: z.number().int().min(0).max(4), itemCount: z.number().int().min(1).max(4),
    approvedBy: id.nullable(), storageAvailable: z.boolean(), items: z.array(z.object({ selection: batchSelectionSchema,
        state: z.enum(['not-prepared', 'queued', 'leased', 'completed', 'failed', 'cancelled']), error: z.string().nullable(),
        accounting: z.enum(['reserved', 'dispatched', 'settled', 'uncertain', 'released']).nullable(), outdated: z.boolean(), result: z.string().nullable() }).strict()).max(4),
    lifecycle: batchLifecycleSchema.nullable(), delivery: z.literal('administrator-continuation'), draftOnly: z.literal(true) }).strict();
