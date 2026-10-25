import type {SitePublicationManifest} from './site-publication-manifest.js';

/** Route identity comes only from the active immutable catalog, never URL query parameters.
 * Existing hidden filters use these scalars for current-record and related-record bindings. */
export function publicationRecordContext(artifact:Pick<SitePublicationManifest,'index'>,path:string):Record<string,unknown>{
    const entry=artifact.index.find(row=>row.originalPath===path);
    return entry?{recordId:entry.id,parentId:entry.parentId??null,collection:entry.collection,path}:{};
}
