/** Bounded native page review/orchestration. Jobs and accounting remain authoritative in the existing engine. */
import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { validateBlockVersions, applyBlockVersion, type VersionedBlock } from '@frontbase/edge-core/block-versions';
import { TranslationLifecycle, localeSchema, translationJobIntentSchema, translationUnitId, messageSourceFingerprint,
    translationContextFingerprint, type MessageUnit, type TranslationContext, type StoredRevision } from '@frontbase/edge-core/localization';
import { currentTranslationHostPin, translationHostPinSchema, prepareTranslationAllowance, configuredTranslationAllowanceRunner,
    closeTranslationAllowance, translationAllowanceLifecycle, translationAllowanceReference } from './translation-allowance.js';
import { resolveTranslationAccountingStorage, type TranslationStorageHost } from './translation-storage.js';
import { translationMessages, type GenerationHost } from './translation-generation.js';
import type { PagesStore, CompatPageRow } from './pages-store.js';
import { translationInputHash, translationPlainText, extractMenuInput, extractRecordInput, extractViewRecordInput, TranslationInputChanged, type TranslationViewHost } from './translation-inputs.js';
import { readTranslationGlossaryTerms, applyTranslationGlossary } from './translation-glossary.js';
import { batchSelectionSchema as selectionSchema, batchPageSelectionSchema, batchLimitsSchema as limitsSchema, batchPlanInputSchema,
    batchReviewSchema, batchPagesSchema, batchFieldsSchema, batchHistorySchema, batchRetryReviewSchema, translationPageSelectionSchema,
    translationUnitHistorySchema, translationRestoreResultSchema } from '@frontbase/edge-core/localization/batches';

const id = z.string().min(1).max(160), hash = z.string().regex(/^[a-f0-9]{64}$/), uuid = z.string().uuid();
export const translationBatchPlanSchema = batchPlanInputSchema;
const itemSchema = z.object({ selection: selectionSchema, pageHash: hash, previousSourceVersion: z.number().int().positive().safe().nullable(), intent: translationJobIntentSchema }).strict();
const reviewSchema = z.object({ version: z.literal(1), id: uuid, pin: translationHostPinSchema, targetLocale: localeSchema,
    limits: limitsSchema, items: z.array(itemSchema).min(1).max(4), createdAt: z.string().datetime() }).strict();
const recordSchema = z.object({ review: reviewSchema, reviewHash: hash, phase: z.enum(['planned', 'preparing', 'queued', 'done', 'cancelling', 'closed']),
    cursor: z.number().int().min(0).max(4), approvedBy: id.nullable(), policyHash: hash.nullable() }).strict();
type Batch = z.infer<typeof recordSchema>;
export type TranslationBatchHost = TranslationViewHost & GenerationHost & { pagesFor(tenant: string): Pick<PagesStore, 'get'> };
const key = (value: string) => 'translation_batch:v1:' + uuid.parse(value);
const digest = translationInputHash;
export const TRANSLATION_PAGE_FIELDS: Record<string, readonly string[]> = { Text: ['content', 'text', 'value'], Heading: ['content', 'text'], Paragraph: ['content', 'text'] };
const boundTypes = new Set(['Repeater', 'DataTable', 'DataGrid', 'Grid']);
/** Generation-path terminology: batch contexts carry the applied glossary while manual single-field
 *  flows extract without it, so operator saves are never gated on terminology state. A glossary
 *  change therefore invalidates outstanding batch intents through the contextFingerprint chain. */
