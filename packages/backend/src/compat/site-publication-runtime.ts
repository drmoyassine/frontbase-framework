import { buildSiteManifest } from '@frontbase/compiler/manifest';
import { createSnapshotDirectoryQueries } from '@frontbase/compiler/queries/directory';
import { directoryLayoutQueries, projectDirectoryRecords, projectSharedDirectoryPreview, projectDirectoryBrowsing, projectRelativeSiteLinks } from '@frontbase/edge-core/directory/configuration';
import type { PageEntry, EngineOptions } from '@frontbase/edge-core';
import { publicationPathSchema, type SitePublicationArtifact } from '@frontbase/edge-core/directory/publication';
import { sitePublicationArtifactSchema } from '@frontbase/edge-core/directory/publication';
import type { PageLayoutData } from '@frontbase/edge-core';
import type { DbRunner } from '@frontbase/edge-infra';
import type { PublicationVersion } from './publication-version.js';
import { resolveChunkPublicationPage } from './site-publication-chunk-runtime.js';
import {menuReferenceSchema,type VerifiedMenuAudience} from '@frontbase/edge-core/menus';
import {resolveAppMenuLayout} from './menus-runtime.js';
import {audienceConditionUser} from '@frontbase/edge-core';
import type {PublishedLiveQuery} from './publication-list-source.js';

export async function resolvePublicationVersionPage(input:PublicationVersion,hash:string,owner:string,db:DbRunner,request:Request,audience:VerifiedMenuAudience|null=null,liveQuery?:PublishedLiveQuery,localizedTitles?:Map<string,string>){
    const result=await(input.schemaVersion===1?resolveSitePublicationPage(input,hash,owner,request):resolveChunkPublicationPage(input,hash,owner,db,request,audienceConditionUser(audience),liveQuery,localizedTitles));
    if(!result)return null;
    const layout=result.page.layout as unknown as PageLayoutData;
    const reference=(layout.root as Record<string,unknown>)?.appMenus;
    if(reference===undefined)return result;
    const ref=menuReferenceSchema.parse(reference);
    const projected=await resolveAppMenuLayout(db,owner,layout,new URL(request.url).pathname,audience,input.configuration.site.name);
    return {...result,page:{...result.page,layout:projected},cacheKey:JSON.stringify([result.cacheKey,ref.hash,audience])};
}

/** Only explicit visitor-parameter failures get a client-error response. */
export class PublicationRequestError extends Error {
    constructor() { super('publication_params_invalid'); this.name = 'PublicationRequestError'; }
}

