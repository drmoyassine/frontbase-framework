import { z } from 'zod';
import { directoryConfigurationSchema, directoryConfigurationReadiness, sitePageReferenceSchema } from './configuration.js';
import { directoryLayoutQueries } from './bindings.js';
import { editorialBodySchema, editorialCoverUrlSchema } from './editorial.js';
import type { PageLayoutData } from '../ssr/types.js';

/** Server-side capture contract. Never an input accepted from an anonymous browser. */
export const publicationPathSchema = z.string().min(1).max(400).refine(value => {
    try {
        const path = decodeURIComponent(value);
        return value.startsWith('/') && !path.startsWith('//') && !/[\\?#{}\x00-\x20]/.test(path)
            && !path.split('/').some(part => part === '.' || part === '..')
            && !/^\/(?:api|frontbase-admin|frontbase-setup|builder|static|console|admin|setup)(?:\/|$)/i.test(path) && !/^\/sw\.js\/?$/i.test(path);
    } catch { return false; }
});
const text = (max: number) => z.string().max(max).refine(v => !v.includes('\0'));
const id = z.union([z.string().min(1).max(128), z.number().int().positive()]);
const media = editorialCoverUrlSchema.nullable();
const base = z.object({ id, title: text(500).refine(v => v.trim().length > 0), originalPath: publicationPathSchema,
    summary: text(10000), cover: media, coverAlt: text(500), logo: media });
export const publicationInstitutionSchema = base.extend({ cityId: id, body: text(60000).nullable().default(null) }).strict();
export const publicationProgramSchema = base.extend({ institutionId: id, body: text(60000).nullable().default(null) }).strict();
export const publicationCitySchema = z.object({ id, title: text(500).refine(v => v.trim().length > 0) }).strict();
export const publicationArticleSchema = base.extend({ revision: z.number().int().positive(), body: editorialBodySchema,
    language: z.string().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/), byline: text(500).nullable(), publishedAt: text(100).nullable() }).strict();

const layout = z.record(z.unknown()).refine(value => {
    try {
        if (!Array.isArray(value.content) || JSON.stringify(value).length > 200000) return false;
        // Existing binding validation and renderer own layout semantics. No new renderer.
        directoryLayoutQueries(value as unknown as PageLayoutData);
        const inspect = (nodes: Record<string, unknown>[]) => {
            for (const node of nodes) {
                const props = node.props as Record<string, unknown> | undefined;
                if (node.binding || props?.binding || props?.dataRequest || props?.queryConfig) throw new Error('mutable_binding');
                if (Array.isArray(node.children)) inspect(node.children);
            }
        };
        inspect(value.content);
        return true;
    } catch { return false; }
});
const template = z.object({ pageId: z.string().uuid(), role: sitePageReferenceSchema.shape.role,
    title: text(500), description: text(10000), layout }).strict();

/** Small first-release slice. Full-catalog storage is a separate measured gate. */
export const sitePublicationArtifactSchema = z.object({
    schemaVersion: z.literal(1), runtimeVersion: z.literal('directory-snapshot-v1'),
    configurationRevision: z.number().int().positive(), configuration: directoryConfigurationSchema,
    templates: z.array(template).min(1).max(7),
    records: z.object({ institutions: z.array(publicationInstitutionSchema).max(48), programs: z.array(publicationProgramSchema).max(48),
        cities: z.array(publicationCitySchema).max(48), articles: z.array(publicationArticleSchema).max(48) }).strict(),
}).strict().superRefine((artifact, ctx) => {
    const error = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (directoryConfigurationReadiness(artifact.configuration).length) error('configuration_incomplete');
    if (new TextEncoder().encode(JSON.stringify(artifact)).byteLength > 1024 * 1024) error('publication_too_large');
    const roles = new Set<string>();
    for (const page of artifact.templates) {
        if (roles.has(page.role)) error('duplicate_template_role');
        roles.add(page.role);
        const ref = sitePageReferenceSchema.safeParse((page.layout.root as Record<string, unknown> | undefined)?.siteConfiguration);
        if (!ref.success || ref.data.role !== page.role) error('template_role_mismatch');
        try {
            const queries: string[] = directoryLayoutQueries(page.layout as unknown as PageLayoutData).map(query => query.binding.queryId);
            const expected = page.role === 'article-index' ? ['directory.article.list'] : ['institution','program','article'].includes(page.role) ? [`directory.${page.role}.detail`]
                : page.role === 'directory' ? [...(artifact.records.institutions.length ? ['directory.institution.list'] : []), ...(artifact.records.programs.length ? ['directory.program.list'] : [])] : [];
            if (expected.some(query => !queries.includes(query))) error('template_query_missing');
        } catch { error('template_query_invalid'); }
        if (page.role === 'city' || page.role === 'editorial') error('template_role_not_supported');
    }
    const { institutions, programs, cities, articles } = artifact.records;
    if (!(institutions.length + programs.length + articles.length)) error('publication_empty');
    const uniqueIds = (rows: { id: string | number }[]) => new Set(rows.map(row => String(row.id))).size === rows.length;
    if (![institutions, programs, cities, articles].every(uniqueIds)) error('duplicate_record_id');
    const institutionIds = new Set(institutions.map(row => String(row.id))), cityIds = new Set(cities.map(row => String(row.id)));
    if (institutions.some(row => !cityIds.has(String(row.cityId))) || programs.some(row => !institutionIds.has(String(row.institutionId)))) error('missing_parent');
    for (const [required, present] of [['directory', institutions.length + programs.length], ['institution', institutions.length], ['program', programs.length],
        ['article-index', articles.length], ['article', articles.length]] as const) if (present && !roles.has(required)) error('missing_template_role');
    const paths = [artifact.configuration.routes.directory, ...(articles.length ? [artifact.configuration.routes.blog] : []),
        ...institutions.map(row => row.originalPath), ...programs.map(row => row.originalPath), ...articles.map(row => row.originalPath)];
    const identities = paths.map(path => { try { return decodeURIComponent(path).replace(/\/$/, '') || '/'; } catch { return ''; } });
    if (paths.some(path => !publicationPathSchema.safeParse(path).success) || new Set(identities).size !== identities.length) error('route_collision');
});
export type SitePublicationArtifact = z.infer<typeof sitePublicationArtifactSchema>;
export const sitePublicationPointerSchema = z.object({ schemaVersion: z.literal(1), generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type SitePublicationPointer = z.infer<typeof sitePublicationPointerSchema>;
export const sitePublicationReviewChecksSchema = z.object({content:z.literal(true),media:z.literal(true),layout:z.literal(true),urls:z.literal(true),ctas:z.literal(true)}).strict();
export const sitePublicationReviewRequestSchema = z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),checks:sitePublicationReviewChecksSchema,note:z.string().trim().min(1).max(4000)}).strict();
export const sitePublicationReviewSchema = z.object({schemaVersion:z.literal(1),hash:z.string().regex(/^[a-f0-9]{64}$/),
    checks:sitePublicationReviewChecksSchema,note:z.string().trim().min(1).max(4000),reviewer:z.string().min(1).max(256),reviewedAt:z.string().datetime()}).strict();