const withGlossary = (terms: Parameters<typeof applyTranslationGlossary>[0], locale: string, source: { unit: { text: string }; context: TranslationContext }): TranslationContext => {
    const glossary = applyTranslationGlossary(terms, locale, source.unit.text);
    return glossary ? { ...source.context, glossary } : source.context;
};
/** Bounded metadata only; canonical extractor below remains the only eligibility authority. */
export async function translationBatchPages(db: DbRunner, tenant: string, after = '') {
    if (after) id.parse(after);
    const rows = await db.query('SELECT id, name FROM compat_pages WHERE tenant_slug = ? AND deleted_at IS NULL AND id > ? ORDER BY id LIMIT 26', [tenant, after]);
    return batchPagesSchema.parse({ pages: rows.slice(0, 25).map(row => ({ id: row.id, name: String(row.name).slice(0, 500) })), next: rows.length > 25 ? rows[24]!.id : null });
}
export async function translationBatchFields(host: TranslationBatchHost, db: DbRunner, tenant: string, pageId: string, after = '0') {
    id.parse(pageId);
    z.string().regex(/^\d{1,5}$/).parse(after); const offset = Number(after);
    const pin = await currentTranslationHostPin(host, db, tenant), page = await host.pagesFor(tenant).get(pageId);
    if (!page || page.deleted_at || page.layout_data.length > 1_000_000) throw Error();
    const nodes = JSON.parse(page.layout_data).content as VersionedBlock[]; validateBlockVersions(nodes);
    const candidates: z.infer<typeof batchPageSelectionSchema>[] = [];
    const visit = (list: VersionedBlock[]) => { for (const node of list) {
        const field = TRANSLATION_PAGE_FIELDS[node.type]?.find(field => !!node.props?.[field]);
        if (field) candidates.push(batchPageSelectionSchema.parse({ pageId, blockId: node.id, field }));
        if (node.children) visit(node.children);
    } }; visit(nodes);
    const items = [], loaded = { page, nodes, pageHash: await digest({ layout: page.layout_data, name: page.name }) };
    for (const selection of candidates.slice(offset, offset + 100)) {
        try { const source = await extract(host, db, tenant, selection, pin, loaded); items.push({ selection, text: source.unit.text, context: source.context }); }
        catch { continue; } // Unsupported dynamic/bound text is never offered for selection.
        if (items.length === 100) break;
    }
    const truncated = candidates.length > offset + 100;
    return batchFieldsSchema.parse({ pageId, items, truncated, next: truncated ? String(offset + 100) : null });
}
export async function translationBatchHistory(db: DbRunner, tenant: string, after = '') {
    if (after) uuid.parse(after);
    const rows = await db.query('SELECT key FROM settings WHERE tenant_slug = ? AND key > ? AND key < ? ORDER BY key LIMIT 21', [tenant, 'translation_batch:v1:' + after, 'translation_batch:v1:~']);
    const items = [];
    for (const row of rows.slice(0, 20)) {
        const b = (await read(db, tenant, String(row.key).slice('translation_batch:v1:'.length))).value;
        items.push({ id: b.review.id, reviewHash: b.reviewHash, targetLocale: b.review.targetLocale, state: b.phase, createdAt: b.review.createdAt });
    }
    return batchHistorySchema.parse({ items, next: rows.length > 20 ? items[19]!.id : null });
}
export async function translationBatchReview(host: TranslationBatchHost, db: DbRunner, tenant: string, batchId: string) {
    const b = (await read(db, tenant, batchId)).value;
    if (!await stillCurrent(host, db, tenant, b)) throw Error();
    const glossary = await readTranslationGlossaryTerms(db, tenant, b.review.pin.storage.scope.projectId);
    const session = await sessionFor(host, tenant, b.review.pin);
    const items = [];
    for (const item of b.review.items) { const source = await extract(host, db, tenant, item.selection, b.review.pin);
        const memory = await session.persistence.findApprovedHead(b.review.pin.storage.scope, b.review.targetLocale, await messageSourceFingerprint(source.unit), item.intent.unitId);
        items.push({ selection: item.selection, text: source.unit.text, context: withGlossary(glossary, b.review.targetLocale, source), ...(memory ? { suggestion: { unitId: memory.unitId, revisionId: memory.revision.revisionId, provenance: memory.revision.provenance, text: memory.revision.text } } : {}) }); }
    return batchReviewSchema.parse({ id: b.review.id, reviewHash: b.reviewHash, sourceLocale: b.review.pin.generation.sourceLocale, targetLocale: b.review.targetLocale,
        providerAccountId: b.review.pin.generation.accountId, model: b.review.pin.generation.model, limits: b.review.limits, maxOutputTokens: b.review.pin.generation.maxOutputTokens,
        items, monetaryEstimate: null, delivery: 'administrator-continuation', draftOnly: true });
}
async function extract(host: TranslationBatchHost, db: DbRunner, tenant: string, selection: z.infer<typeof selectionSchema>, pin: z.infer<typeof translationHostPinSchema>,
    loaded?: { page: CompatPageRow; nodes: VersionedBlock[]; pageHash: string }) {
    if ('kind' in selection) return selection.kind === 'menu' ? extractMenuInput(db, tenant, selection, pin)
        : selection.kind === 'view-record' ? extractViewRecordInput(host, db, tenant, selection, pin) : extractRecordInput(host, tenant, selection, pin);
    return extractTranslationPageInput(host, tenant, selection, pin, loaded);
}
/** Same eligibility and identity for generation and private visual authoring. */
export async function extractTranslationPageInput(host: Pick<TranslationBatchHost, 'pagesFor'>, tenant: string,
    selection: z.infer<typeof batchPageSelectionSchema>,
    pin: { storage: { scope: MessageUnit['scope'] }; generation: { sourceLocale: string } },
    loaded?: { page: CompatPageRow; nodes: VersionedBlock[]; pageHash: string }) {
    const page = loaded?.page ?? await host.pagesFor(tenant).get(selection.pageId);
    if (!page || page.deleted_at || page.layout_data.length > 1_000_000) throw Error();
    const nodes = loaded?.nodes ?? JSON.parse(page.layout_data).content as VersionedBlock[];
    validateBlockVersions(nodes);
    let found: VersionedBlock | undefined, blocked = false;
    const visit = (list: VersionedBlock[], inherited: boolean) => {
        for (const node of list) {
            const bound = inherited || !!node.binding || !!node.props?.binding || !!node.props?.dataBinding || boundTypes.has(node.type);
            if (node.id === selection.blockId) { found = node; blocked = bound; }
            if (node.children) visit(node.children, bound);
        }
    };
    visit(nodes, false);
    if (!found || blocked) throw Error();
    const node = found as VersionedBlock, props = node.props ?? {}, fields = TRANSLATION_PAGE_FIELDS[node.type];
    if (!fields || fields.find(field => !!props[field]) !== selection.field || props.binding || props.dataBinding) throw Error();
    const text = translationPlainText(props[selection.field]);
    const unit: MessageUnit = { version: 1, scope: pin.storage.scope, resource: { kind: 'component', documentId: page.id, blockId: node.id,
        versionId: 'default', propertyPath: ['props', selection.field] }, sourceLocale: pin.generation.sourceLocale,
        format: 'plain', text, segmenterVersion: 1, placeholders: [] };
    const context: TranslationContext = { version: 1, role: node.type, resourceLabel: ('Page ' + page.name + ' / ' + selection.field).slice(0, 200) };
    return { unit, context, pageHash: loaded?.pageHash ?? await digest({ layout: page.layout_data, name: page.name }) };
}
/** Enumerate private-authoring page selections: Default fields plus true Block Version overrides.
 *  An alternative field textually equal to its Default counterpart shares the Default unit and is
 *  never listed separately; bound text and bound alternatives stay excluded. */
