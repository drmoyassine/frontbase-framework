import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler/manifest';
import { directoryConfigurationSchema, directoryConfigurationReadiness, sitePageReferenceSchema, directoryLayoutQueries } from '@frontbase/edge-core/directory/configuration';
import { publicationTemplateSchema, publicationPathSchema } from '@frontbase/edge-core/directory/publication';
import type { PageLayoutData } from '@frontbase/edge-core';
import { publicationHash } from './site-publication-store.js';
import { packPublicationChunks, SitePublicationChunkStore, publicationChunkReferenceSchema, type PublicationChunk, type PublicationChunkReference } from './site-publication-chunks.js';

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const byteSize = (value: unknown) => new TextEncoder().encode(stableStringify(value)).byteLength;
const identity = z.union([z.string().min(1).max(128), z.number().int().positive()]);
const indexEntry = z.object({ collection: publicationChunkReferenceSchema.shape.collection, id: identity,
    title: z.string().min(1).max(500), originalPath: publicationPathSchema.optional(), parentId: identity.optional(),
    chunkHash: publicationChunkReferenceSchema.shape.hash, position: z.number().int().min(0).max(47) }).strict();

/** Internal candidate contract; admission is not content approval or public activation. */
export const sitePublicationManifestSchema = z.object({ schemaVersion: z.literal(2), runtimeVersion: z.literal('directory-chunks-v1'),
    configurationRevision: z.number().int().positive(), configuration: directoryConfigurationSchema,
    templates: z.array(publicationTemplateSchema).min(1).max(7),
    chunks: z.array(publicationChunkReferenceSchema).min(1).max(2048), index: z.array(indexEntry).min(1).max(80000),
}).strict().superRefine((manifest, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (byteSize(manifest) > MAX_MANIFEST_BYTES) fail('publication_manifest_too_large');
    if (directoryConfigurationReadiness(manifest.configuration).length) fail('configuration_incomplete');
    if (manifest.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) > 256 * 1024 * 1024) fail('publication_catalog_too_large');
    const chunks = new Map(manifest.chunks.map(chunk => [chunk.hash, chunk]));
    if (chunks.size !== manifest.chunks.length) fail('duplicate_chunk');
    const keys = new Set<string>(), slots = new Set<string>(), populations = new Map<string, number>();
    const institutions = new Set(manifest.index.filter(row => row.collection === 'institutions').map(row => String(row.id)));
    const cities = new Set(manifest.index.filter(row => row.collection === 'cities').map(row => String(row.id)));
    const paths = [manifest.configuration.routes.directory];
    for (const row of manifest.index) {
        const key = JSON.stringify([row.collection, String(row.id)]), slot = `${row.chunkHash}:${row.position}`;
        if (keys.has(key)) fail('duplicate_record_id'); keys.add(key);
        if (slots.has(slot)) fail('duplicate_chunk_slot'); slots.add(slot);
        const chunk = chunks.get(row.chunkHash);
        if (!chunk || chunk.collection !== row.collection || row.position >= chunk.count) fail('invalid_chunk_reference');
        populations.set(row.collection, (populations.get(row.collection) ?? 0) + 1);
        if (row.collection === 'cities') {
            if (row.originalPath !== undefined || row.parentId !== undefined) fail('invalid_city_index');
        } else {
            if (!row.originalPath) fail('missing_original_path'); else paths.push(row.originalPath);
            if (row.collection === 'institutions' && (row.parentId === undefined || !cities.has(String(row.parentId)))) fail('missing_parent');
            if (row.collection === 'programs' && (row.parentId === undefined || !institutions.has(String(row.parentId)))) fail('missing_parent');
            if (row.collection === 'articles' && row.parentId !== undefined) fail('invalid_article_index');
        }
    }
    for (const count of populations.values()) if (count > 20000) fail('publication_collection_too_large');
    if (manifest.chunks.reduce((sum, chunk) => sum + chunk.count, 0) !== manifest.index.length) fail('incomplete_chunk_index');
    if (!(populations.get('institutions') || populations.get('programs') || populations.get('articles'))) fail('publication_empty');
    if (populations.get('articles')) paths.push(manifest.configuration.routes.blog);
    const normalized = paths.map(path => { try { return decodeURIComponent(path).replace(/\/$/, '') || '/'; } catch { return ''; } });
    if (paths.some(path => !publicationPathSchema.safeParse(path).success || new URL(path, 'https://publication.invalid').pathname !== path)
        || new Set(normalized).size !== paths.length) fail('route_collision');
    const roles = new Set<string>();
    for (const template of manifest.templates) {
        if (roles.has(template.role)) fail('duplicate_template_role'); roles.add(template.role);
        const ref = sitePageReferenceSchema.safeParse((template.layout.root as Record<string, unknown> | undefined)?.siteConfiguration);
        if (!ref.success || ref.data.role !== template.role) fail('template_role_mismatch');
        if (template.role === 'city' || template.role === 'editorial') fail('template_role_not_supported');
        try {
            const queries: string[] = directoryLayoutQueries(template.layout as unknown as PageLayoutData).map(q => q.binding.queryId);
            const expected = template.role === 'article-index' ? ['directory.article.list']
                : ['institution', 'program', 'article'].includes(template.role) ? [`directory.${template.role}.detail`]
                : template.role === 'directory' ? [...(populations.get('institutions') ? ['directory.institution.list'] : []), ...(populations.get('programs') ? ['directory.program.list'] : [])] : [];
            if (expected.some(query => !queries.includes(query))) fail('template_query_missing');
        } catch { fail('template_query_invalid'); }
    }
    for (const [role, collection] of [['directory', 'institutions'], ['directory', 'programs'], ['institution', 'institutions'],
        ['program', 'programs'], ['article-index', 'articles'], ['article', 'articles']])
        if (populations.get(collection!) && !roles.has(role!)) fail('missing_template_role');
});
export type SitePublicationManifest = z.infer<typeof sitePublicationManifestSchema>;
type Header = Pick<SitePublicationManifest, 'configurationRevision' | 'configuration' | 'templates'>;
type Records = Record<PublicationChunkReference['collection'], unknown[]>;
const recordsInput = z.object({ cities: z.array(z.unknown()).max(20000), institutions: z.array(z.unknown()).max(20000),
    programs: z.array(z.unknown()).max(20000), articles: z.array(z.unknown()).max(20000) }).strict();