/** Resolve one captured version. No control/content DB or mutable draft access. */
export async function resolveSitePublicationPage(input: SitePublicationArtifact, hash: string, owner: string, request: Request): Promise<{ page: PageEntry; version: string; cacheKey: string; document: NonNullable<EngineOptions['document']> } | null> {
    if (!owner || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('publication_context_required');
    const artifact = sitePublicationArtifactSchema.parse(input), url = new URL(request.url), path = url.pathname;
    if (!publicationPathSchema.safeParse(path).success) return null;
    let role: string | undefined, row: Record<string, unknown> | undefined;
    if (path === artifact.configuration.routes.directory) role = 'directory';
    else if (path === artifact.configuration.routes.blog && artifact.records.articles.length) role = 'article-index';
    else for (const [candidate, rows] of [['institution', artifact.records.institutions], ['program', artifact.records.programs], ['article', artifact.records.articles]] as const) {
        const found = rows.find(record => record.originalPath === path);
        if (found) { role = candidate; row = found; break; }
    }
    if (!role) return null;
    const template = artifact.templates.find(page => page.role === role);
    if (!template) throw new Error('publication_template_unavailable');
    const queries = createSnapshotDirectoryQueries(artifact, owner), layout = template.layout as unknown as PageLayoutData;
    const records = new Map<string, Record<string, unknown>[]>();
    const inactive = new Set<string>();
    const normalized: Record<string, unknown> = {};
    // Only supported parameters enter the page/cache identity; refuse unknown duplicates.
    const allowed = role === 'directory' ? ['type', 'q', 'page', 'sort', 'match'] : role === 'article-index' ? ['q', 'page', 'sort', 'match'] : [];
    for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new PublicationRequestError();
    const type = url.searchParams.get('type') ?? artifact.configuration.browsing.defaultCollection;
    if (role === 'directory' && !['institution', 'program'].includes(type)) throw new PublicationRequestError();
    const listBinding=['directory','article-index'].includes(role)?directoryLayoutQueries(layout).find(query=>query.binding.queryId===`directory.${role==='article-index'?'article':type}.list`):undefined;
    const defaults=(listBinding?.binding.params??{}) as {sort?:string;match?:string;limit?:number};
    const pageSize=Math.min(defaults.limit??artifact.configuration.browsing.pageSize,artifact.configuration.browsing.pageSize);
    const sort=url.searchParams.get('sort')??defaults.sort??'title-asc',match=url.searchParams.get('match')??defaults.match??'contains';
    if(!['title-asc','title-desc'].includes(sort)||!['contains','startsWith','equals'].includes(match))throw new PublicationRequestError();
    const page = url.searchParams.get('page') ?? '1';
    if (!/^[1-9][0-9]{0,4}$/.test(page)) throw new PublicationRequestError();
    const offset = (Number(page) - 1) * pageSize;
    const search = (url.searchParams.get('q') ?? '').trim();
    if (offset > 10000 || search.length > 100) throw new PublicationRequestError();
    let hasNext = false;
    for (const query of directoryLayoutQueries(layout)) {
        const [_, collection, mode] = query.binding.queryId.split('.');
        if (role === 'directory' && mode === 'list' && ['institution','program'].includes(collection!) && collection !== type) { inactive.add(query.id); continue; }
        const parentPath = role === 'program' && collection === 'institution' && row
            ? artifact.records.institutions.find(parent => String(parent.id) === String(row!.institutionId))?.originalPath : undefined;
        const params: Record<string, unknown> = mode === 'detail' ? { path: parentPath ?? path } : { q: search, sort, match, offset, limit: pageSize,
            ...(role === 'institution' && collection === 'program' && row ? { institutionId: row.id } : {}) };
        // Never use authoring sample paths/filters for public records.
        const registered = queries[query.binding.queryId];
        if (!registered) throw new Error('publication_query_unavailable');
        const rows = await registered.execute(params, { tenant: owner, request });
        if ((role === 'directory' && collection === type || role === 'article-index' && collection === 'article') && mode === 'list') hasNext ||= rows.length > pageSize;
        records.set(query.id, rows.slice(0, mode === 'detail' ? 1 : pageSize));
        normalized[query.id] = params;
    }
    const prune = (nodes: PageLayoutData['content']): PageLayoutData['content'] => nodes.filter(node => !inactive.has(node.id)).map(node => ({ ...node, ...(node.children ? { children: prune(node.children) } : {}) }));
    let projected = projectDirectoryRecords(projectSharedDirectoryPreview({ ...layout, content: prune(layout.content) }, artifact.configuration), records, { locale: artifact.configuration.site.locale });
    if (role === 'directory' || role === 'article-index') projected = projectDirectoryBrowsing(projected, [{ path,
        collection: role === 'directory' ? type as 'institution' | 'program' : null,
        q: search, page: Number(page),sort:sort as 'title-asc'|'title-desc',match:match as 'contains'|'startsWith'|'equals',pageSize:pageSize,total:(role==='article-index'?artifact.records.articles:type==='program'?artifact.records.programs:artifact.records.institutions).filter(row=>!search || (match==='equals'?row.title.toLowerCase()===search.toLowerCase():match==='startsWith'?row.title.toLowerCase().startsWith(search.toLowerCase()):row.title.toLowerCase().includes(search.toLowerCase()))).length, searchEnabled: artifact.configuration.browsing.search,
        hasNext: hasNext && offset + pageSize <= 10000,
    }]);
    projected = projectRelativeSiteLinks(projected, artifact.configuration.site.origin);
    const title = typeof row?.title === 'string' ? row.title : template.title;
    const description = typeof row?.summary === 'string' ? row.summary : template.description;
    const manifest = buildSiteManifest({ pages: { [path]: { title, slug: path.replace(/^\//, ''), description, layout: projected as unknown as Record<string, unknown> } }, queries: {}, versionPrefix: hash });
    const canonicalUrl = new URL(path, artifact.configuration.site.origin).href;
    return { page: manifest.pages[path]!, version: manifest.version, cacheKey: JSON.stringify([owner, hash, path, normalized]),
        document: { faviconUrl: '', language: typeof row?.language === 'string' ? row.language : artifact.configuration.site.locale || 'en',
            canonicalUrl, robots: url.searchParams.size ? 'noindex, follow' : 'index, follow',
            openGraph: { title, description, url: canonicalUrl, type: role === 'article' ? 'article' : 'website', siteName: artifact.configuration.site.name,
                ...(typeof row?.cover === 'string' ? { image: row.cover, imageAlt: typeof row.coverAlt === 'string' ? row.coverAlt : '' } : {}) } } };
}
