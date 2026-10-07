import { z } from 'zod';
import { siteBindingsSchema, validateSiteBinding } from './bindings.js';
export { directoryQueryBindingSchema, directoryRecordBindingSchema, directoryLayoutQueries, projectDirectoryRecords, type DirectoryQueryBinding } from './bindings.js';
export { editorialBodySchema, parseEditorialBody, projectEditorialBody } from './editorial.js';

/** Data-only authoring contract. No credentials, SQL, executable templates or host adapters. */
const identifier = z.string().max(63).regex(/^(?:[A-Za-z_][A-Za-z0-9_]*)?$/);
const label = z.string().max(200).refine(v => !/[\x00-\x1f]/.test(v));
const localPath = z.string().max(400).refine(value => {
    if (!value) return true; // incomplete drafts can be saved
    try {
        const decoded = decodeURIComponent(value);
        return value.startsWith('/') && !value.startsWith('//') && !/[\\?#{}\s]/.test(value)
            && !decoded.startsWith('//') && !/[\\?#{}\x00-\x20]/.test(decoded) && !decoded.split('/').some(p => p === '.' || p === '..');
    } catch { return false; }
}, 'Use a local path without traversal or query parameters');
const origin = z.string().max(240).refine(value => {
    if (!value) return true;
    try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/';
    } catch { return false; }
}, 'Use an HTTPS site origin');

export const directoryRoles = ['institution', 'program', 'city', 'article', 'pathway'] as const;
export type DirectoryRole = typeof directoryRoles[number];
export const directoryFieldNames = ['id', 'title', 'originalPath', 'summary', 'body', 'cover', 'logo', 'gallery', 'cityId', 'institutionId'] as const;
export const directoryEditorialFields = ['contentRole', 'sourceOrigin', 'byline', 'publishedAt', 'coverAlt'] as const;
const fields = z.object(Object.fromEntries(directoryFieldNames.map(k => [k, identifier])) as Record<typeof directoryFieldNames[number], typeof identifier>)
    .extend({ coverAlt: identifier.default(''), contentRole: identifier.default(''), sourceOrigin: identifier.default(''), byline: identifier.default(''), publishedAt: identifier.default('') }).strict();
const collection = z.object({
    table: identifier,
    fields,
    scope: z.object({ field: identifier, value: z.union([z.string().max(160), z.number().finite()]) }).strict(),
}).strict();

export const directoryConfigurationSchema = z.object({
    version: z.literal(1), template: z.literal('education-directory'),
    site: z.object({ name: label, destination: label, origin, locale: z.string().max(35).regex(/^(?:[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)?$/) }).strict(),
    datasourceId: z.string().max(128).regex(/^[A-Za-z0-9_-]*$/),
    collections: z.object({ institution: collection, program: collection, city: collection, article: collection, pathway: collection }).strict(),
    browsing: z.object({ defaultCollection: z.enum(directoryRoles), pageSize: z.union([z.literal(12), z.literal(24), z.literal(48)]),
        search: z.boolean(), cityFilter: z.boolean(), degreeFilter: z.boolean(), intakeFilter: z.boolean(), sort: z.enum(['name', 'latest']) }).strict(),
    routes: z.object({ directory: localPath, blog: localPath, preserveOriginalPaths: z.literal(true) }).strict(),
    contacts: z.object({ email: z.union([z.literal(''), z.string().max(254).regex(/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]),
        whatsapp: z.string().max(40).regex(/^(?:https:\/\/wa\.me\/[0-9]+)?$/) }).strict(),
}).strict();

export type DirectoryConfiguration = z.infer<typeof directoryConfigurationSchema>;

/** Shared authoring only. No page/runtime activation or secrets in this record. */
export const siteConfigurationDraftSchema = z.object({
    schemaVersion: z.literal(1),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    configuration: directoryConfigurationSchema,
}).strict();
export const siteConfigurationSaveSchema = z.object({
    schemaVersion: z.literal(1),
    expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
    configuration: directoryConfigurationSchema,
}).strict();
export type SiteConfigurationDraft = z.infer<typeof siteConfigurationDraftSchema>;

export const sitePageRoles = ['directory', 'institution', 'program', 'city', 'article-index', 'article', 'editorial'] as const;
export const sitePageReferenceSchema = z.object({ version: z.literal(1), role: z.enum(sitePageRoles) }).strict();
export type SitePageReference = z.infer<typeof sitePageReferenceSchema>;
export function hasSitePageReference(layout: unknown): boolean {
    try { const value = typeof layout === 'string' ? JSON.parse(layout) : layout;
        return value?.root?.siteConfiguration !== undefined;
    } catch { return false; }
}

/** Compare validated copies without relying on object-key insertion order. */
export function directoryCopiesMatch(a: unknown, b: unknown): boolean {
    const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    const left = directoryConfigurationSchema.safeParse(a), right = directoryConfigurationSchema.safeParse(b);
    return left.success && right.success && canonical(left.data) === canonical(right.data);
}

/** Display-only projection; caller keeps the original authoring layout for saving. */
export function projectSharedDirectoryPreview<T>(layout: T, configuration: DirectoryConfiguration): T {
    const config = directoryConfigurationSchema.parse(configuration);
    const values = { 'site.name': config.site.name, 'site.destination': config.site.destination,
        'contacts.email': config.contacts.email ? `mailto:${config.contacts.email}` : '',
        'contacts.whatsapp': config.contacts.whatsapp, 'routes.directory': config.routes.directory };
    const walk = (node: any): any => {
        if (!node || typeof node !== 'object') return node;
        const props = { ...node.props };
        if (props.siteBindings !== undefined) {
            const binding = siteBindingsSchema.parse(props.siteBindings);
            validateSiteBinding(node);
            if (binding.text) props.text = values[binding.text].replace(/\{(?=[{%])/g, '{\u200b');
            if (binding.href) props.href = values[binding.href];
            if (binding.hideWhenEmpty && !props.href) return { id: node.id, type: 'Container', props: {}, styles: { display: 'none' }, children: [] };
        }
        return { ...node, props, ...(Array.isArray(node.children) ? { children: node.children.map(walk) } : {}) };
    };
    const value = layout as { content?: unknown[] };
    return { ...value, content: Array.isArray(value.content) ? value.content.map(walk) : [] } as T;
}

export function emptyDirectoryConfiguration(): DirectoryConfiguration {
    const empty = () => ({ table: '', fields: Object.fromEntries([...directoryFieldNames, ...directoryEditorialFields].map(f => [f, ''])) as DirectoryConfiguration['collections']['institution']['fields'], scope: { field: '', value: '' } });
    return { version: 1, template: 'education-directory', site: { name: '', destination: '', origin: '', locale: 'en' }, datasourceId: '',
        collections: { institution: empty(), program: empty(), city: empty(), article: empty(), pathway: empty() },
        browsing: { defaultCollection: 'institution', pageSize: 12, search: true, cityFilter: true, degreeFilter: true, intakeFilter: true, sort: 'name' },
        routes: { directory: '/explore/', blog: '/blog/', preserveOriginalPaths: true }, contacts: { email: '', whatsapp: '' } };
}

export function directoryConfigurationIssues(value: unknown): string[] {
    const parsed = directoryConfigurationSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map(i => i.path.join('.') || 'configuration');
}

/** Completeness is distinct from validation: incomplete authoring drafts remain saveable. */
export function directoryConfigurationReadiness(value: unknown): string[] {
    const parsed = directoryConfigurationSchema.safeParse(value);
    if (!parsed.success) return directoryConfigurationIssues(value);
    const c = parsed.data;
    const missing: string[] = [];
    for (const key of ['name', 'destination', 'origin'] as const) if (!c.site[key]) missing.push(`site.${key}`);
    if (!c.datasourceId) missing.push('datasourceId');
    if (!c.routes.directory) missing.push('routes.directory');
    for (const role of ['institution', 'program', 'city'] as const) {
        const r = c.collections[role];
        for (const key of ['id', 'title'] as const) if (!r.fields[key]) missing.push(`collections.${role}.fields.${key}`);
        if (role !== 'city' && !r.fields.originalPath) missing.push(`collections.${role}.fields.originalPath`);
        if (!r.table) missing.push(`collections.${role}.table`);
        if (!r.scope.field || r.scope.value === '') missing.push(`collections.${role}.scope`);
    }
    if (!c.collections.program.fields.institutionId) missing.push('collections.program.fields.institutionId');
    if (!c.collections.institution.fields.cityId) missing.push('collections.institution.fields.cityId');
    for (const role of ['article', 'pathway'] as const) if (c.collections[role].table) {
        const r = c.collections[role];
        if (!r.fields.id || !r.fields.title || !r.fields.originalPath || !r.scope.field || r.scope.value === '') missing.push(`collections.${role}`);
    }
    if (c.collections.article.table && (!c.collections.article.fields.contentRole || !c.collections.article.fields.sourceOrigin || !c.collections.article.fields.body)) missing.push('collections.article.editorial');
    return missing;
}
export { editorialCoverUrlSchema, editorialEditSchema, editorialReadRequestSchema, editorialSaveRequestSchema, editorialDocumentSchema, editorialApprovalRequestSchema, editorialReviewChecksSchema, type EditorialDocument, type EditorialEdit } from './editorial.js';
