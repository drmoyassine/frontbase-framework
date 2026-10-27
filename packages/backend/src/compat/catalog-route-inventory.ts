import { directoryConfigurationSchema, directoryConfigurationReadiness, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { directoryOriginalPath } from '@frontbase/compiler/queries/directory';

const roles = ['institution', 'program', 'article'] as const;
type Problem = 'missing_original_path' | 'invalid_original_path' | 'browser_path_changes' | 'missing_scoped_parent';
export interface CatalogRouteRecord {
    source: typeof roles[number]; id: string; path: string | null; problems: Problem[];
}

/** Internal read-only inventory. Caller supplies an already owner-resolved datasource;
 * this helper does not authenticate/resolve it or certify a stable source snapshot. */
export async function catalogRouteInventory(input: DirectoryConfiguration, owner: string,
    principal: { tenant: string; user: { id: string } | null }, dialect: 'postgres' | 'sqlite',
    query: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>) {
    if (!owner || owner.length > 256 || principal.tenant !== owner || !principal.user?.id)
        throw new Error('catalog_inventory_principal_required');
    const c = directoryConfigurationSchema.parse(input);
    if (directoryConfigurationReadiness(c).length) throw new Error('catalog_inventory_configuration_incomplete');
    const quote = (name: string) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('catalog_inventory_mapping_invalid');
        return `"${name}"`;
    };
    const records: CatalogRouteRecord[] = [];
    const configuredRoles: typeof roles[number][] = [];
    for (const role of roles) {
        const m = c.collections[role];
        if (role === 'article' && !m.table) continue;
        configuredRoles.push(role);
        const values: unknown[] = [];
        const bind = (v: unknown) => { values.push(v); return dialect === 'postgres' ? `$${values.length}` : '?'; };
        const field = (alias: string, name: string) => `${alias}.${quote(name)}`;
        const scoped = (alias: string, mapping: typeof m) => `${field(alias, mapping.scope.field)} = ${bind(mapping.scope.value)}`;
        const city = c.collections.city, institution = c.collections.institution;
        const cityExists = (alias: string) => `EXISTS (SELECT 1 FROM ${quote(city.table)} dc WHERE ${field('dc', city.fields.id)} = ${field(alias, institution.fields.cityId)} AND ${scoped('dc', city)})`;
        // Relationship failures are selected evidence, never WHERE exclusions.
        const parent = role === 'institution' ? cityExists('d') : role === 'program'
            ? `EXISTS (SELECT 1 FROM ${quote(institution.table)} di WHERE ${field('di', institution.fields.id)} = ${field('d', m.fields.institutionId)} AND ${scoped('di', institution)} AND ${cityExists('di')})` : '1';
        const projection = [`${field('d', m.fields.id)} AS "id"`, `${field('d', m.fields.originalPath)} AS "originalPath"`,
            `${field('d', m.scope.field)} AS "scopeValue"`, `${parent} AS "scopedParent"`];
        const where = [scoped('d', m)];
        if (role === 'article') {
            projection.push(`${field('d', m.fields.contentRole)} AS "contentRole"`, `${field('d', m.fields.sourceOrigin)} AS "sourceOrigin"`);
            where.push(`${field('d', m.fields.contentRole)} = ${bind('article')}`, `${field('d', m.fields.sourceOrigin)} = ${bind(c.site.origin)}`);
        }
        const rows = await query(`SELECT ${projection.join(', ')} FROM ${quote(m.table)} d WHERE ${where.join(' AND ')} ORDER BY ${field('d', m.fields.id)} LIMIT ${bind(1001)}`, values);
        if (records.length + rows.length > 1000) throw new Error('catalog_inventory_overflow');
        const ids = new Set<string>();
        for (const row of rows) {
            if (row.scopeValue !== m.scope.value || role === 'article' && (row.contentRole !== 'article' || row.sourceOrigin !== c.site.origin))
                throw new Error('catalog_inventory_scope_mismatch');
            const validId = typeof row.id === 'number' ? Number.isSafeInteger(row.id) && row.id > 0
                : typeof row.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9/_-]{0,127}$/.test(row.id);
            if (!validId || ids.has(String(row.id))) throw new Error('catalog_inventory_identity_invalid');
            ids.add(String(row.id));
            if (![true, false, 0, 1].includes(row.scopedParent as boolean | number)) throw new Error('catalog_inventory_relationship_invalid');
            const problems: Problem[] = [];
            const missing = row.originalPath === null || row.originalPath === undefined || row.originalPath === '';
            const candidate = typeof row.originalPath === 'string' && row.originalPath.length <= 640
                ? directoryOriginalPath(row.originalPath, c.site.origin) : null;
            // URL parsing must not silently repair an absolute source spelling either.
            const path = candidate !== null && (String(row.originalPath).startsWith('/') || row.originalPath === c.site.origin + candidate)
                ? candidate : null;
            if (missing) problems.push('missing_original_path');
            else if (path === null) problems.push('invalid_original_path');
            else if (new URL(path, 'https://inventory.invalid').pathname !== path) problems.push('browser_path_changes');
            if (!row.scopedParent) problems.push('missing_scoped_parent');
            records.push({ source: role, id: String(row.id), path, problems });
        }
    }
    return { coverage: 'configured-source-catalog' as const, stableSnapshotVerified: false as const,
        publicationAvailable: false as const, configuredRoles, records };
}
