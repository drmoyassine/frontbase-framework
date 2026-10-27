import type {DbRunner} from '@frontbase/edge-infra';
import type {TemplatePolicy} from '@frontbase/edge-core/template-policy';
import {PagesStore} from './pages-store.js';
import {SitePublicationStore} from './site-publication-store.js';
import {templateUrlSettings} from './template-policy.js';
import {resolvePublicationVersionPage} from './site-publication-runtime.js';
import {publishedLiveQuery} from './published-live-query.js';
import {localizedListRequest} from './translation-homepage-serving.js';
import {freshLocalizedIndexTitles} from './site-publication-chunk-queries.js';

/** Administrator-only draft preview through the actual publication renderer/adapters.
 * No activation, source writes, model calls or executable URLs from request input. */
export async function previewTemplateUrl(db:DbRunner,owner:string,pageId:string,input:{revision:string;policy:TemplatePolicy;identity:string;locale:string},request:Request,execute:(request:Request)=>Response|Promise<Response>){
    const current=await templateUrlSettings(db,owner,pageId);if(current.revision!==input.revision)throw Error('template_changed');
    const record=current.records.find(row=>row.identity===input.identity);if(!record)throw Error('record_unavailable');
    const active=await new SitePublicationStore(db,owner).activeVersion();if(active?.artifact.schemaVersion!==2)throw Error('publication_required');
    const page=await new PagesStore(db,owner).get(pageId);if(!page||page.content_hash!==input.revision)throw Error('template_changed');
    const artifact=structuredClone(active.artifact),template=artifact.templates.find(template=>template.pageId===pageId);if(!template)throw Error('template_unavailable');
    const layout=JSON.parse(page.layout_data);layout.root={...layout.root,templatePolicy:input.policy};template.layout=layout;
    const live=publishedLiveQuery(execute),localized=input.locale!==current.locale?await localizedListRequest(db,owner,'/'+input.locale+record.path,live):null;
    const plan=localized?.catalog?{catalog:localized.catalog,titles:freshLocalizedIndexTitles(localized.catalog,new Map(artifact.index.map(row=>[`${row.collection}:${row.id}`,row.title])))}:undefined;
    const result=await resolvePublicationVersionPage(artifact,active.pointer.hash,owner,db,new Request(new URL(record.path,request.url),{headers:request.headers}),null,live,plan,input.locale);
    if(!result)throw Error('preview_unavailable');
    return {title:result.page.title,description:result.page.description??'',image:result.document.openGraph?.image??'',socialTitle:result.document.openGraph?.title??'',socialDescription:result.document.openGraph?.description??'',canonical:new URL(input.locale===current.locale?record.path:'/'+input.locale+record.path,artifact.configuration.site.origin).href,locale:input.locale};
}
