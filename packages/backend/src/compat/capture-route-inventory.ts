import type { DbRunner } from '@frontbase/edge-infra';
import { sitePublicationArtifactSchema, sitePublicationPointerSchema } from '@frontbase/edge-core/directory/publication';
import { sitePublicationManifestSchema } from './site-publication-manifest.js';
import { publicationRows } from './publication-version.js';
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
    let capture = await read(`site_publication:v1:${pointer.hash}`, 1024 * 1024);
    const legacy=capture!==null;
    if(capture===null)capture=await read(`site_publication:manifest:v2:${pointer.hash}`,8*1024*1024);
    if (capture === null) throw new Error('capture_inventory_unavailable');
    const artifact = legacy?sitePublicationArtifactSchema.parse(JSON.parse(capture)):sitePublicationManifestSchema.parse(JSON.parse(capture));
    const records=publicationRows(artifact);
    if (await publicationHash(artifact) !== pointer.hash) throw new Error('capture_inventory_unavailable');
    const paths: NamespacePublicPath[] = [];
    if (records.institutions.length || records.programs.length)
        paths.push({ source: 'directory', id: 'directory', path: artifact.configuration.routes.directory });
    if (records.articles.length) paths.push({ source: 'blog', id: 'blog', path: artifact.configuration.routes.blog });
    for (const [source, rows] of [['institution', records.institutions], ['program', records.programs], ['article', records.articles]] as const)
        for (const row of rows) paths.push({ source, id: String(row.id), path: row.originalPath! });
    for(const row of records.pages)paths.push({source:'page',id:String(row.id),path:row.originalPath!});
    if(artifact.schemaVersion===2)for(const page of artifact.staticPages??[])paths.push({source:'template',id:page.pageId,path:page.originalPath});
    if(artifact.schemaVersion===2)for(const alias of artifact.redirects??[])paths.push({source:'template',id:`redirect:${alias.from}`,path:alias.from});
    return { identity: pointer, paths };
}
