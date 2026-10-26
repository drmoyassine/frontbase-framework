import {templateRoute} from './template-route.js';
import type { DbRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler/manifest';
import { PagesStore } from './pages-store.js';
import { SitePublicationStore } from './site-publication-store.js';
import { SiteConfigurationStore } from './site-configuration-store.js';
import { publicationRows } from './publication-version.js';

export interface WorkspaceEntry {
    id: string; name: string; kind: 'page' | 'layout' | 'index' | 'collection-view';
    pageId?: string; role?: string; path?: string; paths?: string[]; serves?: number;
    publicationStatus: 'published' | 'changes-pending' | 'draft' | 'unknown';
    developmentOnly: boolean; source: 'saved' | 'derived';
    contentAction?: { datasourceId: string; table: string; keyColumn?:string; recordKey?:{column:string;value:string}; recordId?: string; contentRole?: 'page' | 'article' };
}

/** Authoring inventory, not a public catalog dump. Never reads connected data or credentials. */
export async function pagesWorkspace(db: DbRunner, owner: string) {
    if (!owner) throw Error('workspace_owner_required');
    const store = new SitePublicationStore(db, owner), active = await store.activeVersion();
    const configuration = (await new SiteConfigurationStore(db, owner).get())?.configuration ?? active?.artifact.configuration;
    const rows = active ? publicationRows(active.artifact) : undefined;
    const templates = active?.artifact.templates ?? [];
    const sharedChanged = active && configuration && stableStringify(configuration) !== stableStringify(active.artifact.configuration);
    const statics = active?.artifact.schemaVersion === 2 ? active.artifact.staticPages ?? [] : [];
    const rolePaths: Record<string, string[]> = {
        directory: configuration ? [configuration.routes.directory] : [],
        'article-index': configuration ? [configuration.routes.blog] : [],
        institution: rows?.institutions.map(r => r.originalPath!) ?? [],
        program: rows?.programs.map(r => r.originalPath!) ?? [],
        article: rows?.articles.map(r => r.originalPath!) ?? [],
        editorial: rows?.pages.map(r => r.originalPath!) ?? [],
    };
    if(active?.artifact.schemaVersion===2){for(const role of ['institution','program','article','editorial'])rolePaths[role]=active.artifact.index.filter(row=>row.originalPath&&templateRoute(active.artifact as any,row.originalPath)?.role===role).map(row=>row.originalPath!);}
    // URLs shown for published layouts must come from the published configuration.
    if (active) {
        rolePaths.directory = [active.artifact.configuration.routes.directory];
        rolePaths['article-index'] = [active.artifact.configuration.routes.blog];
    }
    const entries: WorkspaceEntry[] = [];
    const pages = new PagesStore(db, owner), saved = await pages.list();
    for (const page of saved) {
        let layout: any;
        try { layout = JSON.parse(page.layout_data); } catch { throw Error('workspace_layout_unavailable'); }
        const role = layout.root?.siteConfiguration?.role as string | undefined;
        const captured = templates.find(t => t.pageId === page.id) ?? statics.find(t => t.pageId === page.id);
        const paths = role ? rolePaths[role] ?? [] : [];
        const collection = role === 'institution' ? 'institution' : role === 'program' ? 'program' : role === 'article' || role === 'article-index' || role === 'editorial' ? 'article' : undefined;
        const mapping = collection && configuration?.collections[collection];
        const unchanged = captured && !!page.is_public && stableStringify(layout) === stableStringify(captured.layout)
            && (page.title ?? page.name) === captured.title && (page.description ?? '') === captured.description
            && (!('originalPath' in captured) || captured.originalPath === (page.is_homepage ? '/' : page.slug.startsWith('/') ? page.slug : '/' + page.slug));
        entries.push({ id: page.id, pageId: page.id, name: page.name,
            kind: role === 'directory' || role === 'article-index' ? 'page' : role ? 'layout' : 'page',
            ...(role ? { role, paths, serves: role === 'directory' ? (rows?.institutions.length ?? 0) + (rows?.programs.length ?? 0) : role === 'article-index' ? rows?.articles.length ?? 0 : paths.length,
                ...(paths.length === 1 ? { path: paths[0] } : {}) } : { path: page.is_homepage ? '/' : page.slug.startsWith('/') ? page.slug : '/' + page.slug }),
            publicationStatus: captured ? unchanged && (!(role || layout.root?.directoryLanding) || !sharedChanged) ? 'published' : 'changes-pending' : page.is_published ? 'published' : 'draft',
            developmentOnly: !captured && /^(Editorial migration review|Shared settings proof)/i.test(page.name), source: 'saved',
            ...(mapping?.table && configuration?.datasourceId ? { contentAction: { datasourceId: configuration.datasourceId, table: mapping.table, keyColumn:mapping.fields.id, ...(role === 'editorial' ? { contentRole: 'page' as const } : {}) } } : {}),
        });
    }
    // Ordinary captured pages are individually discoverable; article/program catalogs remain collection views.
    for (const row of rows?.pages ?? []) {
        if(active?.artifact.schemaVersion===2&&row.originalPath&&templateRoute(active.artifact,row.originalPath)?.attached)continue;
        if (entries.some(entry => entry.source === 'saved' && entry.kind === 'page' && entry.path === row.originalPath && statics.some(page => page.pageId === entry.id))) continue;
        const mapping = configuration?.collections.article;
        entries.push({ id: `record:page:${row.id}`, name: row.title, kind: 'page', role: 'editorial', path: row.originalPath,
            publicationStatus: 'published', developmentOnly: false, source: 'derived',
            ...(mapping?.table && configuration?.datasourceId ? { contentAction: { datasourceId: configuration.datasourceId, table: mapping.table, recordId: String(row.id), contentRole: 'page' as const } } : {}),
        });
    }
    const directory = entries.find(e => e.role === 'directory');
    if (directory && configuration) {
        const path = (active?.artifact.configuration ?? configuration).routes.directory;
        directory.paths = [path, path + '?type=institution', path + '?type=program'];
    }
    const after = await store.activeVersion();
    if (stableStringify(active?.pointer ?? null) !== stableStringify(after?.pointer ?? null)) throw Error('workspace_publication_changed');
    if (stableStringify(saved) !== stableStringify(await pages.list())) throw Error('workspace_pages_changed');
    return { schemaVersion: 1 as const, publication: active ? { hash: active.pointer.hash, generation: active.pointer.generation } : null, entries };
}
