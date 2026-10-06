import { z } from 'zod';
import { directoryConfigurationSchema, directoryConfigurationReadiness, parseEditorialBody, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { defineQueries, type QueryRegistry } from './defineQueries.js';

const roles = ['institution', 'program', 'city', 'article'] as const;
const localPath = z.string().max(400).refine(v => {
    try { const d = decodeURIComponent(v); return v.startsWith('/') && !d.startsWith('//') && !/[\\?#\s\x00-\x20]/.test(d) && !d.split('/').some(p => p === '.' || p === '..'); }
    catch { return false; }
});
export const directoryPreviewSchema = z.object({
    expectedRevision: z.number().int().positive(), role: z.enum(roles), mode: z.enum(['list', 'detail']),
    params: z.object({ q: z.string().trim().max(100).optional(), offset: z.number().int().min(0).max(10000).optional(),
        limit: z.number().int().min(1).max(48).optional(), institutionId: z.union([z.string().max(128).min(1), z.number().int().positive()]).optional(),
        path: localPath.optional() }).strict().default({}),
}).strict();

/** Original identity only: no slug generation, foreign origins or traversal. */
export function directoryOriginalPath(value: unknown, origin: string): string | null {
    if (typeof value !== 'string' || !value) return null;
    try {
        const path = value.startsWith('/') ? value : (() => { const u = new URL(value); return u.origin === origin && !u.search && !u.hash && !u.username && !u.password ? u.pathname : ''; })();
        return localPath.safeParse(path).success ? path : null;
    } catch { return null; }
}

/** Registered, server-only authoring queries. Not a public approval/activation. */
export function createDirectoryQueries(input: DirectoryConfiguration, owner: string, dialect: 'postgres' | 'sqlite',
    query: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>) : QueryRegistry {
    const c = directoryConfigurationSchema.parse(input);
    if (!owner || directoryConfigurationReadiness(c).length) throw new Error('directory_configuration_incomplete');
    const quote = (name: string) => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('invalid_mapping'); return `"${name}"`; };
    const registry: QueryRegistry = {};
    for (const role of roles) for (const mode of ['list', 'detail'] as const) {
        if (role === 'city' && mode === 'detail') continue; // cities have no preserved-path mapping yet
        const mapping = c.collections[role];
        if (role === 'article' && !mapping.table) continue;
        const paramsSchema = directoryPreviewSchema.shape.params.refine(p => mode === 'detail'
            ? !!p.path && p.q === undefined && p.offset === undefined && p.limit === undefined && p.institutionId === undefined
            : p.path === undefined && (p.institutionId === undefined || role === 'program') && (p.limit ?? c.browsing.pageSize) <= c.browsing.pageSize);
        registry[`directory.${role}.${mode}`] = { scope: 'tenant', ttlSeconds: 0, params: paramsSchema,
            execute: async (raw, ctx) => {
                if (ctx.tenant !== owner || !ctx.user) throw new Error('principal_context_required');
                const p = paramsSchema.parse(raw);
                const values: unknown[] = []; const bind = (v: unknown) => { values.push(v); return dialect === 'postgres' ? `$${values.length}` : '?'; };
                const field = (alias: string, name: string) => `${alias}.${quote(name)}`;
                const scoped = (alias: string, m: typeof mapping) => `${field(alias, m.scope.field)} = ${bind(m.scope.value)}`;
                const city = c.collections.city, institution = c.collections.institution;
                const cityExists = (alias: string) => `EXISTS (SELECT 1 FROM ${quote(city.table)} dc WHERE ${field('dc', city.fields.id)} = ${field(alias, institution.fields.cityId)} AND ${scoped('dc', city)})`;
                const where = [scoped('d', mapping)];
                if (role === 'article') where.push(`${field('d', mapping.fields.contentRole)} = ${bind('article')}`, `${field('d', mapping.fields.sourceOrigin)} = ${bind(c.site.origin)}`);
                if (role === 'institution') where.push(cityExists('d'));
                if (role === 'program') where.push(`EXISTS (SELECT 1 FROM ${quote(institution.table)} di WHERE ${field('di', institution.fields.id)} = ${field('d', mapping.fields.institutionId)} AND ${scoped('di', institution)} AND ${cityExists('di')})`);
                if (p.institutionId !== undefined) where.push(`${field('d', mapping.fields.institutionId)} = ${bind(p.institutionId)}`);
                if (p.q) where.push(`LOWER(CAST(${field('d', mapping.fields.title)} AS TEXT)) LIKE ${bind('%' + p.q.toLowerCase().replace(/[!%_]/g, v => '!' + v) + '%')} ESCAPE '!'`);
                if (p.path) where.push(`(${field('d', mapping.fields.originalPath)} = ${bind(p.path)} OR ${field('d', mapping.fields.originalPath)} = ${bind(c.site.origin + p.path)})`);
                const selected = Object.entries(mapping.fields).filter(([key, value]) => value && !['contentRole','sourceOrigin'].includes(key) && (mode === 'detail' || !['body', 'gallery'].includes(key)));
                const projection = selected.map(([key, value]) => `${field('d', value)} AS ${quote(key)}`).join(', ');
                const rows = await query(`SELECT ${projection} FROM ${quote(mapping.table)} d WHERE ${where.join(' AND ')} ORDER BY ${field('d', mapping.fields.title)}, ${field('d', mapping.fields.id)} LIMIT ${bind(mode === 'detail' ? 2 : (p.limit ?? c.browsing.pageSize) + 1)} OFFSET ${bind(p.offset ?? 0)}`, values);
                if (mode === 'detail' && rows.length > 1) throw new Error('directory_path_ambiguous');
                // Enforce a narrow bounded projection even if a driver returns extra columns.
                return rows.slice(0, mode === 'detail' ? 1 : (p.limit ?? c.browsing.pageSize) + 1).map(row => Object.fromEntries(selected.map(([key]) => {
                    const v = row[key];
                    if (role === 'article' && key === 'body') return [key, parseEditorialBody(v)];
                    return [key, key === 'originalPath' ? directoryOriginalPath(v, c.site.origin) : typeof v === 'string' ? v.slice(0, key === 'body' ? 60000 : key === 'gallery' ? 12000 : key === 'summary' ? 1000 : 2048) : typeof v === 'number' && Number.isFinite(v) ? v : null];
                })));
            } };
    }
    return defineQueries(registry);
}
