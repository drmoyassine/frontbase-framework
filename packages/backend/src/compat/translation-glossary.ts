/** Project terminology store: project-private by default; a tenant-wide catalog applies only when a
 *  project explicitly adopts it. Deterministic application: literal occurrence in the source text,
 *  term-ascending order, 64-entry cap (the context contract's glossary bound). */
import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { translationGlossaryStoreSchema, translationGlossarySaveSchema, translationGlossaryPublishSchema, translationGlossaryAdoptSchema,
    translationGlossaryStateSchema } from '@frontbase/edge-core/localization/batches';
import type { TranslationContext } from '@frontbase/edge-core/localization';

const projectKey = (projectId: string) => 'translation_glossary:v1:' + projectId, catalogKey = 'translation_glossary_shared:v1';
type Store = z.infer<typeof translationGlossaryStoreSchema>;
type Catalog = { version: 1; revision: number; terms: z.infer<typeof translationGlossarySaveSchema>['terms'] };
const emptyStore: Store = { version: 1, revision: 0, terms: [], shared: { enabled: false, revision: null } };

async function readStore(runner: DbRunner, tenant: string, projectId: string): Promise<{ raw: string | null; value: Store }> {
    const rows = await runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [tenant, projectKey(projectId)]);
    if (!rows.length) return { raw: null, value: emptyStore };
    const raw = String(rows[0]!.value);
    return { raw, value: translationGlossaryStoreSchema.parse(JSON.parse(raw)) };
}
async function readCatalog(runner: DbRunner, tenant: string): Promise<{ raw: string | null; value: Catalog | null }> {
    const rows = await runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [tenant, catalogKey]);
    if (!rows.length) return { raw: null, value: null };
    const raw = String(rows[0]!.value), parsed = z.object({ version: z.literal(1), revision: z.number().int().nonnegative().safe(),
        terms: translationGlossaryPublishSchema.shape.terms }).strict().parse(JSON.parse(raw));
    return { raw, value: parsed };
}
/** Compare-and-set write over the exact prior raw row; returns null when another writer won. */
async function writeCas(runner: DbRunner, tenant: string, key: string, prior: { raw: string | null }, value: unknown, now: string): Promise<boolean> {
    const raw = JSON.stringify(value);
    const changed = prior.raw === null
        ? await runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING', [tenant, key, raw, now])
        : await runner.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?', [raw, now, tenant, key, prior.raw]);
    return changed === 1;
}
export async function saveTranslationGlossary(runner: DbRunner, tenant: string, projectId: string, input: unknown, now: string) {
    const request = translationGlossarySaveSchema.parse(input), prior = await readStore(runner, tenant, projectId);
    if ((prior.value.revision) !== request.expectedRevision) return null;
    const next = translationGlossaryStoreSchema.parse({ ...prior.value, revision: request.expectedRevision + 1, terms: request.terms });
    return await writeCas(runner, tenant, projectKey(projectId), prior, next, now) ? next : null;
}
export async function publishTranslationGlossary(runner: DbRunner, tenant: string, input: unknown, now: string) {
    const request = translationGlossaryPublishSchema.parse(input), prior = await readCatalog(runner, tenant);
    if ((prior.value?.revision ?? 0) !== request.expectedRevision) return null;
    const next: Catalog = { version: 1, revision: request.expectedRevision + 1, terms: request.terms };
    return await writeCas(runner, tenant, catalogKey, prior, next, now) ? next : null;
}
/** Adopting requires the CURRENT catalog revision; dismissal is unconditional (both are project CAS writes). */
export async function adoptTranslationGlossary(runner: DbRunner, tenant: string, projectId: string, input: unknown, now: string) {
    const request = translationGlossaryAdoptSchema.parse(input), prior = await readStore(runner, tenant, projectId);
    if (request.revision !== null) {
        const catalog = await readCatalog(runner, tenant);
        if (catalog.value?.revision !== request.revision) return null;
    }
    const next = translationGlossaryStoreSchema.parse({ ...prior.value, shared: { enabled: request.revision !== null, revision: request.revision } });
    return await writeCas(runner, tenant, projectKey(projectId), prior, next, now) ? next : null;
}
export async function translationGlossaryState(runner: DbRunner, tenant: string, projectId: string) {
    const store = await readStore(runner, tenant, projectId), catalog = await readCatalog(runner, tenant);
    return translationGlossaryStateSchema.parse({ version: 1, revision: store.value.revision, terms: store.value.terms, shared: store.value.shared,
        catalog: catalog.value ? { revision: catalog.value.revision, terms: catalog.value.terms } : null });
}
/** Effective terminology: adopted catalog first, then project terms (project overrides on the same locale+source). */
export async function readTranslationGlossaryTerms(runner: DbRunner, tenant: string, projectId: string) {
    const store = await readStore(runner, tenant, projectId);
    if (!store.value.shared.enabled) return store.value.terms;
    const catalog = await readCatalog(runner, tenant);
    if (!catalog.value) return store.value.terms;
    const merged = new Map<string, (typeof store.value.terms)[number]>();
    for (const term of [...catalog.value.terms, ...store.value.terms]) merged.set(term.locale + '\u0000' + term.source, term);
    return [...merged.values()];
}
/** Literal term occurrence in the source text, term-ascending order, capped at the context contract's 64. */
export function applyTranslationGlossary(terms: readonly { locale: string; source: string; target: string }[], locale: string, sourceText: string): TranslationContext['glossary'] {
    const picked = terms.filter(term => term.locale === locale && sourceText.includes(term.source))
        .map(term => ({ locale: term.locale, source: term.source, target: term.target }))
        .sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : a.target < b.target ? -1 : a.target > b.target ? 1 : 0)
        .slice(0, 64);
    return picked.length ? picked : undefined;
}
