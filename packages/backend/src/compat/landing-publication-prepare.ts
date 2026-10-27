import type { DbRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler/manifest';
import { readLandingSettings, type SiteConfigurationDraft } from '@frontbase/edge-core/directory/configuration';
import type { PageLayoutData } from '@frontbase/edge-core';
import { PagesStore } from './pages-store.js';
import { PageChangeStore } from './page-change-store.js';
import { SitePublicationManifestStore } from './site-publication-manifest.js';
import { SitePublicationReviewStore } from './site-publication-review-store.js';
import { verifyManifestEditorial } from './site-publication-approval-check.js';
import { SiteConfigurationStore } from './site-configuration-store.js';

/** Recompose only the saved home; borrow verified public records, never mutable sources. */
export async function prepareLandingFromCapture(db:DbRunner,owner:string,draft:SiteConfigurationDraft,input:{baseHash:string;homepageId:string;homepageStateHash:string},now:string){
    const store=new SitePublicationManifestStore(db,owner),base=await store.get(input.baseHash);
    if(!base || !await new SitePublicationReviewStore(db,owner).get(input.baseHash))throw Error('publication_review_required');
    if(base.configurationRevision!==draft.revision || stableStringify(base.configuration)!==stableStringify(draft.configuration))throw Error('publication_configuration_conflict');
    await store.verify(base);await verifyManifestEditorial(db,owner,base);
    const states=new PageChangeStore(db,owner),before=await states.state(input.homepageId);
    if(!before?.draft || before.hash!==input.homepageStateHash)throw Error('homepage_changed');
    const page=await new PagesStore(db,owner).get(input.homepageId);
    if(!page || page.deleted_at || !page.is_public || !page.is_homepage)throw Error('landing_homepage_required');
    const layout=JSON.parse(page.layout_data) as PageLayoutData;
    if(!readLandingSettings(layout) || layout.root?.siteConfiguration!==undefined || layout.root?.directoryConfiguration!==undefined)throw Error('landing_homepage_required');
    const after=await states.state(page.id);if(!after?.draft || after.hash!==before.hash)throw Error('homepage_changed');
    const records={institutions:[] as unknown[],programs:[] as unknown[],cities:[] as unknown[],articles:[] as unknown[],pages:[] as unknown[]};
    for(const ref of base.chunks){const chunk=await store.loadChunk(base,ref);records[chunk.collection].push(...chunk.records.filter(row=>chunk.collection!=='pages'||!('originalPath'in row)||row.originalPath!=='/'));}
    const staticPages=[...(base.staticPages??[]).filter(p=>p.originalPath!=='/'),{pageId:page.id,originalPath:'/',title:page.title??page.name,description:page.description??'',layout:layout as unknown as Record<string,unknown>}];
    if((await new SiteConfigurationStore(db,owner).get())?.revision!==draft.revision || (await states.state(page.id))?.hash!==before.hash)throw Error('homepage_changed');
    const replaced=base.index.filter(row=>row.collection==='pages' && row.originalPath==='/');
    const approvals=base.approvals?.filter(ref=>!(ref.contentRole==='page' && replaced.some(row=>row.id===ref.id && row.revision===ref.revision)));
    const hash=await store.prepare({configurationRevision:base.configurationRevision,configuration:base.configuration,templates:base.templates,staticPages,approvals,redirects:base.redirects},records,now);
    return {hash,artifact:(await store.get(hash))!,skippedUnmapped:{institutions:0,programs:0}};
}
