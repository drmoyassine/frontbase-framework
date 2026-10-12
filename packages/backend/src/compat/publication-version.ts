import type { SitePublicationArtifact } from '@frontbase/edge-core/directory/publication';
import type { SitePublicationManifest } from './site-publication-manifest.js';
export type PublicationVersion = SitePublicationArtifact | SitePublicationManifest;
export function publicationRows(version:PublicationVersion) {
    if(version.schemaVersion===1)return {...version.records,pages:[] as {id:string|number;title:string;originalPath:string}[]};
    const entries=(collection:string)=>version.index.filter(row=>row.collection===collection);
    return {institutions:entries('institutions'),programs:entries('programs'),cities:entries('cities'),articles:entries('articles'),pages:entries('pages')};
}
export function publicationPaths(version:PublicationVersion):string[]{
    const rows=publicationRows(version);
    const directory=version.schemaVersion===1?version.templates.some(page=>page.role==='directory'):!!(rows.institutions.length || rows.programs.length);
    const blog=version.schemaVersion===1?version.templates.some(page=>page.role==='article-index'):!!rows.articles.length;
    return [...(directory?[version.configuration.routes.directory]:[]),...(blog?[version.configuration.routes.blog]:[]),
        ...[...rows.institutions,...rows.programs,...rows.articles,...rows.pages].map(row=>row.originalPath!),
        ...(version.schemaVersion===2?(version.staticPages??[]).map(page=>page.originalPath):[])];
}
