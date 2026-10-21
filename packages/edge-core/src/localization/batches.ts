/** Frontbase host/UI contracts. The standalone translation engine does not depend on these. */
import { z } from 'zod';
import { localeSchema, translationContextSchema, translationRecordKeySchema } from '@frontbase/translation';
const id = z.string().min(1).max(160), uuid = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Sanitized provider discovery; never contains credentials, prompts or raw provider payloads. */
export const translationModelCatalogSchema = z.object({ accountId: id, models: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/), name: z.string().min(1).max(200), free: z.boolean(),
}).strict()).max(5000) }).strict();
export const batchPageSelectionSchema = z.object({ pageId: id, blockId: id, field: z.enum(['content', 'text', 'value']) }).strict();
const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/).refine(v => !['__proto__','prototype','constructor'].includes(v));
export const batchMenuSelectionSchema = z.object({ kind: z.literal('menu'), menuId: id, field: z.enum(['brand','copyright','description','label']), itemId: id.refine(v => !['__proto__','prototype','constructor'].includes(v)).optional() }).strict()
    .refine(v => v.field === 'label' ? !!v.itemId : v.itemId === undefined);
const keyPart = z.object({ column: identifier, value: z.union([z.string().min(1).max(4000), z.number().int().safe(), z.boolean()]) }).strict();
const keyForm = (v: { keyColumn?: string; keyValue?: unknown; keyColumns?: unknown[]; field: string }) =>
    (v.keyColumn === undefined) === (v.keyValue === undefined)
    && (v.keyColumn === undefined) === (v.keyColumns !== undefined)
    && (!v.keyColumns || (new Set(v.keyColumns.map(part => (part as { column: string }).column)).size === v.keyColumns.length
        && v.keyColumns.every(part => (part as { column: string }).column !== v.field)));
export const batchRecordSelectionSchema = z.object({ kind: z.literal('record'), datasourceId: id, endpoint: z.enum(['supabase','postgrest']),
    table: identifier, keyColumn: identifier.optional(), keyValue: z.union([z.string().min(1).max(500), z.number().int().safe(), z.boolean()]).optional(),
    keyColumns: z.array(keyPart).min(1).max(16).optional(), field: identifier }).strict()
    .refine(v => v.keyColumn !== v.field).refine(keyForm, 'Use exactly one complete key form');
export const batchViewSelectionSchema = z.object({ kind: z.literal('view-record'), viewId: id, endpoint: z.enum(['supabase','postgrest']),
    keyColumn: identifier.optional(), keyValue: z.union([z.string().min(1).max(500), z.number().int().safe(), z.boolean()]).optional(),
    keyColumns: z.array(keyPart).min(1).max(16).optional(), field: identifier }).strict()
    .refine(v => v.keyColumn !== v.field).refine(keyForm, 'Use exactly one complete key form');
/** Legacy page shape/field ordering is retained so persisted sealed reviews remain readable. */
export const batchSelectionSchema = z.union([batchPageSelectionSchema,batchMenuSelectionSchema,batchRecordSelectionSchema,batchViewSelectionSchema]);
export const batchLimitsSchema = z.object({ maxRequests: z.number().int().min(1).max(4), maxConcurrent: z.literal(1), maxMessageBytes: z.number().int().min(512).max(65536) }).strict();
export const batchPlanInputSchema = z.object({ targetLocale: localeSchema, selections: z.array(batchSelectionSchema).min(1).max(4), limits: batchLimitsSchema }).strict();
export const batchPhaseSchema = z.enum(['planned', 'preparing', 'queued', 'done', 'cancelling', 'closed']);
export const batchPreviewItemSchema = z.object({ selection: batchSelectionSchema, text: z.string().max(4000), context: translationContextSchema,
    suggestion: z.object({ unitId: hash, revisionId: id, provenance: z.enum(['ai', 'manual', 'import']), text: z.string().max(100_000) }).strict().optional() }).strict();
export const batchReviewSchema = z.object({ id: uuid, reviewHash: hash, sourceLocale: localeSchema, targetLocale: localeSchema,
    providerAccountId: id, model: z.string().max(200), limits: batchLimitsSchema, maxOutputTokens: z.number().int().positive(),
    items: z.array(batchPreviewItemSchema).min(1).max(4), monetaryEstimate: z.null(), delivery: z.literal('administrator-continuation'), draftOnly: z.literal(true) }).strict();
