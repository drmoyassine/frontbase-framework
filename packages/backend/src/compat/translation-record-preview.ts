/** Private per-record locale review through the Data Inspector. Mirrors the saved-page preview:
 *  the server re-reads every record through the owned connection, so client-supplied keys only
 *  address rows — they never inject content. No provider resolution, jobs, allowances or
 *  publication writes. */
import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { translationRecordPreviewRequestSchema, translationRecordPreviewSchema, translationRecordSaveSchema } from '@frontbase/edge-core/localization/batches';
import { TranslationLifecycle, localeSchema, translationUnitId, messageSourceFingerprint, translationContextFingerprint } from '@frontbase/edge-core/localization';
import type { batchRecordSelectionSchema, batchViewSelectionSchema } from '@frontbase/edge-core/localization/batches';
import { configuredTranslationStorage, configuredTranslationStorageIdentity } from './translation-storage.js';
import { TranslationGenerationStore } from './translation-generation.js';
import { extractRecordInput, extractViewRecordInput, translationInputHash, translationPlainText, type TranslationViewHost } from './translation-inputs.js';

type RecordSelection = z.infer<typeof batchRecordSelectionSchema> | z.infer<typeof batchViewSelectionSchema>;
type Pin = { storage: { scope: import('@frontbase/edge-core/localization').LocalizationScope }; generation: { sourceLocale: string } };

async function recordSession(host: TranslationViewHost, db: DbRunner, tenant: string, requestedLocale: string) {
    const locale = localeSchema.parse(requestedLocale);
    const generation = (await new TranslationGenerationStore(db, tenant).get()).configuration;
    if (!generation || !generation.targetLocales.includes(locale)) throw Error();
    const store = await configuredTranslationStorage(host, db, tenant);
    const identity = await configuredTranslationStorageIdentity(host, db, tenant);
    if (identity.configurationRevision !== store.configurationRevision || identity.scope.projectId !== store.scope.projectId || JSON.stringify(identity.destination) !== JSON.stringify(store.destination)) throw Error();
    await store.persistence.initialize();
    const pin: Pin = { storage: { scope: store.scope }, generation: { sourceLocale: generation.sourceLocale } };
    const configHash = await translationInputHash({ identity, sourceLocale: generation.sourceLocale, targetLocales: generation.targetLocales });
    return { ...store, pin, configHash, generation, locale };
}
type Session = Awaited<ReturnType<typeof recordSession>>;
async function extract(host: TranslationViewHost, db: DbRunner, tenant: string, selection: RecordSelection, pin: Pin) {
    return selection.kind === 'view-record' ? extractViewRecordInput(host, db, tenant, selection, pin) : extractRecordInput(host, tenant, selection, pin);
}
async function recordField(host: TranslationViewHost, db: DbRunner, tenant: string, session: Session, selection: RecordSelection) {
    const input = await extract(host, db, tenant, selection, session.pin);
    const unitId = await translationUnitId(session.scope, input.unit.resource);
    const snapshot = await session.persistence.read(session.scope, unitId, session.locale);
    const fingerprint = await messageSourceFingerprint(input.unit), contextFingerprint = await translationContextFingerprint(input.context);
    const current = snapshot.source?.fingerprint === fingerprint && snapshot.source.contextFingerprint === contextFingerprint;
    const head = snapshot.head;
    const fresh = current && !!head && head.sourceVersion === snapshot.source?.sourceVersion && head.sourceFingerprint === fingerprint && head.contextFingerprint === contextFingerprint;
    const token = await translationInputHash({ config: session.configHash, source: input.pageHash, selection, locale: session.locale, snapshot });
    return { input, snapshot, value: { selection, source: input.unit.text,
        translation: fresh ? translationPlainText(head!.text) : null, state: head ? fresh ? 'draft' as const : 'outdated' as const : 'missing' as const,
        provenance: head?.provenance ?? null, revisionId: head?.revisionId ?? null, token } };
}
type FieldValue = Awaited<ReturnType<typeof recordField>>['value'];
async function respond(session: Session, fields: FieldValue[]) {
    return translationRecordPreviewSchema.parse({ locale: session.locale, sourceLocale: session.generation.sourceLocale,
        targetLocales: session.generation.targetLocales, fields, draftOnly: true });
}
export async function translationRecordPreview(host: TranslationViewHost, db: DbRunner, tenant: string, raw: unknown) {
    const request = translationRecordPreviewRequestSchema.parse(raw);
    const session = await recordSession(host, db, tenant, request.locale);
    const fields = [];
    for (const selection of request.selections) {
        // Mirrors the page preview: ineligible, changed and unreachable records are skipped alike;
        // a failed translation-store read (inside recordField) must still fail the whole preview.
        try { await extract(host, db, tenant, selection, session.pin); } catch { continue; }
        fields.push((await recordField(host, db, tenant, session, selection)).value);
    }
    const latest = await recordSession(host, db, tenant, request.locale);
    if (latest.configHash !== session.configHash) throw Error();
    return respond(session, fields);
}
export async function saveTranslationRecordField(host: TranslationViewHost, db: DbRunner, tenant: string, raw: unknown) {
    const request = translationRecordSaveSchema.parse(raw);
    translationPlainText(request.text);
    const session = await recordSession(host, db, tenant, request.locale);
    const selected = await recordField(host, db, tenant, session, request.selection);
    if (selected.value.token !== request.token) throw Error();
    const lifecycle = new TranslationLifecycle(session.persistence);
    const source = await lifecycle.syncSource(session.scope, selected.input.unit, selected.snapshot.source?.sourceVersion ?? null, selected.input.context);
    if (source.status === 'conflict') throw Error();
    const latest = await recordSession(host, db, tenant, request.locale);
    if (latest.configHash !== session.configHash) throw Error();
    const result = await lifecycle.writeManual(session.scope, { version: 1, unitId: source.unitId, locale: request.locale,
        revisionId: crypto.randomUUID(), sourceVersion: source.sourceVersion, sourceFingerprint: source.sourceFingerprint,
        contextFingerprint: source.contextFingerprint, expectedHead: selected.snapshot.head?.revisionId ?? null, text: request.text });
    if (result.status === 'rejected') throw Error();
    // Refresh against current source/config; cross-store writes are never claimed to be a distributed transaction.
    return respond(session, [(await recordField(host, db, tenant, session, request.selection)).value]);
}
