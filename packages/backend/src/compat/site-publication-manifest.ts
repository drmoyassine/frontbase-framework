import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler/manifest';
import { directoryConfigurationSchema, directoryConfigurationReadiness, sitePageReferenceSchema, directoryLayoutQueries } from '@frontbase/edge-core/directory/configuration';
import { publicationTemplateSchema, publicationPathSchema } from '@frontbase/edge-core/directory/publication';
import {menuReferenceSchema} from '@frontbase/edge-core/menus';
import type { PageLayoutData } from '@frontbase/edge-core';
import { publicationHash } from './publication-hash.js';
import { packPublicationChunks, SitePublicationChunkStore, publicationChunkReferenceSchema, type PublicationChunk, type PublicationChunkReference } from './site-publication-chunks.js';

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const byteSize = (value: unknown) => new TextEncoder().encode(stableStringify(value)).byteLength;
const identity = z.union([z.string().min(1).max(128), z.number().int().positive()]);
const indexEntry = z.object({ collection: publicationChunkReferenceSchema.shape.collection, id: identity,
    title: z.string().min(1).max(500), originalPath: publicationPathSchema.optional(), parentId: identity.optional(),
    revision: z.number().int().positive().optional(),
    chunkHash: publicationChunkReferenceSchema.shape.hash, position: z.number().int().min(0).max(47) }).strict();
const staticPage = publicationTemplateSchema.omit({role:true}).extend({originalPath:publicationPathSchema}).strict();
const approval = z.object({id:z.string().uuid(),revision:z.number().int().positive(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),contentRole:z.enum(['article','page'])}).strict();
export const publicationRedirectSchema = z.object({from:publicationPathSchema,to:publicationPathSchema}).strict();

/** Internal candidate contract; admission is not content approval or public activation. */
export const sitePublicationManifestSchema = z.object({ schemaVersion: z.literal(2), runtimeVersion: z.literal('directory-chunks-v1'),
    configurationRevision: z.number().int().positive(), configuration: directoryConfigurationSchema,
    templates: z.array(publicationTemplateSchema).max(7),
    chunks: z.array(publicationChunkReferenceSchema).max(2048), index: z.array(indexEntry).max(100000),
    staticPages: z.array(staticPage).max(1000).optional(), approvals:z.array(approval).max(40000).optional(),
    redirects:z.array(publicationRedirectSchema).max(5000).optional(),
}).strict().superRefine((manifest, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    for(const page of [...manifest.templates,...(manifest.staticPages??[])]){const menus=(page.layout.root as Record<string,unknown>|undefined)?.appMenus;if(menus!==undefined){const reference=menuReferenceSchema.safeParse(menus);if(!reference.success||reference.data.pageId!==page.pageId)fail('menu_reference_invalid');}}
    if (byteSize(manifest) > MAX_MANIFEST_BYTES) fail('publication_manifest_too_large');
    if (directoryConfigurationReadiness(manifest.configuration).length) fail('configuration_incomplete');
    if (manifest.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) > 256 * 1024 * 1024) fail('publication_catalog_too_large');
    const chunks = new Map(manifest.chunks.map(chunk => [chunk.hash, chunk]));
    if (chunks.size !== manifest.chunks.length) fail('duplicate_chunk');
    const keys = new Set<string>(), slots = new Set<string>(), populations = new Map<string, number>();
    const institutions = new Set(manifest.index.filter(row => row.collection === 'institutions').map(row => String(row.id)));
    const cities = new Set(manifest.index.filter(row => row.collection === 'cities').map(row => String(row.id)));
    const paths: string[] = [...(manifest.staticPages??[]).map(page=>page.originalPath)];
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
            if (['articles','pages'].includes(row.collection) && (row.parentId !== undefined || row.revision===undefined)) fail('invalid_article_index');
        }
    }
    for (const count of populations.values()) if (count > 20000) fail('publication_collection_too_large');
    if (manifest.chunks.reduce((sum, chunk) => sum + chunk.count, 0) !== manifest.index.length) fail('incomplete_chunk_index');
    if (!(populations.get('institutions') || populations.get('programs') || populations.get('articles') || populations.get('pages') || manifest.staticPages?.length)) fail('publication_empty');
    if(populations.get('institutions') || populations.get('programs'))paths.push(manifest.configuration.routes.directory);
    if (populations.get('articles')) paths.push(manifest.configuration.routes.blog);
    const normalized = paths.map(path => { try { return decodeURIComponent(path).replace(/\/$/, '') || '/'; } catch { return ''; } });
    if (paths.some(path => !publicationPathSchema.safeParse(path).success || new URL(path, 'https://publication.invalid').pathname !== path)
        || new Set(normalized).size !== paths.length) fail('route_collision');
    const aliasIdentities = new Set<string>();
    for(const redirect of manifest.redirects??[]){
        let identity='';try{identity=decodeURIComponent(redirect.from).replace(/\/$/,'')||'/';}catch{fail('redirect_source_invalid');}
        if(new URL(redirect.from,'https://publication.invalid').pathname!==redirect.from
            || normalized.includes(identity) || aliasIdentities.has(identity))fail('redirect_source_collision');
        aliasIdentities.add(identity);
        // Exact captured destination only: no external hosts, guesses, chains or loops.
        if(!paths.includes(redirect.to))fail('redirect_target_unavailable');
    }
    const roles = new Set<string>();
    for (const template of manifest.templates) {
        if (roles.has(template.role)) fail('duplicate_template_role'); roles.add(template.role);
        const ref = sitePageReferenceSchema.safeParse((template.layout.root as Record<string, unknown> | undefined)?.siteConfiguration);
        if (!ref.success || ref.data.role !== template.role) fail('template_role_mismatch');
        if (template.role === 'city') fail('template_role_not_supported');
        try {
            const queries: string[] = directoryLayoutQueries(template.layout as unknown as PageLayoutData).map(q => q.binding.queryId);
            const expected = template.role === 'editorial' ? ['directory.page.detail'] : template.role === 'article-index' ? ['directory.article.list']
                : ['institution', 'program', 'article'].includes(template.role) ? [`directory.${template.role}.detail`]
                : template.role === 'directory' ? [...(populations.get('institutions') ? ['directory.institution.list'] : []), ...(populations.get('programs') ? ['directory.program.list'] : [])] : [];
            if (expected.some(query => !queries.includes(query))) fail('template_query_missing');
        } catch { fail('template_query_invalid'); }
    }
    for (const [role, collection] of [['directory', 'institutions'], ['directory', 'programs'], ['institution', 'institutions'],
        ['program', 'programs'], ['article-index', 'articles'], ['article', 'articles'], ['editorial','pages']])
        if (populations.get(collection!) && !roles.has(role!)) fail('missing_template_role');
    const approvalKeys=new Set<string>();
    for(const ref of manifest.approvals??[]){const key=JSON.stringify([ref.contentRole,ref.id]);
        if(approvalKeys.has(key) || !manifest.index.some(row=>row.collection===(ref.contentRole==='page'?'pages':'articles') && row.id===ref.id && row.revision===ref.revision))fail('invalid_editorial_approval');
        approvalKeys.add(key);
    }
});
export type SitePublicationManifest = z.infer<typeof sitePublicationManifestSchema>;
type Header = Pick<SitePublicationManifest, 'configurationRevision' | 'configuration' | 'templates'|'staticPages'|'approvals'|'redirects'>;
type Records = Record<'institutions'|'programs'|'cities'|'articles', unknown[]> & {pages?:unknown[]};
const recordsInput = z.object({ cities: z.array(z.unknown()).max(20000), institutions: z.array(z.unknown()).max(20000),
    programs: z.array(z.unknown()).max(20000), articles: z.array(z.unknown()).max(20000), pages:z.array(z.unknown()).max(20000).default([]) }).strict();

