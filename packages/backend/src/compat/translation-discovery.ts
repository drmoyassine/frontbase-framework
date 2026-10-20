/** Complete, read-only discovery of the active publication's translation surfaces.
 *
 *  Task-2 contract: every owned surface gets a stable ref, an engine source fingerprint and an
 *  explicit translatability decision; exclusions always state a codebase-evidenced reason and
 *  never carry source text. Authored layouts are walked raw — the hash-pinned manifest is the
 *  immutable reviewed source, and the prepare/review pipeline stays the capture authority for
 *  actual generation. Record identity reuses the shared engine refs (`frontbase:publication`),
 *  so one unit serves every surface that renders the same record field. No AI calls, no writes,
 *  no network I/O beyond the tenant's own database. */
import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { homepageDisplayLayout, homepageDisplayFields, translationUnitId, messageSourceFingerprint, type MessageUnit } from '@frontbase/edge-core/localization';
import { translationCoverageReportSchema, translationCoverageFieldSchema } from '@frontbase/edge-core/localization/batches';
import type { PageLayoutData, PageComponent } from '@frontbase/edge-core';
import type { MenuItem, MenuDefinition } from '@frontbase/edge-core/menus';
import type { TranslationBatchHost } from './translation-batches.js';
import { SitePublicationStore } from './site-publication-store.js';
import { SitePublicationReviewStore } from './site-publication-review-store.js';
import { SitePublicationManifestStore, type SitePublicationManifest } from './site-publication-manifest.js';
import type { PublicationChunk } from './site-publication-chunks.js';
import { TranslationGenerationStore } from './translation-generation.js';
import { configuredTranslationStorage } from './translation-storage.js';
import { extractMenuInput, translationInputHash } from './translation-inputs.js';
import { publicationHash } from './publication-hash.js';
import { MenusStore } from './menus-store.js';

const cursor = z.string().regex(/^s\d{1,4}f\d{1,5}$|^r(?:institutions|programs|cities|articles|pages):\d{1,5}$/);
const requestSchema = z.object({ surfacesAfter: cursor.optional(), recordsAfter: cursor.optional() }).strict();

const collections = ['institutions', 'programs', 'cities', 'articles', 'pages'] as const;
type Collection = typeof collections[number];
/** Translatable display columns per collection, in fixed decision order. */
const textColumns: Record<Collection, string[]> = { institutions: ['title', 'summary', 'coverAlt'], programs: ['title', 'summary', 'coverAlt'],
    cities: ['title'], articles: ['title', 'summary', 'coverAlt', 'byline'], pages: ['title', 'summary', 'coverAlt', 'byline'] };
/** Structural or out-of-scope columns. Reasons are codebase-evidenced: ids/paths/references are
 *  not prose, media URLs and dates must stay literal, article bodies are rich editorial blocks,
 *  and institution/program plain bodies exceed every existing plain-text translation bound. */
const excludedColumns: Record<Collection, [string, string][]> = {
    institutions: [['id', 'record-id'], ['originalPath', 'identifier-url'], ['cover', 'media-url'], ['logo', 'media-url'], ['cityId', 'structural-reference'], ['body', 'exceeds-plain-text-limits']],
    programs: [['id', 'record-id'], ['originalPath', 'identifier-url'], ['cover', 'media-url'], ['logo', 'media-url'], ['institutionId', 'structural-reference'], ['body', 'exceeds-plain-text-limits']],
    cities: [['id', 'record-id']],
    articles: [['id', 'record-id'], ['originalPath', 'identifier-url'], ['cover', 'media-url'], ['logo', 'media-url'], ['publishedAt', 'date-value'], ['language', 'locale-tag'], ['revision', 'revision-counter'], ['body', 'editorial-blocks']],
    pages: [['id', 'record-id'], ['originalPath', 'identifier-url'], ['cover', 'media-url'], ['logo', 'media-url'], ['publishedAt', 'date-value'], ['language', 'locale-tag'], ['revision', 'revision-counter'], ['body', 'editorial-blocks']],
};
const structuralColumns = new Set(['id', 'originalPath', 'cityId', 'institutionId', 'language', 'revision']);
const listCollection: Record<string, 'institutions' | 'programs' | 'articles'> = { 'directory.institution.list': 'institutions', 'directory.program.list': 'programs', 'directory.article.list': 'articles' };

