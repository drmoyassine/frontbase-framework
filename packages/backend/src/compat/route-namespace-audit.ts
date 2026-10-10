import type { DbRunner } from '@frontbase/edge-infra';

/** Inspection only. This conservative grammar is not a public URL rewrite policy. */
export function inspectNamespacePath(path: string): 'supported' | 'reserved' | 'unsupported' {
    if (typeof path !== 'string' || path.length > 400) return 'unsupported';
    if (/^\/(?:api|admin|frontbase-admin|frontbase-setup|setup|builder|console|health|assets|react|static|sw|builder-sw|sitemap|robots)(?:\/|$)/i.test(path)
        || /^\/(?:sw\.js|builder-sw\.js|sitemap\.xml|robots\.txt|icon\.png)\/?$/i.test(path)) return 'reserved';
    return path === '/' || /^\/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)*\/?$/.test(path) ? 'supported' : 'unsupported';
}

type PublicSource = 'template' | 'directory' | 'blog' | 'institution' | 'program' | 'article';
export interface NamespacePublicPath { source: PublicSource; id: string; path: string; }
type Ref = { source: 'compat' | 'framework' | PublicSource; id: string; path: string; deleted: boolean };
type Issue = { code: 'unsupported_path' | 'reserved_path' | 'route_conflict' | 'potential_alias_conflict'; resources: Ref[] };
export type NamespaceAuditResult =
    | { status: 'unavailable'; code: 'namespace_unavailable' | 'namespace_changed' | 'namespace_too_large' | 'namespace_invalid'; installAvailable: false }
    | { status: 'clear' | 'conflicts'; issues: Issue[]; resourcesChecked: number; truncated: boolean; installAvailable: false };

const unavailable = (code: Extract<NamespaceAuditResult, { status: 'unavailable' }>['code']): NamespaceAuditResult => ({ status: 'unavailable', code, installAvailable: false });
const idValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9/_-]{0,199}$/.test(value);
const publicSources = new Set(['template', 'directory', 'blog', 'institution', 'program', 'article']);
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const stable = (value: Ref) => JSON.stringify([value.source, value.id, value.path, value.deleted]);

/**
 * Internal trusted-caller inspection. Owner MUST come from authenticated/host context;
 * publicPaths MUST be an owned projection, not unvalidated request data.
 * Two equal reads detect observed drift, not a coherent transaction or ABA safety.
 * Nothing returned here grants writer/installer admission.
 */