function indexChunk(chunk: PublicationChunk, reference: PublicationChunkReference) {
    return chunk.records.map((record, position) => ({ collection: chunk.collection, id: record.id, title: record.title,
        ...('revision' in record?{revision:record.revision}:{}),
        ...('originalPath' in record ? { originalPath: record.originalPath } : {}),
        ...('cityId' in record ? { parentId: record.cityId } : 'institutionId' in record ? { parentId: record.institutionId } : {}),
        chunkHash: reference.hash, position }));
}

export class SitePublicationManifestStore {
    private chunks: SitePublicationChunkStore;
    constructor(private db: DbRunner, private tenant: string) { this.chunks = new SitePublicationChunkStore(db, tenant); }
    /** Layout-only derivative: preserve exact immutable content/index/approval/redirect references. */
    async prepareLayouts(baseHash:string,layouts:Pick<SitePublicationManifest,'templates'|'staticPages'>,now:string):Promise<string>{
        const base=await this.get(baseHash);if(!base)throw Error('publication_manifest_unavailable');await this.verify(base);
        const manifest=sitePublicationManifestSchema.parse({...base,templates:layouts.templates,staticPages:layouts.staticPages}),hash=await publicationHash(manifest);
        const changed=await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',[this.tenant,`site_publication:manifest:v2:${hash}`,stableStringify(manifest),now]);
        if(changed!==0&&changed!==1||!await this.get(hash))throw Error('publication_manifest_unavailable');return hash;
    }
    async prepare(header: Header, records: Records, now: string): Promise<string> {
        const input = recordsInput.parse(records);
        const packed = (['cities', 'institutions', 'programs', 'articles','pages'] as const).flatMap(collection => packPublicationChunks(collection, input[collection]));
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