type CoverageField = z.infer<typeof translationCoverageFieldSchema>;

const present = (value: unknown) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length);

export async function discoverTranslationCoverage(host: TranslationBatchHost, db: DbRunner, tenant: string, input: unknown) {
    const query = requestSchema.parse(input ?? {});
    const active = await new SitePublicationStore(db, tenant).activeVersion();
    if (!active || active.artifact.schemaVersion !== 2 || !await new SitePublicationReviewStore(db, tenant).get(active.pointer.hash)) throw Error('reviewed_publication_required');
    const manifest = active.artifact as SitePublicationManifest;
    const config = (await new TranslationGenerationStore(db, tenant).get()).configuration;
    if (!config || !config.targetLocales.length) throw Error('configured_locale_required');
    const storage = await configuredTranslationStorage(host, db, tenant);
    await storage.persistence.initialize().catch(() => { throw Error('translation_storage_unavailable'); });
    const scope = storage.scope, sourceLocale = config.sourceLocale;
    const unit = <R extends MessageUnit['resource']>(resource: R, text: string): MessageUnit =>
        ({ version: 1, scope, resource, sourceLocale, format: 'plain', text, segmenterVersion: 1, placeholders: [] });

    const indexTotals = Object.fromEntries(collections.map(collection => [collection,
        manifest.index.filter(row => row.collection === collection).length])) as Record<Collection, number>;

    // --- Records: complete chunk-index enumeration; text joins by the shared publication identity. ---
    const chunkStore = new SitePublicationManifestStore(db, tenant), chunkCache = new Map<string, PublicationChunk>();
    const loadChunk = async (hash: string): Promise<PublicationChunk> => {
        const cached = chunkCache.get(hash); if (cached) return cached;
        const reference = manifest.chunks.find(candidate => candidate.hash === hash);
        if (!reference) throw Error('publication_manifest_chunk_missing');
        const chunk = await chunkStore.loadChunk(manifest, reference); chunkCache.set(hash, chunk); return chunk;
    };
    const recordFields = async (collection: Collection, entry: { id: string | number; chunkHash: string; position: number }) => {
        const chunk = await loadChunk(entry.chunkHash), record = chunk.records[entry.position] as Record<string, unknown>;
        const fields: CoverageField[] = [];
        for (const column of textColumns[collection]) {
            const value = record[column];
            if (typeof value !== 'string' || !value.trim()) continue;
            const resource = { kind: 'record' as const, connectionId: 'frontbase:publication', collection,
                key: [{ column: 'id', value: entry.id }], propertyPath: [column] };
            fields.push({ ref: await translationUnitId(scope, resource), fingerprint: await messageSourceFingerprint(unit(resource, value)),
                label: `Record ${collection} / ${column}`.slice(0, 200), decision: 'translatable', propertyPath: [column], text: value,
                record: { connectionId: 'frontbase:publication', collection, key: [{ column: 'id', value: entry.id }] } });
        }
        for (const [column, reason] of excludedColumns[collection]) {
            if (!structuralColumns.has(column) && !present(record[column])) continue;
            fields.push({ ref: await publicationHash(['excluded', collection, String(entry.id), column]),
                label: `Record ${collection} / ${column}`.slice(0, 200), decision: 'excluded', reason, propertyPath: [column], text: '' });
        }
        return fields;
    };
    const recordsPage = async (cursor: { collection: Collection; offset: number }) => {
        const entries = manifest.index.filter(row => row.collection === cursor.collection)
            .sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
        const items = [];
        for (const entry of entries.slice(cursor.offset, cursor.offset + 25)) items.push({ collection: cursor.collection,
            ref: await publicationHash(['record', cursor.collection, String(entry.id)]), id: entry.id, title: String(entry.title).slice(0, 500),
            fields: await recordFields(cursor.collection, entry) });
        const nextOffset = cursor.offset + 25;
        if (nextOffset < entries.length) return { items, next: `r${cursor.collection}:${nextOffset}` };
        const nextCollection = collections[collections.indexOf(cursor.collection) + 1];
        return { items, next: nextCollection ? `r${nextCollection}:0` : null };
    };

    // --- Authored surfaces: static pages, templates, menus. One full walk feeds totals and paging. ---
    const descriptors: { kind: 'static-page' | 'template' | 'menu'; ref: string; documentId: string; title: string; description: string;
        role?: string; path?: string; menuId?: string; layout?: unknown; menu?: MenuDefinition }[] = [];
    for (const page of manifest.staticPages ?? []) descriptors.push({ kind: 'static-page', documentId: page.pageId,
        ref: await publicationHash(['static-page', page.pageId, page.originalPath]), title: String(page.title).slice(0, 500), description: String(page.description ?? ''), path: page.originalPath, layout: page.layout });
    for (const template of manifest.templates) descriptors.push({ kind: 'template', documentId: template.pageId,
        ref: await publicationHash(['template', template.pageId, template.role]), title: String(template.title).slice(0, 500), description: String(template.description ?? ''), role: template.role, layout: template.layout });
    const menusDocument = await new MenusStore(db, tenant).get();
    for (const menu of menusDocument.menus) descriptors.push({ kind: 'menu', documentId: 'app-menus', description: '',
        ref: await publicationHash(['menu', menu.id]), title: menu.name.slice(0, 500), menuId: menu.id, menu });

    const componentField = async (descriptor: (typeof descriptors)[number], field: { blockId: string; path: string[]; versionId?: string; text: string; label: string;
        record?: { connectionId: string; collection: string; key: { column: string; value: string | number | boolean }[] } }): Promise<CoverageField> => {
        const fieldKey = field.path.at(-1) ?? '';
        const resource = field.record
            ? { kind: 'record' as const, connectionId: field.record.connectionId, collection: field.record.collection, key: field.record.key, propertyPath: [fieldKey] }
            : { kind: 'component' as const, documentId: descriptor.documentId, blockId: field.blockId, versionId: field.versionId ?? 'default', propertyPath: field.path };
        return { ref: field.record ? await translationUnitId(scope, resource) : await publicationHash([field.blockId, field.versionId ?? 'default', field.path]),
            fingerprint: await messageSourceFingerprint(unit(resource, field.text)), label: field.label.slice(0, 200), decision: 'translatable',
            propertyPath: field.path, ...(field.versionId ? { versionId: field.versionId } : {}), text: field.text,
            ...(field.record ? { record: field.record } : {}) };
    };

    let projectedSubtreeNodes = 0;
    const lists: z.infer<typeof translationCoverageReportSchema>['lists'] = [];
    const renderedBySurface = new Map<string, Record<string, string[]>>();
    const countProjected = (nodes: PageComponent[]): number => nodes.reduce((sum, node) => sum + 1 + countProjected(node.children ?? [])
        + (node.versions ?? []).reduce((inner, version) => inner + (version.overrides.children ? countProjected(version.overrides.children as PageComponent[]) : 0), 0), 0);

    for (const descriptor of descriptors.filter(candidate => candidate.layout !== undefined)) {
        const layout = descriptor.layout as unknown as PageLayoutData, surfaceRef = descriptor.ref;
        // Record-projected subtrees: children of list elements render record values, never surface text.
        const walkProjections = (nodes: PageComponent[]): void => { for (const node of nodes) {
            const binding = node.props?.binding ?? (node as { binding?: unknown }).binding;
            if (binding && (binding as Record<string, any>).source?.kind === 'publication' || node.props?.directoryQuery !== undefined) {
                projectedSubtreeNodes += countProjected(node.children ?? []);
                const table = String((binding as Record<string, any>)?.tableName ?? '');
                if (['institutions', 'programs', 'articles'].includes(table)) lists.push({ surface: surfaceRef, componentId: node.id.slice(0, 160),
                    collection: table as 'institutions' | 'programs' | 'articles', window: Math.min(48, Math.max(1, Number((binding as Record<string, any>).pagination?.pageSize) || 12)), total: indexTotals[table as Collection] });
                else { const queryId = String((node.props?.directoryQuery as Record<string, any>)?.queryId ?? ''), mapped = listCollection[queryId];
                    if (mapped) lists.push({ surface: surfaceRef, componentId: node.id.slice(0, 160), collection: mapped,
                        window: Math.min(48, Math.max(1, Number((node.props?.directoryQuery as Record<string, any>).params?.limit) || manifest.configuration.browsing.pageSize)), total: indexTotals[mapped] }); }
            } else if (node.children) walkProjections(node.children);
            for (const version of node.versions ?? []) {
                const override = version.overrides.props?.binding as Record<string, any> | undefined;
                if (override?.source?.kind === 'publication') { projectedSubtreeNodes += countProjected((version.overrides.children ?? []) as PageComponent[]);
                    const table = String(override.tableName);
                    if (['institutions', 'programs', 'articles'].includes(table)) lists.push({ surface: surfaceRef, componentId: node.id.slice(0, 160), versionId: version.id,
                        collection: table as 'institutions' | 'programs' | 'articles', window: Math.min(48, Math.max(1, Number(override.pagination?.pageSize) || 12)), total: indexTotals[table as Collection] });
                } else if (version.overrides.children) walkProjections(version.overrides.children as PageComponent[]);
            }
        } };
        walkProjections(layout.content ?? []);
        // Rendered record columns per query/binding: the evidence linking catalog decisions to surfaces.
        const rendered: Record<string, Set<string>> = {};
        const addTo = (key: string, column: string) => { (rendered[key] ?? (rendered[key] = new Set())).add(column); };
        const collectRendered = (nodes: PageComponent[], context: string | null): void => { for (const node of nodes) {
            const props = node.props ?? {}; let current = context;
            const binding = props.binding ?? (node as { binding?: unknown }).binding;
            if (props.directoryQuery !== undefined) current = String((props.directoryQuery as Record<string, any>).queryId);
            else if (binding && (binding as Record<string, any>).source?.kind === 'publication') current = `publication:${(binding as Record<string, any>).tableName}`;
            if (current) { const mapping = props.recordBindings as Record<string, unknown> | undefined;
                if (mapping) for (const key of ['text', 'href', 'src', 'alt', 'ariaLabel', 'blocks'] as const) if (mapping[key]) addTo(current, String(mapping[key]));
                for (const value of Object.values(props)) if (typeof value === 'string') { const match = /\{\{\s*record\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/.exec(value); if (match) addTo(current, match[1]!); } }
            if (node.children) collectRendered(node.children, current);
            for (const version of node.versions ?? []) if (version.overrides.children) collectRendered(version.overrides.children as PageComponent[], current);
        } };
        collectRendered(layout.content ?? [], null);
        renderedBySurface.set(surfaceRef, Object.fromEntries(Object.entries(rendered).map(([key, columns]) => [key, [...columns].sort()])));
    }

    const surfaceFields: CoverageField[][] = [];
    let menuSkipped = 0;
    const pin = { storage: { scope }, generation: { sourceLocale } };
    for (const descriptor of descriptors) {
        if (descriptor.menu) {
            const menu = descriptor.menu, fields: CoverageField[] = [];
            const selections: ({ kind: 'menu'; menuId: string; field: 'brand' | 'copyright' | 'description' } | { kind: 'menu'; menuId: string; itemId: string; field: 'label' })[] = (['brand', 'copyright', 'description'] as const).map(field => ({ kind: 'menu' as const, menuId: menu.id, field }));
            const walkItems = (items: MenuItem[]): void => { for (const item of items) { selections.push({ kind: 'menu', menuId: menu.id, itemId: item.id, field: 'label' }); walkItems(item.children); } };
            walkItems(menu.items);
            const loaded = { document: menusDocument, pageHash: await translationInputHash({ revision: menusDocument.revision, menu }) };
            for (const selection of selections) {
                try { const extracted = await extractMenuInput(db, tenant, selection, pin, loaded);
                    const resource = extracted.unit.resource;
                    if (resource.kind !== 'component') throw Error();
                    fields.push({ ref: await translationUnitId(scope, resource), fingerprint: await messageSourceFingerprint(extracted.unit),
                        label: (extracted.context.resourceLabel ?? 'Menu field').slice(0, 200), decision: 'translatable', propertyPath: [...resource.propertyPath], text: extracted.unit.text });
                } catch { menuSkipped++; }
            }
            surfaceFields.push(fields);
        } else {
            const normalized = homepageDisplayLayout(descriptor.layout as unknown as PageLayoutData);
            const authored = homepageDisplayFields(normalized);
            const fields: CoverageField[] = [];
            for (const field of authored) fields.push(await componentField(descriptor, field));
            if (descriptor.title.trim()) fields.push(await componentField(descriptor, { blockId: '$meta', path: ['title'], text: descriptor.title, label: 'Page title' }));
            if (descriptor.description.trim()) fields.push(await componentField(descriptor, { blockId: '$meta', path: ['description'], text: descriptor.description, label: 'Page description' }));
            surfaceFields.push(fields);
        }
    }

    // --- Cursor paging over the fixed descriptor order. ---
    const surfacesPage = (start: { index: number; fieldOffset: number }) => {
        const items = []; let index = start.index, fieldOffset = start.fieldOffset, budget = 400;
        while (index < descriptors.length && items.length < 50 && budget > 0) {
            const all = surfaceFields[index] ?? [], slice = all.slice(fieldOffset, fieldOffset + budget);
            budget -= slice.length;
            const truncated = fieldOffset + slice.length < all.length;
            const descriptor = descriptors[index]!;
            items.push({ kind: descriptor.kind, ref: descriptor.ref, title: descriptor.title, ...(descriptor.role ? { role: descriptor.role } : {}),
                ...(descriptor.path ? { path: descriptor.path } : {}), ...(descriptor.menuId ? { menuId: descriptor.menuId } : {}),
                fields: slice, ...(truncated ? { fieldsTruncated: true } : {}),
                ...(renderedBySurface.has(descriptor.ref) ? { renderedColumns: renderedBySurface.get(descriptor.ref)! } : {}) });
            if (truncated) return { items, next: `s${index}f${fieldOffset + slice.length}` };
            index++; fieldOffset = 0;
        }
        return { items, next: index < descriptors.length ? `s${index}f0` : null };
    };

    const exclusions: { reason: string; count: number }[] = [];
    const addExclusion = (reason: string, count: number) => { if (count > 0) exclusions.push({ reason, count }); };
    addExclusion('record-id', indexTotals.institutions + indexTotals.programs + indexTotals.cities + indexTotals.articles + indexTotals.pages);
    addExclusion('identifier-url', indexTotals.institutions + indexTotals.programs + indexTotals.articles + indexTotals.pages);
    addExclusion('structural-reference', indexTotals.institutions + indexTotals.programs);
    addExclusion('exceeds-plain-text-limits', indexTotals.institutions + indexTotals.programs);
    addExclusion('editorial-blocks', indexTotals.articles + indexTotals.pages);
    addExclusion('locale-tag', indexTotals.articles + indexTotals.pages);
    addExclusion('revision-counter', indexTotals.articles + indexTotals.pages);
    addExclusion('record-projected-subtree', projectedSubtreeNodes);
    addExclusion('menu-empty-unsupported', menuSkipped);
    exclusions.sort((a, b) => a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0);
    lists.sort((a, b) => JSON.stringify([a.surface, a.componentId, a.versionId ?? '', a.collection]) < JSON.stringify([b.surface, b.componentId, b.versionId ?? '', b.collection]) ? -1 : 1);

    const translatable = surfaceFields.reduce((sum, fields) => sum + fields.length, 0);
    const surfaces = query.surfacesAfter
        ? { index: Number(query.surfacesAfter.slice(1, query.surfacesAfter.indexOf('f'))), fieldOffset: Number(query.surfacesAfter.slice(query.surfacesAfter.indexOf('f') + 1)) }
        : { index: 0, fieldOffset: 0 };
    const records = query.recordsAfter
        ? { collection: query.recordsAfter.slice(1, query.recordsAfter.indexOf(':')) as Collection, offset: Number(query.recordsAfter.slice(query.recordsAfter.indexOf(':') + 1)) }
        : { collection: 'institutions' as Collection, offset: 0 };

    return translationCoverageReportSchema.parse({
        version: 1,
        site: { hash: active.pointer.hash, generation: active.pointer.generation, name: String(manifest.configuration.site.name).slice(0, 200),
            origin: String(manifest.configuration.site.origin).slice(0, 500), locale: manifest.configuration.site.locale || 'en',
            sourceLocale: config.sourceLocale, targetLocales: config.targetLocales, storageDatasource: storage.destination.datasourceId },
        totals: { index: indexTotals, chunks: manifest.chunks.length, staticPages: (manifest.staticPages ?? []).length,
            templates: manifest.templates.length, menus: menusDocument.menus.length, fields: { translatable, excluded: menuSkipped } },
        lists: lists.slice(0, 200),
        terminology: { approvedStore: 'none' as const, providerGlossary: 'Provider contract supports up to 64 glossary entries; no approved-terminology store populates it yet.' },
        exclusions,
        surfaces: surfacesPage(surfaces),
        records: await recordsPage(records),
    });
}
