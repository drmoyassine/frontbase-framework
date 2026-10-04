import { z } from 'zod';

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
const fields = z.object(Object.fromEntries(directoryFieldNames.map(k => [k, identifier])) as Record<typeof directoryFieldNames[number], typeof identifier>).strict();
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

export function emptyDirectoryConfiguration(): DirectoryConfiguration {
    const empty = () => ({ table: '', fields: Object.fromEntries(directoryFieldNames.map(f => [f, ''])) as DirectoryConfiguration['collections']['institution']['fields'], scope: { field: '', value: '' } });
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
    return missing;
}
