import type { DbRunner } from '@frontbase/edge-infra';
import { sitePublicationArtifactSchema, sitePublicationPointerSchema } from '@frontbase/edge-core/directory/publication';
import { publicationHash } from './site-publication-store.js';
import type { NamespacePublicPath } from './route-namespace-audit.js';

/** Query-only, owner-scoped active capture. Never consults connected providers. */
export async function captureRouteInventory(db: Pick<DbRunner, 'query'>, owner: string) {
    if (!owner || owner.length > 256) throw new Error('capture_inventory_unavailable');
    async function read(key: string, max: number): Promise<string | null> {
        const rows = await db.query('SELECT tenant_slug, key, value FROM settings WHERE tenant_slug = ? AND key = ? LIMIT 2', [owner, key]);
        if (!rows.length) return null;
        if (rows.length !== 1 || rows[0]!.tenant_slug !== owner || rows[0]!.key !== key
            || typeof rows[0]!.value !== 'string' || (rows[0]!.value as string).length > max
            || new TextEncoder().encode(rows[0]!.value as string).byteLength > max) throw new Error('capture_inventory_unavailable');
        return rows[0]!.value as string;
    }
    const raw = await read('site_publication:active:v1', 1024);
    if (raw === null) return { identity: null, paths: [] as NamespacePublicPath[] };
    const pointer = sitePublicationPointerSchema.parse(JSON.parse(raw));
    const capture = await read(`site_publication:v1:${pointer.hash}`, 1024 * 1024);
    if (capture === null) throw new Error('capture_inventory_unavailable');
    const artifact = sitePublicationArtifactSchema.parse(JSON.parse(capture));
    if (await publicationHash(artifact) !== pointer.hash) throw new Error('capture_inventory_unavailable');
    const paths: NamespacePublicPath[] = [];
    if (artifact.records.institutions.length || artifact.records.programs.length)
        paths.push({ source: 'directory', id: 'directory', path: artifact.configuration.routes.directory });
    if (artifact.records.articles.length) paths.push({ source: 'blog', id: 'blog', path: artifact.configuration.routes.blog });
    for (const [source, rows] of [['institution', artifact.records.institutions], ['program', artifact.records.programs], ['article', artifact.records.articles]] as const)
        for (const row of rows) paths.push({ source, id: String(row.id), path: row.originalPath });
    return { identity: pointer, paths };
}