export function translationPageCandidates(pageId: string, nodes: VersionedBlock[]): z.infer<typeof translationPageSelectionSchema>[] {
    validateBlockVersions(nodes);
    const out: z.infer<typeof translationPageSelectionSchema>[] = [];
    const boundOf = (node: VersionedBlock, inherited: boolean) => inherited || !!node.binding || !!node.props?.binding || !!node.props?.dataBinding || boundTypes.has(node.type);
    const firstField = (node: VersionedBlock) => TRANSLATION_PAGE_FIELDS[node.type]?.find(name => !!node.props?.[name]);
    const visit = (list: VersionedBlock[], inherited: boolean, owner?: string) => { for (const node of list) {
        const bound = boundOf(node, inherited);
        if (!bound) {
            const name = firstField(node);
            // Override children are version-owned: their selections carry the owning version.
            if (name) out.push(translationPageSelectionSchema.parse(owner ? { pageId, blockId: node.id, field: name, versionId: owner }
                : { pageId, blockId: node.id, field: name }));
            for (const version of node.versions ?? []) {
                const effective = applyBlockVersion(node, version.id);
                const alt = boundOf(effective, inherited) ? undefined : firstField(effective);
                if (alt && node.props?.[alt] !== effective.props?.[alt])
                    out.push(translationPageSelectionSchema.parse({ pageId, blockId: node.id, field: alt, versionId: version.id }));
            }
        }
        if (out.length > 100) throw Error('translation_preview_limit');
        if (node.children) visit(node.children, bound, owner);
        for (const version of node.versions ?? []) if (version.overrides.children) visit(applyBlockVersion(node, version.id).children!, bound, version.id);
    } };
    visit(nodes, false);
    return out;
}
const versionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/).refine(v => v !== 'default');
/** Version-aware extraction for private visual authoring: resolves the effective shape of a Block
 *  Version alternative — a node-level override or an override-owned child. Eligibility is identical
 *  to the Default extractor; the unit resource carries the version so identity stays distinct, and a
 *  field textually equal to its Default counterpart is refused there (it shares the Default unit). */