export const batchCapabilitiesSchema = z.object({ version: z.literal(1), executionAvailable: z.boolean(), sourceKinds: z.array(z.enum(['page-default-plain-text','menu-plain-text','record-plain-text','view-record-plain-text'])),
    maxItems: z.literal(4), maxJobsPerContinuation: z.literal(1), delivery: z.literal('administrator-continuation'), draftOnly: z.literal(true) }).strict();
export const batchPagesSchema = z.object({ pages: z.array(z.object({ id, name: z.string().max(500) }).strict()).max(25), next: id.nullable() }).strict();
export const batchFieldsSchema = z.object({ pageId: id, items: z.array(batchPreviewItemSchema).max(100), truncated: z.boolean(), next: z.string().regex(/^\d{1,5}$/).nullable().default(null) }).strict();
export const batchMenusSchema = z.object({ menus: z.array(z.object({ id, name: z.string().max(100), slot: z.string().max(30) }).strict()).max(100) }).strict();
export const batchMenuFieldsSchema = z.object({ menuId: id, items: z.array(batchPreviewItemSchema).max(100), next: z.string().regex(/^\d{1,5}$/).nullable() }).strict();
export const batchDatasourcesSchema = z.object({ datasources: z.array(z.object({ id, name: z.string().max(500) }).strict()).max(25), next: id.nullable() }).strict();
export const batchViewsSchema = z.object({ views: z.array(z.object({ id, name: z.string().max(500), table: identifier }).strict()).max(25), next: id.nullable() }).strict();
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

/** Retry with NEW reviewed identities (the accepted recovery for failed/unsent items): the response
 *  is a fresh plan review over an eligible subset. Uncertain-dispatched items are never carried —
 *  they stay held in the original allowance until the administrator explicitly reconciles it. */
export const batchRetryExclusionSchema = z.object({ selection: batchSelectionSchema,
    reason: z.enum(['completed', 'uncertain-dispatch', 'leased', 'outdated-or-changed', 'manual-head']) }).strict();
export const batchRetryReviewSchema = batchReviewSchema.extend({ sourceBatchId: uuid, excluded: z.array(batchRetryExclusionSchema).max(3) }).strict()
    .refine(v => { const taken = new Set(v.items.map(item => JSON.stringify(item.selection)));
        return v.excluded.every(item => !taken.has(JSON.stringify(item.selection)))
            && new Set(v.excluded.map(item => JSON.stringify(item.selection))).size === v.excluded.length; }, 'Each selection appears exactly once');

/** Private saved-page authoring; no job or provider authority. A selection may name a Block Version
 *  alternative; absent versionId keeps Default identity and serializes exactly as before. The batch
 *  engine's own selection union stays Default-only: it extracts base layouts exclusively. */
export const translationPageSelectionSchema = batchPageSelectionSchema.extend({ versionId: id.optional() }).strict();
export const translationPageFieldSchema = z.object({ selection: translationPageSelectionSchema, source: z.string().max(4000),
    translation: z.string().max(4000).nullable(), state: z.enum(['missing','draft','outdated']),
    provenance: z.enum(['ai','manual','import']).nullable(), revisionId: id.nullable(), token: hash }).strict();
export const translationPagePreviewSchema = z.object({ pageId: id, pageHash: hash, locale: localeSchema, sourceLocale: localeSchema,
    targetLocales: z.array(localeSchema).max(16), layout: z.object({ content: z.array(z.unknown()).max(10000), root: z.record(z.unknown()) }).passthrough(), fields: z.array(translationPageFieldSchema).max(100),
    draftOnly: z.literal(true) }).strict();
export const translationPageSaveSchema = z.object({ selection: translationPageSelectionSchema, locale: localeSchema,
    token: hash, text: z.string().min(1).max(4000) }).strict();

/** Private per-record locale review for visual authoring (Data Inspector selected field): the
 *  administrator addresses records by key; the server re-reads every record through the owned
 *  connection, so keys never inject content. Eligibility stays with the batch extractors. */
export const translationRecordSelectionSchema = z.union([batchRecordSelectionSchema, batchViewSelectionSchema]);
export const translationRecordFieldSchema = translationPageFieldSchema.extend({ selection: translationRecordSelectionSchema });
export const translationRecordPreviewRequestSchema = z.object({ locale: localeSchema,
    selections: z.array(translationRecordSelectionSchema).min(1).max(25) }).strict();
