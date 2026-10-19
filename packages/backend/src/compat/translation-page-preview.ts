/** Private saved Default page text. No provider resolution, jobs, allowances or publication writes. */
import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { translationPagePreviewSchema, translationPageSaveSchema } from '@frontbase/edge-core/localization/batches';
import { TranslationLifecycle, localeSchema, translationUnitId, messageSourceFingerprint, translationContextFingerprint } from '@frontbase/edge-core/localization';
import { configuredTranslationStorage, configuredTranslationStorageIdentity } from './translation-storage.js';
import { TranslationGenerationStore } from './translation-generation.js';
import { extractTranslationPageInput, TRANSLATION_PAGE_FIELDS, type TranslationBatchHost } from './translation-batches.js';
import { translationInputHash, translationPlainText } from './translation-inputs.js';
import type { VersionedBlock } from '@frontbase/edge-core/block-versions';

async function pageSession(host: TranslationBatchHost, db: DbRunner, tenant: string, pageId: string, requestedLocale: string) {
    z.string().min(1).max(160).parse(pageId);
    const locale = localeSchema.parse(requestedLocale);
    const generation = (await new TranslationGenerationStore(db, tenant).get()).configuration;
    if (!generation || !generation.targetLocales.includes(locale)) throw Error();
    const store = await configuredTranslationStorage(host, db, tenant);
    const identity = await configuredTranslationStorageIdentity(host, db, tenant);
    if (identity.configurationRevision !== store.configurationRevision || identity.scope.projectId !== store.scope.projectId || JSON.stringify(identity.destination) !== JSON.stringify(store.destination)) throw Error();
    await store.persistence.initialize();
    const page = await host.pagesFor(tenant).get(pageId);
    if (!page || page.deleted_at || page.layout_data.length > 1_000_000) throw Error();
    const nodes = JSON.parse(page.layout_data).content as VersionedBlock[];
    const pageHash = await translationInputHash({ layout: page.layout_data, name: page.name });
    const pin = { storage: { scope: store.scope }, generation: { sourceLocale: generation.sourceLocale } };
    const configHash = await translationInputHash({ identity, sourceLocale: generation.sourceLocale, targetLocales: generation.targetLocales });
    return { ...store, page, nodes, pageHash, pin, configHash, generation, locale };
}
type Session = Awaited<ReturnType<typeof pageSession>>;
async function field(host: TranslationBatchHost, tenant: string, session: Session, selection: z.infer<typeof translationPageSaveSchema>['selection']) {
    const input = await extractTranslationPageInput(host, tenant, selection, session.pin, session);
    const unitId = await translationUnitId(session.scope, input.unit.resource);
    const snapshot = await session.persistence.read(session.scope, unitId, session.locale);
    const fingerprint = await messageSourceFingerprint(input.unit), contextFingerprint = await translationContextFingerprint(input.context);
    const current = snapshot.source?.fingerprint === fingerprint && snapshot.source.contextFingerprint === contextFingerprint;
    const head = snapshot.head;
    const fresh = current && !!head && head.sourceVersion === snapshot.source?.sourceVersion && head.sourceFingerprint === fingerprint && head.contextFingerprint === contextFingerprint;
    const token = await translationInputHash({ config: session.configHash, page: session.pageHash, selection, locale: session.locale, snapshot });
    return { input, unitId, snapshot, value: { selection, source: input.unit.text,
        translation: fresh ? translationPlainText(head!.text) : null, state: head ? fresh ? 'draft' as const : 'outdated' as const : 'missing' as const,
        provenance: head?.provenance ?? null, revisionId: head?.revisionId ?? null, token } };
}
export async function translationPagePreview(host: TranslationBatchHost, db: DbRunner, tenant: string, pageId: string, locale: string) {
    const session = await pageSession(host, db, tenant, pageId, locale), selections: z.infer<typeof translationPageSaveSchema>['selection'][] = [];
    const visit = (nodes: VersionedBlock[]) => { for (const node of nodes) {
        const name = TRANSLATION_PAGE_FIELDS[node.type]?.find(name => !!node.props?.[name]);
        if (name) selections.push({ pageId, blockId: node.id, field: name as 'content'|'text'|'value' });
        if (selections.length > 100) throw Error('translation_preview_limit');
        if (node.children) visit(node.children);
    } }; visit(session.nodes);
    const fields = [];
    for (const selection of selections) {
        // Eligibility failures are separate from transport failures: a failed store read must fail the preview.
        try { await extractTranslationPageInput(host, tenant, selection, session.pin, session); } catch { continue; }
        fields.push((await field(host, tenant, session, selection)).value);
    }
    const latest = await pageSession(host, db, tenant, pageId, locale);
    if (latest.pageHash !== session.pageHash || latest.configHash !== session.configHash) throw Error();
    return translationPagePreviewSchema.parse({ pageId, pageHash: session.pageHash, locale: session.locale,
        sourceLocale: session.generation.sourceLocale, targetLocales: session.generation.targetLocales, layout: JSON.parse(session.page.layout_data), fields, draftOnly: true });
}
export async function saveTranslationPageField(host: TranslationBatchHost, db: DbRunner, tenant: string, raw: unknown) {
    const request = translationPageSaveSchema.parse(raw);
    translationPlainText(request.text);
    const session = await pageSession(host, db, tenant, request.selection.pageId, request.locale);
    const selected = await field(host, tenant, session, request.selection);
    if (selected.value.token !== request.token) throw Error();
    const lifecycle = new TranslationLifecycle(session.persistence);
    const source = await lifecycle.syncSource(session.scope, selected.input.unit, selected.snapshot.source?.sourceVersion ?? null, selected.input.context);
    if (source.status === 'conflict') throw Error();
    const latest = await pageSession(host, db, tenant, request.selection.pageId, request.locale);
    if (latest.pageHash !== session.pageHash || latest.configHash !== session.configHash) throw Error();
    const result = await lifecycle.writeManual(session.scope, { version: 1, unitId: source.unitId, locale: request.locale,
        revisionId: crypto.randomUUID(), sourceVersion: source.sourceVersion, sourceFingerprint: source.sourceFingerprint,
        contextFingerprint: source.contextFingerprint, expectedHead: selected.snapshot.head?.revisionId ?? null, text: request.text });
    if (result.status === 'rejected') throw Error();
    // Refresh against current source/config; cross-store writes are never claimed to be a distributed transaction.
    return translationPagePreview(host, db, tenant, request.selection.pageId, request.locale);
}