function indexChunk(chunk: PublicationChunk, reference: PublicationChunkReference) {
    return chunk.records.map((record, position) => ({ collection: chunk.collection, id: record.id, title: record.title,
        ...('originalPath' in record ? { originalPath: record.originalPath } : {}),
        ...('cityId' in record ? { parentId: record.cityId } : 'institutionId' in record ? { parentId: record.institutionId } : {}),
        chunkHash: reference.hash, position }));
}

export class SitePublicationManifestStore {
    private chunks: SitePublicationChunkStore;
    constructor(private db: DbRunner, private tenant: string) { this.chunks = new SitePublicationChunkStore(db, tenant); }
    async prepare(header: Header, records: Records, now: string): Promise<string> {
        const input = recordsInput.parse(records);
        const packed = (['cities', 'institutions', 'programs', 'articles'] as const).flatMap(collection => packPublicationChunks(collection, input[collection]));
        const references = await Promise.all(packed.map(async chunk => publicationChunkReferenceSchema.parse({ hash: await publicationHash(chunk),
            collection: chunk.collection, count: chunk.records.length, bytes: byteSize(chunk) })));
        // Global admission precedes any persistence, including chunks.
        const manifest = sitePublicationManifestSchema.parse({ ...header, schemaVersion: 2, runtimeVersion: 'directory-chunks-v1',
            chunks: references, index: packed.flatMap((chunk, i) => indexChunk(chunk, references[i]!)) });
        for (const chunk of packed) await this.chunks.put(chunk, now);
        const hash = await publicationHash(manifest);
        const changed = await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',
            [this.tenant, `site_publication:manifest:v2:${hash}`, stableStringify(manifest), now]);
        if (changed !== 0 && changed !== 1) throw new Error('publication_write_result_invalid');
        const persisted = await this.get(hash);
        if (!persisted) throw new Error('publication_manifest_unavailable');
        await this.verify(persisted);
        return hash;
    }
    async get(hash: string): Promise<SitePublicationManifest | null> {
        if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('publication_hash_invalid');
        const rows = await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, `site_publication:manifest:v2:${hash}`]);
        if (!rows.length) return null;
        try {
            const raw = String(rows[0]!.value);
            if (new TextEncoder().encode(raw).byteLength > MAX_MANIFEST_BYTES) throw new Error();
            const manifest = sitePublicationManifestSchema.parse(JSON.parse(raw));
            if (await publicationHash(manifest) !== hash) throw new Error();
            return manifest;
        } catch { throw new Error('publication_manifest_unavailable'); }
    }
    async loadChunk(manifestInput: SitePublicationManifest, referenceInput: PublicationChunkReference): Promise<PublicationChunk> {
        const manifest = sitePublicationManifestSchema.parse(manifestInput), reference = publicationChunkReferenceSchema.parse(referenceInput);
        return this.loadVerifiedChunk(manifest, reference);
    }
    private async loadVerifiedChunk(manifest: SitePublicationManifest, reference: PublicationChunkReference): Promise<PublicationChunk> {
        if (!manifest.chunks.some(chunk => stableStringify(chunk) === stableStringify(reference))) throw new Error('publication_manifest_chunk_mismatch');
        const chunk = await this.chunks.get(reference);
        if (!chunk) throw new Error('publication_manifest_chunk_missing');
        const expected = manifest.index.filter(row => row.chunkHash === reference.hash).sort((a,b) => a.position - b.position);
        if (stableStringify(indexChunk(chunk, reference)) !== stableStringify(expected)) throw new Error('publication_manifest_index_mismatch');
        return chunk;
    }
    async verify(input: SitePublicationManifest): Promise<void> {
        const manifest = sitePublicationManifestSchema.parse(input);
        for (const reference of manifest.chunks) await this.loadVerifiedChunk(manifest, reference);
    }
}