export const translationRecordPreviewSchema = z.object({ locale: localeSchema, sourceLocale: localeSchema,
    targetLocales: z.array(localeSchema).max(16), fields: z.array(translationRecordFieldSchema).max(25),
    draftOnly: z.literal(true) }).strict();
export const translationRecordSaveSchema = z.object({ selection: translationRecordSelectionSchema, locale: localeSchema,
    token: hash, text: z.string().min(1).max(4000) }).strict();

/** Administrator revision history for one owned selection. The server always re-derives unitId
 *  through the eligibility extractors; rows are bounded and newest-first in storage order, and
 *  long texts are truncated for display only (restore re-reads the full revision server-side). */
export const translationUnitHistoryRequestSchema = z.object({ selection: batchSelectionSchema, locale: localeSchema,
    limit: z.number().int().min(1).max(100).default(20) }).strict();
export const translationRevisionSummarySchema = z.object({ revisionId: id, provenance: z.enum(['ai', 'manual', 'import']),
    text: z.string().max(12000), textTruncated: z.boolean(), sourceVersion: z.number().int().positive(), isHead: z.boolean() }).strict();
export const translationUnitHistorySchema = z.object({ version: z.literal(1), unitId: hash, locale: localeSchema, sourceLocale: localeSchema,
    source: z.object({ text: z.string().max(12000), textTruncated: z.boolean(), sourceVersion: z.number().int().positive(),
        sourceFingerprint: hash, contextFingerprint: hash }).strict().nullable(),
    head: translationRevisionSummarySchema.nullable(), manualProtected: z.boolean(),
    revisions: z.array(translationRevisionSummarySchema).max(100) }).strict();
export const translationRestoreRequestSchema = z.object({ selection: batchSelectionSchema, locale: localeSchema, revisionId: id }).strict();
export const translationRestoreResultSchema = z.object({ version: z.literal(1), unitId: hash, locale: localeSchema,
    restoredRevisionId: id, head: translationRevisionSummarySchema.nullable() }).strict();

/** Complete rendered Homepage review; the server owns source/layout/query selection.
 *  `path` generalizes the same engine to any published page ('/' = homepage). */
export const translationHomepageReviewSchema = z.object({locale:localeSchema,sourceLocale:localeSchema,token:hash,siteHash:hash,
 fields:z.array(z.object({id:hash,label:z.string().max(200),source:z.string().max(12000),translation:z.string().max(12000).nullable(),state:z.enum(['missing','draft','outdated']),token:hash}).strict()).min(1).max(502),complete:z.boolean(),active:z.object({hash,generation:z.number().int().positive()}).strict().nullable(),path:z.string().min(1).max(160).optional()}).strict();
export const translationHomepageSaveSchema=z.object({locale:localeSchema,token:hash,entries:z.array(z.object({id:hash,token:hash,text:z.string().min(1).max(12000)}).strict()).min(1).max(20),path:z.string().min(1).max(160).optional()}).strict().refine(v=>new Set(v.entries.map(e=>e.id)).size===v.entries.length);

/** Discovery coverage (read-only inventory contract). Translatable fields carry engine identity
 *  (unit refs/fingerprints); excluded fields never carry source text and always state a reason. */
export const translationCoverageFieldSchema = z.object({ ref: hash, fingerprint: hash.optional(),
    label: z.string().min(1).max(200), decision: z.enum(['translatable', 'excluded']), reason: z.string().min(1).max(80).optional(),
    propertyPath: z.array(id).min(1).max(20), versionId: id.optional(), text: z.string().max(12000),
    record: z.object({ connectionId: id, collection: id, key: translationRecordKeySchema }).strict().optional() }).strict()
    .refine(v => v.decision === 'translatable' ? !!v.fingerprint && !v.reason && v.text.trim().length > 0
        : !v.fingerprint && !!v.reason && v.text === '');