export async function auditRouteNamespace(db: Pick<DbRunner, 'query'>, owner: string,
    options: { includeFramework: boolean; publicPaths?: readonly NamespacePublicPath[] }): Promise<NamespaceAuditResult> {
    if (!owner || owner.length > 256 || typeof options?.includeFramework !== 'boolean') return unavailable('namespace_invalid');
    const publicPaths = options.publicPaths ?? [];
    if (!Array.isArray(publicPaths) || publicPaths.length > 1000) return unavailable('namespace_too_large');
    if (publicPaths.some(row => !row || !publicSources.has(row.source) || !idValid(row.id) || typeof row.path !== 'string' || row.path.length > 400)) return unavailable('namespace_invalid');
    // Copy trusted projection so caller mutation during awaits cannot change this run.
    const supplied = publicPaths.map(row => ({ source: row.source, id: row.id, path: row.path }));
    if (new Set(supplied.map(row => JSON.stringify([row.source, row.id]))).size !== supplied.length) return unavailable('namespace_invalid');
    const includeFramework = options.includeFramework;
    const read = async () => {
        const compat = await db.query('SELECT tenant_slug, id, slug, is_homepage, deleted_at FROM compat_pages WHERE tenant_slug = ? ORDER BY id LIMIT 1001', [owner]);
        const drafts = includeFramework ? await db.query('SELECT tenant_slug, slug FROM drafts WHERE tenant_slug = ? ORDER BY slug LIMIT 1001', [owner]) : [];
        const published = includeFramework ? await db.query('SELECT tenant_slug, slug FROM published_pages WHERE tenant_slug = ? ORDER BY slug LIMIT 1001', [owner]) : [];
        return { compat, drafts, published };
    };
    try {
        const before = await read();
        if (Object.values(before).some(rows => !Array.isArray(rows) || rows.length > 1000)) return unavailable('namespace_too_large');
        const all = [...before.compat, ...before.drafts, ...before.published];
        if (all.some(row => row.tenant_slug !== owner || typeof row.slug !== 'string' || row.slug.length > 400)) return unavailable('namespace_invalid');
        if (before.compat.some(row => !idValid(row.id) || ![0, 1].includes(row.is_homepage as number)
            || !(row.deleted_at === null || typeof row.deleted_at === 'string'))) return unavailable('namespace_invalid');
        if (new Set(before.compat.map(row => row.id)).size !== before.compat.length
            || [before.drafts, before.published].some(rows => new Set(rows.map(row => row.slug)).size !== rows.length)) return unavailable('namespace_invalid');
        const after = await read();
        if (JSON.stringify(before) !== JSON.stringify(after)) return unavailable('namespace_changed');
        const refs: Ref[] = [];
        const unsupportedStored = new Set<string>();
        for (const row of before.compat) {
            const slug = String(row.slug), deleted = row.deleted_at !== null;
            // Legacy resolver strips request boundary slashes. Stored boundary slashes
            // are not silently repaired into a different stored resource identity.
            const ref: Ref = { source: 'compat', id: String(row.id), path: slug.startsWith('/') ? slug : '/' + slug, deleted };
            refs.push(ref);
            if (!slug || slug.startsWith('/') || slug.endsWith('/')) unsupportedStored.add(stable(ref));
            if (row.is_homepage === 1) refs.push({ source: 'compat', id: String(row.id), path: '/', deleted });
        }
        // The two legacy tables share a slug-keyed logical resource. No other family
        // or same-content records are merged. These keys do not define rename identity.
        const framework = new Set([...before.drafts, ...before.published].map(row => String(row.slug)));
        for (const slug of framework) {
            if (!idValid(slug)) return unavailable('namespace_invalid');
            refs.push({ source: 'framework', id: slug, path: slug.startsWith('/') ? slug : '/' + slug, deleted: false });
        }
        for (const row of supplied) refs.push({ ...row, deleted: false });
        refs.sort((a, b) => order(stable(a), stable(b)));
        if (new Set(refs.map(stable)).size !== refs.length) return unavailable('namespace_invalid');
        const issues: Issue[] = [];
        const buckets = new Map<string, Ref[]>();
        for (const ref of refs) {
            const classification = unsupportedStored.has(stable(ref)) ? 'unsupported' : inspectNamespacePath(ref.path);
            // Do not echo unsupported paths (they may contain credentials/control text).
            if (classification !== 'supported') { issues.push({ code: classification === 'reserved' ? 'reserved_path' : 'unsupported_path', resources: [{ ...ref, path: '' }] }); continue; }
            const key = (ref.path.replace(/\/$/, '') || '/').toLowerCase();
            const bucket = buckets.get(key);
            if (bucket) bucket.push(ref); else buckets.set(key, [ref]);
        }
        for (const bucket of buckets.values()) {
            const logical = new Set(bucket.map(ref => JSON.stringify([ref.source, ref.id])));
            if (logical.size < 2) continue;
            const exactGroups = new Map<string, Ref[]>();
            for (const ref of bucket) {
                const group = exactGroups.get(ref.path);
                if (group) group.push(ref); else exactGroups.set(ref.path, [ref]);
            }
            for (const group of exactGroups.values()) {
                if (new Set(group.map(ref => JSON.stringify([ref.source, ref.id]))).size > 1) issues.push({ code: 'route_conflict', resources: group });
            }
            if (exactGroups.size > 1) issues.push({ code: 'potential_alias_conflict', resources: bucket });
        }
        issues.sort((a, b) => order(JSON.stringify(a), JSON.stringify(b)));
        // Always refuse on truncation; report size remains bounded even for one large bucket.
        const truncated = issues.length > 100 || issues.some(issue => issue.resources.length > 50);
        return { status: issues.length ? 'conflicts' : 'clear', issues: issues.slice(0, 100).map(issue => ({ ...issue, resources: issue.resources.slice(0, 50) })),
            resourcesChecked: refs.length, truncated, installAvailable: false };
    } catch { return unavailable('namespace_unavailable'); }
}