export async function extractTranslationPageVersionInput(host: Pick<TranslationBatchHost, 'pagesFor'>, tenant: string,
    selection: z.infer<typeof translationPageSelectionSchema>,
    pin: { storage: { scope: MessageUnit['scope'] }; generation: { sourceLocale: string } },
    loaded?: { page: CompatPageRow; nodes: VersionedBlock[]; pageHash: string }) {
    if (!selection.versionId) throw Error();
    versionIdSchema.parse(selection.versionId);
    const page = loaded?.page ?? await host.pagesFor(tenant).get(selection.pageId);
    if (!page || page.deleted_at || page.layout_data.length > 1_000_000) throw Error();
    const nodes = loaded?.nodes ?? JSON.parse(page.layout_data).content as VersionedBlock[];
    validateBlockVersions(nodes);
    let found: VersionedBlock | undefined, blocked = false, ownerVersion: string | undefined;
    const visit = (list: VersionedBlock[], inherited: boolean, insideOverride?: string) => { for (const node of list) {
        if (found) return;
        const bound = inherited || !!node.binding || !!node.props?.binding || !!node.props?.dataBinding || boundTypes.has(node.type);
        if (node.id === selection.blockId) { found = node; blocked = bound; ownerVersion = insideOverride; }
        if (node.children) visit(node.children, bound, insideOverride);
        for (const version of node.versions ?? []) {
            if (found || !version.overrides.children) continue;
            visit(applyBlockVersion(node, version.id).children!, bound, version.id);
        }
    } };
    visit(nodes, false);
    if (!found || blocked) throw Error();
    let node = found as VersionedBlock;
    if (ownerVersion === undefined) {
        if (!node.versions?.some(item => item.id === selection.versionId)) throw Error();
        const baseText = node.props?.[selection.field];
        node = applyBlockVersion(node, selection.versionId!);
        if ((node.props ?? {})[selection.field] === baseText) throw Error();
    } else if (ownerVersion !== selection.versionId) throw Error();
    const props = node.props ?? {}, fields = TRANSLATION_PAGE_FIELDS[node.type];
    if (!fields || fields.find(field => !!props[field]) !== selection.field || props.binding || props.dataBinding) throw Error();
    const text = translationPlainText(props[selection.field]);
    const unit: MessageUnit = { version: 1, scope: pin.storage.scope, resource: { kind: 'component', documentId: page.id,
        blockId: found.id, versionId: selection.versionId, propertyPath: ['props', selection.field] }, sourceLocale: pin.generation.sourceLocale,
        format: 'plain', text, segmenterVersion: 1, placeholders: [] };
    const context: TranslationContext = { version: 1, role: node.type, resourceLabel: ('Page ' + page.name + ' / ' + selection.field).slice(0, 200) };
    return { unit, context, pageHash: loaded?.pageHash ?? await digest({ layout: page.layout_data, name: page.name }) };
}
async function sessionFor(host: TranslationBatchHost, tenant: string, pin: Batch['review']['pin']) {
    const d = pin.storage.destination;
    const session = await resolveTranslationAccountingStorage(host, tenant, { version: 1, datasourceId: d.datasourceId, endpoint: d.endpoint, namespace: 'translations' }, pin.storage.scope.projectId);
    if (JSON.stringify(session.destination) !== JSON.stringify(d) || JSON.stringify(session.scope) !== JSON.stringify(pin.storage.scope)) throw Error();
    return session;
}
async function read(db: DbRunner, tenant: string, batchId: string) {
    const rows = await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [tenant, key(batchId)]);
    if (!rows.length) throw Error();
    const raw = String(rows[0]!.value), value = recordSchema.parse(JSON.parse(raw));
    if (value.review.id !== batchId || value.review.pin.storage.scope.tenantId !== tenant || await digest(value.review) !== value.reviewHash
        || value.cursor > value.review.items.length || (value.phase !== 'planned' && value.phase !== 'closed' && value.approvedBy === null)) throw Error();
    return { raw, value };
}
async function save(db: DbRunner, tenant: string, previous: Awaited<ReturnType<typeof read>>, next: Batch, now: string) {
    recordSchema.parse(next);
    await db.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',
        [JSON.stringify(next), now, tenant, key(next.review.id), previous.raw]);
    return read(db, tenant, next.review.id);
}
async function stillCurrent(host: TranslationBatchHost, db: DbRunner, tenant: string, batch: Batch) {
    if (JSON.stringify(await currentTranslationHostPin(host, db, tenant)) !== JSON.stringify(batch.review.pin)) return false;
    try {
        for (const item of batch.review.items) if ((await extract(host, db, tenant, item.selection, batch.review.pin)).pageHash !== item.pageHash) return false;
    } catch (error) { if (error instanceof TranslationInputChanged) return false; throw error; }
    return true;
}
/** Review is read-only against translation storage and never calls AI or registers source history. */
export async function planTranslationBatch(host: TranslationBatchHost, db: DbRunner, tenant: string, input: unknown, now: string) {
    const request = translationBatchPlanSchema.parse(input), pin = await currentTranslationHostPin(host, db, tenant);
    if (!pin.generation.targetLocales.includes(request.targetLocale)) throw Error();
    const unique = new Set(request.selections.map(s => JSON.stringify(s)));
    if (unique.size !== request.selections.length) throw Error();
    const batchId = crypto.randomUUID(), session = await sessionFor(host, tenant, pin), items: Batch['review']['items'] = [], preview = [];
    const glossary = await readTranslationGlossaryTerms(db, tenant, pin.storage.scope.projectId);
    for (const selection of request.selections) {
        const source = await extract(host, db, tenant, selection, pin), unitId = await translationUnitId(pin.storage.scope, source.unit.resource);
        const context = withGlossary(glossary, request.targetLocale, source);
        if (items.some(item => item.intent.unitId === unitId)) throw Error();
        const fingerprint = await messageSourceFingerprint(source.unit), contextFingerprint = await translationContextFingerprint(context);
        if (new TextEncoder().encode(JSON.stringify(translationMessages({ unit: source.unit, context }, request.targetLocale))).byteLength > request.limits.maxMessageBytes) throw Error();
        const snapshot = await session.persistence.read(pin.storage.scope, unitId, request.targetLocale);
        if (snapshot.head?.provenance === 'manual') throw Error();
        const same = snapshot.source?.fingerprint === fingerprint && snapshot.source.contextFingerprint === contextFingerprint;
        items.push({ selection, pageHash: source.pageHash, previousSourceVersion: snapshot.source?.sourceVersion ?? null,
            intent: { version: 1, jobId: 'b-' + batchId + '-' + items.length, revisionId: 'r-' + batchId + '-' + items.length, unitId,
                sourceVersion: same ? snapshot.source!.sourceVersion : (snapshot.source?.sourceVersion ?? 0) + 1,
                sourceFingerprint: fingerprint, contextFingerprint, expectedHead: snapshot.head?.revisionId ?? null,
                locale: request.targetLocale, providerId: pin.generation.accountId, promptVersion: pin.generation.promptVersion, maxAttempts: 1 } });
        const memory = await session.persistence.findApprovedHead(pin.storage.scope, request.targetLocale, fingerprint, unitId);
        preview.push({ selection, text: source.unit.text, context, ...(memory ? { suggestion: { unitId: memory.unitId, revisionId: memory.revision.revisionId, provenance: memory.revision.provenance, text: memory.revision.text } } : {}) });
    }
    const review = reviewSchema.parse({ version: 1, id: batchId, pin, targetLocale: request.targetLocale, limits: request.limits, items, createdAt: now });
    const value: Batch = { review, reviewHash: await digest(review), phase: 'planned', cursor: 0, approvedBy: null, policyHash: null };
    await db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?)', [tenant, key(batchId), JSON.stringify(value), now]);
    return { id: batchId, reviewHash: value.reviewHash, sourceLocale: pin.generation.sourceLocale, targetLocale: review.targetLocale,
        providerAccountId: pin.generation.accountId, model: pin.generation.model, limits: review.limits, maxOutputTokens: pin.generation.maxOutputTokens,
        items: preview, monetaryEstimate: null, delivery: 'administrator-continuation' as const, draftOnly: true as const };
}
async function allocate(host: TranslationBatchHost, db: DbRunner, tenant: string, row: Awaited<ReturnType<typeof read>>, now: string) {
    const b = row.value;
    if (b.phase !== 'preparing' || b.policyHash || !await stillCurrent(host, db, tenant, b)) return row;
    const allowance = await prepareTranslationAllowance(host, db, tenant, { allowanceId: 'batch:' + b.review.id, unit: 'provider-request',
        ...b.review.limits, jobs: b.review.items.map(item => item.intent) }, now, { key: key(b.review.id), value: row.raw });
    return save(db, tenant, row, { ...b, policyHash: allowance.policyHash }, now);
}
export async function startTranslationBatch(host: TranslationBatchHost, db: DbRunner, tenant: string, batchId: string, reviewHash: string, actorId: string, now: string) {
    let row = await read(db, tenant, batchId);
    if (row.value.reviewHash !== hash.parse(reviewHash) || !await stillCurrent(host, db, tenant, row.value)) throw Error();
    if (row.value.phase === 'planned') row = await save(db, tenant, row, { ...row.value, phase: 'preparing', approvedBy: id.parse(actorId) }, now);
    if (!['preparing', 'queued', 'done'].includes(row.value.phase) || row.value.approvedBy === null) throw Error();
    if (row.value.phase === 'preparing') await allocate(host, db, tenant, row, now);
}
/** One preparation item or one leased model job per explicit administrator request. No timer/queue claim. */
export async function continueTranslationBatch(host: TranslationBatchHost, db: DbRunner, tenant: string, batchId: string, reviewHash: string, now: string) {
    let row = await read(db, tenant, batchId), b = row.value;
    if (b.reviewHash !== hash.parse(reviewHash) || b.approvedBy === null || !['preparing', 'queued', 'done'].includes(b.phase) || !await stillCurrent(host, db, tenant, b)) throw Error();
    if (b.phase === 'done') return;
    if (!b.policyHash) { await allocate(host, db, tenant, row, now); return; }
    const session = await sessionFor(host, tenant, b.review.pin);
    if (b.phase === 'preparing') {
        const item = b.review.items[b.cursor];
        if (!item) throw Error();
        const glossary = await readTranslationGlossaryTerms(db, tenant, b.review.pin.storage.scope.projectId);
        const source = await extract(host, db, tenant, item.selection, b.review.pin), snapshot = await session.persistence.read(session.scope, item.intent.unitId, b.review.targetLocale);
        if (snapshot.head?.revisionId !== (item.intent.expectedHead ?? undefined)) throw Error();
        if (snapshot.source?.sourceVersion !== item.intent.sourceVersion || snapshot.source.fingerprint !== item.intent.sourceFingerprint || snapshot.source.contextFingerprint !== item.intent.contextFingerprint) {
            const registered = await new TranslationLifecycle(session.persistence).syncSource(session.scope, source.unit, item.previousSourceVersion, withGlossary(glossary, b.review.targetLocale, source));
            if (registered.status === 'conflict' || registered.sourceVersion !== item.intent.sourceVersion || registered.sourceFingerprint !== item.intent.sourceFingerprint || registered.contextFingerprint !== item.intent.contextFingerprint) throw Error();
        }
        const result = await session.persistence.enqueueJob(session.scope, item.intent);
        if (!['created', 'already-exists'].includes(result)) throw Error();
        await save(db, tenant, row, { ...b, cursor: b.cursor + 1, phase: b.cursor + 1 === b.review.items.length ? 'queued' : 'preparing' }, now);
        return;
    }
    const permit = async () => { const current = (await read(db, tenant, batchId)).value; return current.phase === 'queued' && current.reviewHash === b.reviewHash && await stillCurrent(host, db, tenant, current); };
    const executor = await configuredTranslationAllowanceRunner(host, db, tenant, permit);
    for (const item of b.review.items) {
        const job = await session.persistence.readJob(session.scope, item.intent.jobId);
        if (!job) throw Error();
        if (['queued', 'leased'].includes(job.status)) { await executor.runOnce(item.intent.jobId); return; }
    }
    await save(db, tenant, row, { ...b, phase: 'done' }, now);
}
/** Recovery with NEW reviewed identities: a fresh plan over the eligible subset of an executed batch.
 *  Never carries uncertain-dispatched items (held in the original allowance), completed drafts, live
 *  leases or stale/manual-head sources. The source batch is not modified; the returned review still
 *  requires explicit content-transmission approval before any dispatch. */