export const translationCoverageSurfaceSchema = z.object({ kind: z.enum(['static-page', 'template', 'menu']), ref: hash,
    title: z.string().max(500), role: id.optional(), path: z.string().max(400).optional(), menuId: id.optional(),
    fields: z.array(translationCoverageFieldSchema).max(500), fieldsTruncated: z.boolean().optional(),
    renderedColumns: z.record(z.array(z.string().max(80)).max(20)).optional() }).strict()
    .refine(v => (v.kind === 'menu') === (v.menuId !== undefined));
export const translationCoverageRecordSchema = z.object({ collection: z.enum(['institutions', 'programs', 'cities', 'articles', 'pages']),
    ref: hash, id: z.union([z.string().min(1).max(128), z.number().int().positive()]), title: z.string().max(500),
    fields: z.array(translationCoverageFieldSchema).max(12) }).strict();
export const translationCoverageReportSchema = z.object({ version: z.literal(1),
    site: z.object({ hash, generation: z.number().int().positive(), name: z.string().min(1).max(200), origin: z.string().max(500),
        locale: localeSchema, sourceLocale: localeSchema, targetLocales: z.array(localeSchema).max(16), storageDatasource: id }).strict(),
    totals: z.object({ index: z.object({ institutions: z.number().int().nonnegative(), programs: z.number().int().nonnegative(),
            cities: z.number().int().nonnegative(), articles: z.number().int().nonnegative(), pages: z.number().int().nonnegative() }).strict(),
        chunks: z.number().int().nonnegative(), staticPages: z.number().int().nonnegative(), templates: z.number().int().nonnegative(),
        menus: z.number().int().nonnegative(),
        fields: z.object({ translatable: z.number().int().nonnegative(), excluded: z.number().int().nonnegative() }).strict() }).strict(),
    lists: z.array(z.object({ surface: hash, componentId: id, versionId: id.optional(), collection: z.enum(['institutions', 'programs', 'cities', 'articles']),
        window: z.number().int().min(1).max(48), total: z.number().int().nonnegative() }).strict()).max(200),
    terminology: z.object({ approvedStore: z.union([z.literal('none'), z.literal('project-glossary-v1')]), providerGlossary: z.string().min(1).max(200) }).strict(),
    exclusions: z.array(z.object({ reason: z.string().min(1).max(80), count: z.number().int().nonnegative() }).strict()).max(40),
    surfaces: z.object({ items: z.array(translationCoverageSurfaceSchema).max(50), next: z.string().max(40).nullable() }).strict(),
    records: z.object({ items: z.array(translationCoverageRecordSchema).max(50), next: z.string().max(40).nullable() }).strict() }).strict();

/** Project terminology: one row per target locale; sources must be unique per locale (deterministic application). */
export const translationGlossaryTermSchema = z.object({
    locale: localeSchema, source: z.string().min(1).max(200), target: z.string().min(1).max(200) }).strict();
const glossaryTerms = z.array(translationGlossaryTermSchema).max(256).superRefine((terms, ctx) => {
    const seen = new Set<string>();
    for (const term of terms) { const key = term.locale + '\u0000' + term.source;
        if (seen.has(key)) ctx.addIssue({ code: 'custom', message: 'Duplicate glossary term' }); seen.add(key); }
});
/** Persisted per-project store. Project-private by default; the tenant catalog applies only when explicitly adopted. */
export const translationGlossaryStoreSchema = z.object({ version: z.literal(1),
    revision: z.number().int().nonnegative().safe(), terms: glossaryTerms,
    shared: z.object({ enabled: z.boolean(), revision: z.number().int().nonnegative().safe().nullable() }).strict() }).strict();
export const translationGlossarySaveSchema = z.object({
    expectedRevision: z.number().int().nonnegative().safe(), terms: glossaryTerms }).strict();
/** Tenant-wide catalog replacement; publication requires an elevated tenant role, adoption stays per project. */
export const translationGlossaryPublishSchema = translationGlossarySaveSchema;
/** null dismisses the shared catalog; a number adopts exactly the current catalog revision. */
export const translationGlossaryAdoptSchema = z.object({
    revision: z.number().int().nonnegative().safe().nullable() }).strict();
export const translationGlossaryStateSchema = z.object({ version: z.literal(1),
    revision: z.number().int().nonnegative().safe(), terms: glossaryTerms,
    shared: translationGlossaryStoreSchema.shape.shared,
    catalog: z.object({ revision: z.number().int().nonnegative().safe(), terms: glossaryTerms }).strict().nullable() }).strict();
