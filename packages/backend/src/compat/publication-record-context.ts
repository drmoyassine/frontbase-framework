import {templateRoute} from './template-route.js';
import type {SitePublicationManifest} from './site-publication-manifest.js';
import {readTemplatePolicy,resolveTemplatePolicy} from '@frontbase/edge-core/template-policy';

/** Route identity comes only from the active immutable catalog, never URL query parameters.
 * Existing hidden filters use these scalars for current-record and related-record bindings. */
export function publicationRecordContext(artifact:Pick<SitePublicationManifest,'index'|'templates'>&Partial<Pick<SitePublicationManifest,'configuration'>>,path:string,locale?:string):Record<string,unknown>{
    const route=templateRoute(artifact,path),entry=route?.entry;
    if(!entry||!route)return {};
    const page={recordId:route.recordId,parentId:route.parentId??null,collection:route.collection,attached:route.attached,path,
        ...(artifact.configuration?{siteName:artifact.configuration.site.name,locale:locale??artifact.configuration.site.locale}:{})};
    const root=route.template?.layout.root as Record<string,unknown>|undefined;
    if(root?.templatePolicy===undefined)return page;
    const settings=resolveTemplatePolicy(readTemplatePolicy(root),`${route.collection}:${route.recordId}`,locale??artifact.configuration?.site.locale??'en',{...entry,id:route.recordId},page).values;
    return {...page,settings};
}
