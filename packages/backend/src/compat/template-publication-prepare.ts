import {stableStringify} from '@frontbase/compiler/manifest';
import {sitePageReferenceSchema,type SiteConfigurationDraft} from '@frontbase/edge-core/directory/configuration';
import type {DbRunner} from '@frontbase/edge-infra';
import {PagesStore} from './pages-store.js';
import {PageChangeStore} from './page-change-store.js';
import {SiteConfigurationStore} from './site-configuration-store.js';
import {SitePublicationManifestStore} from './site-publication-manifest.js';
import {SitePublicationReviewStore} from './site-publication-review-store.js';
import {verifyManifestEditorial} from './site-publication-approval-check.js';

/** Replace one saved template; preserve the reviewed source inventory byte-for-byte. */
export async function prepareTemplateFromCapture(db:DbRunner,owner:string,draft:SiteConfigurationDraft,input:{baseHash:string;pageId:string;stateHash:string},now:string){
    const store=new SitePublicationManifestStore(db,owner),base=await store.get(input.baseHash);
    if(!base || !await new SitePublicationReviewStore(db,owner).get(input.baseHash))throw Error('publication_review_required');
    if(base.configurationRevision!==draft.revision || stableStringify(base.configuration)!==stableStringify(draft.configuration))throw Error('publication_configuration_conflict');
    await store.verify(base);await verifyManifestEditorial(db,owner,base);
    const states=new PageChangeStore(db,owner),before=await states.state(input.pageId);
    if(!before?.draft || before.hash!==input.stateHash)throw Error('publication_template_changed');
    const page=await new PagesStore(db,owner).get(input.pageId),prior=base.templates.find(template=>template.pageId===input.pageId);
    if(!page || page.deleted_at || !page.is_public || !prior)throw Error('publication_template_unavailable');
    const layout=JSON.parse(page.layout_data),ref=sitePageReferenceSchema.parse(layout.root?.siteConfiguration);
    if(ref.role!==prior.role || layout.root.directoryConfiguration!==undefined)throw Error('publication_template_role_changed');
    if((await new SiteConfigurationStore(db,owner).get())?.revision!==draft.revision || (await states.state(page.id))?.hash!==before.hash)throw Error('publication_template_changed');
    const hash=await store.prepareLayouts(input.baseHash,{templates:base.templates.map(template=>template.pageId===page.id?{...template,title:page.title??page.name,description:page.description??'',layout}:template),staticPages:base.staticPages},now);
    if((await states.state(page.id))?.hash!==before.hash)throw Error('publication_template_changed');
    return {hash,artifact:(await store.get(hash))!,skippedUnmapped:{institutions:0,programs:0}};
}