export async function retryTranslationBatch(host: TranslationBatchHost, db: DbRunner, tenant: string, batchId: string, now: string) {
    const b = (await read(db, tenant, batchId)).value;
    if (b.phase === 'planned' || b.approvedBy === null) throw Error();
    const session = await sessionFor(host, tenant, b.review.pin);
    const retried: Batch['review']['items'][number]['selection'][] = [], excluded: z.infer<typeof batchRetryReviewSchema>['excluded'] = [];
    for (const item of b.review.items) {
        const snapshot = await session.persistence.read(session.scope, item.intent.unitId, b.review.targetLocale);
        if (snapshot.head?.provenance === 'manual') { excluded.push({ selection: item.selection, reason: 'manual-head' }); continue; }
        try { await extract(host, db, tenant, item.selection, b.review.pin); } catch { excluded.push({ selection: item.selection, reason: 'outdated-or-changed' }); continue; }
        const job = await session.persistence.readJob(session.scope, item.intent.jobId);
        if (!job) { retried.push(item.selection); continue; } // Reviewed but never enqueued; the fresh review re-validates everything.
        if (job.status === 'completed') { excluded.push({ selection: item.selection, reason: 'completed' }); continue; }
        if (job.status === 'leased') { excluded.push({ selection: item.selection, reason: 'leased' }); continue; }
        const attempt = job.leaseVersion ? await session.persistence.readAttempt({ scope: session.scope, jobId: job.intent.jobId, leaseVersion: job.leaseVersion }) : null;
        // The attempt record carries the dispatch truth: only an unresolved (dispatched/uncertain) attempt is
        // held. uncertainAttempts alone also marks cleanly-settled cancels, which ARE recoverable here.
        if (attempt?.state === 'dispatched' || attempt?.state === 'uncertain') {
            excluded.push({ selection: item.selection, reason: 'uncertain-dispatch' }); continue; }
        retried.push(item.selection); // Failed cleanly, cancelled (dispatch settled or never sent), or still queued undispatched.
    }
    if (!retried.length) throw Error();
    const plan = await planTranslationBatch(host, db, tenant,
        { targetLocale: b.review.targetLocale, selections: retried, limits: b.review.limits }, now);
    return batchRetryReviewSchema.parse({ ...plan, sourceBatchId: b.review.id, excluded });
}
export async function cancelTranslationBatch(host: TranslationBatchHost, db: DbRunner, tenant: string, batchId: string, reviewHash: string,
    unknownDisposition: 'hold' | 'count-as-consumed', now: string) {
    let row = await read(db, tenant, batchId);
    if (row.value.reviewHash !== hash.parse(reviewHash)) throw Error();
    if (row.value.phase === 'planned') { await save(db, tenant, row, { ...row.value, phase: 'closed' }, now); return; }
    if (row.value.phase !== 'closed' && row.value.phase !== 'cancelling') row = await save(db, tenant, row, { ...row.value, phase: 'cancelling' }, now);
    if (row.value.phase === 'closed') return;
    const reference = row.value.policyHash ? { policyHash: row.value.policyHash } : await translationAllowanceReference(db, tenant, 'batch:' + batchId);
    if (!reference) { await save(db, tenant, row, { ...row.value, phase: 'closed' }, now); return; }
    const existing = await translationAllowanceLifecycle(db, tenant, reference.policyHash);
    const result = existing?.phase === 'closed' ? existing : await closeTranslationAllowance(host, db, tenant, { policyHash: reference.policyHash, unknownDisposition }, now);
    await save(db, tenant, row, { ...row.value, policyHash: reference.policyHash, phase: result.phase === 'closed' ? 'closed' : 'cancelling' }, now);
}
export async function translationBatchStatus(host: TranslationBatchHost, db: DbRunner, tenant: string, batchId: string) {
    const b = (await read(db, tenant, batchId)).value, items = [];
    let storageAvailable = true;
    try {
        if (b.approvedBy !== null) {
            const session = await sessionFor(host, tenant, b.review.pin);
            for (const item of b.review.items) {
                const job = await session.persistence.readJob(session.scope, item.intent.jobId);
                const attempt = job?.leaseVersion ? await session.persistence.readAttempt({ scope: session.scope, jobId: job.intent.jobId, leaseVersion: job.leaseVersion }) : null;
                let current = false;
                try { current = (await extract(host, db, tenant, item.selection, b.review.pin)).pageHash === item.pageHash; } catch { /* Deleted/inaccessible source never exposes result text. */ }
                const result = current && job?.status === 'completed' ? await session.persistence.readRevision(session.scope, item.intent.unitId, item.intent.locale, item.intent.revisionId) : null;
                items.push({ selection: item.selection, state: job?.status ?? 'not-prepared', error: job?.lastError ?? null, accounting: attempt?.state ?? null,
                    outdated: !current, result: result?.text ?? null });
            }
        }
    } catch { storageAvailable = false; }
    const lifecycle = b.policyHash ? await translationAllowanceLifecycle(db, tenant, b.policyHash) : null;
    return { id: b.review.id, reviewHash: b.reviewHash, state: lifecycle?.phase === 'closed' ? 'closed' : b.phase, preparedItems: b.cursor,
        itemCount: b.review.items.length, approvedBy: b.approvedBy, storageAvailable, items, lifecycle, delivery: 'administrator-continuation' as const, draftOnly: true as const };
}

const historyRequestSchema = z.object({ selection: selectionSchema, locale: localeSchema, limit: z.number().int().min(1).max(100).default(20) }).strict();
const restoreRequestSchema = z.object({ selection: selectionSchema, locale: localeSchema, revisionId: id }).strict();
const historyDisplayChars = 12000;
const revisionSummary = (revision: StoredRevision, headId: string | null) => ({ revisionId: revision.revisionId, provenance: revision.provenance,
    text: revision.text.slice(0, historyDisplayChars), textTruncated: revision.text.length > historyDisplayChars,
    sourceVersion: revision.sourceVersion, isHead: revision.revisionId === headId });

/** Administrator revision history for one owned selection. unitId is always re-derived through the
 *  eligibility extractors (a raw storage key is never accepted), rows are bounded newest-first in
 *  storage order, and the listing is strictly read-only. */
export async function translationUnitHistory(host: TranslationBatchHost, db: DbRunner, tenant: string, input: unknown) {
    const request = historyRequestSchema.parse(input), pin = await currentTranslationHostPin(host, db, tenant);
    if (!pin.generation.targetLocales.includes(request.locale)) throw Error();
    const source = await extract(host, db, tenant, request.selection, pin), unitId = await translationUnitId(pin.storage.scope, source.unit.resource);
    const session = await sessionFor(host, tenant, pin);
    const snapshot = await session.persistence.read(session.scope, unitId, request.locale);
    const head = snapshot.head ? revisionSummary(snapshot.head, snapshot.head.revisionId) : null;
    if (!snapshot.source) return translationUnitHistorySchema.parse({ version: 1, unitId, locale: request.locale,
        sourceLocale: pin.generation.sourceLocale, source: null, head: null, manualProtected: false, revisions: [] });
    const revisions = await session.persistence.listRevisions(session.scope, unitId, request.locale, request.limit);
    return translationUnitHistorySchema.parse({ version: 1, unitId, locale: request.locale, sourceLocale: pin.generation.sourceLocale,
        source: { text: snapshot.source.unit.text.slice(0, historyDisplayChars), textTruncated: snapshot.source.unit.text.length > historyDisplayChars,
            sourceVersion: snapshot.source.sourceVersion, sourceFingerprint: snapshot.source.fingerprint, contextFingerprint: snapshot.source.contextFingerprint },
        head, manualProtected: snapshot.head?.provenance === 'manual',
        revisions: revisions.map(revision => revisionSummary(revision, snapshot.head?.revisionId ?? null)) });
}

/** Restore composes a NEW auditable manual revision from an old one; history never rewinds and the
 *  current head must match (CAS). The intent carries the CURRENT source identity, so a restore
 *  succeeds whenever the old wording is still a valid translation of today's source and refuses
 *  with a precise reason when the source, context or head moved on. */
export async function restoreTranslationRevision(host: TranslationBatchHost, db: DbRunner, tenant: string, input: unknown) {
    const request = restoreRequestSchema.parse(input), pin = await currentTranslationHostPin(host, db, tenant);
    if (!pin.generation.targetLocales.includes(request.locale)) throw Error();
    const source = await extract(host, db, tenant, request.selection, pin), unitId = await translationUnitId(pin.storage.scope, source.unit.resource);
    const session = await sessionFor(host, tenant, pin);
    const target = await session.persistence.readRevision(session.scope, unitId, request.locale, request.revisionId);
    if (!target || target.unitId !== unitId || target.locale !== request.locale) throw Object.assign(Error('translation_restore_missing'), { reason: 'not-found' });
    const snapshot = await session.persistence.read(session.scope, unitId, request.locale);
    if (!snapshot.source) throw Object.assign(Error('translation_restore_missing'), { reason: 'not-found' });
    const result = await new TranslationLifecycle(session.persistence).writeManual(session.scope, { version: 1, unitId,
        revisionId: crypto.randomUUID(), locale: request.locale, sourceFingerprint: snapshot.source.fingerprint,
        sourceVersion: snapshot.source.sourceVersion, contextFingerprint: snapshot.source.contextFingerprint,
        expectedHead: snapshot.head?.revisionId ?? null, text: target.text });
    if (result.status === 'rejected') throw Object.assign(Error('translation_restore_refused'), { reason: result.reason });
    const after = await session.persistence.read(session.scope, unitId, request.locale);
    return translationRestoreResultSchema.parse({ version: 1, unitId, locale: request.locale, restoredRevisionId: result.revisionId,
        head: after.head ? revisionSummary(after.head, after.head.revisionId) : null });
}
