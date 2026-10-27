import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {materializeElementSettings,migrateExploreRepeater} from '@frontbase/edge-core/directory/configuration';
import {stableStringify} from '@frontbase/compiler/manifest';
import {SitePublicationStore} from './site-publication-store.js';
import {SitePublicationReviewStore} from './site-publication-review-store.js';
import {SitePublicationManifestStore} from './site-publication-manifest.js';

/** Deterministic conversion of the reviewed published layouts, never authoring drafts. */
export async function prepareElementSettingsCapture(db:DbRunner,owner:string,baseHash:string,now:string){
    const active=await new SitePublicationStore(db,owner).activeVersion();
    if(!active||active.pointer.hash!==baseHash||active.artifact.schemaVersion!==2||!await new SitePublicationReviewStore(db,owner).get(baseHash))throw Error('migration_base_changed');
    const base=active.artifact;
    const convert=(page:any)=>{
        let layout=page.layout as PageLayoutData;
        if(!layout.root?.directoryLanding&&!['directory','article-index'].includes(page.role))return page;
        layout=materializeElementSettings(layout,base.configuration);
        if(page.role==='directory'&&!(layout.root as any)?.standardListComponents)layout=migrateExploreRepeater(layout,baseHash,base.configuration);
        return {...page,layout};
    };
    const hash=await new SitePublicationManifestStore(db,owner).prepareLayouts(baseHash,{templates:base.templates.map(convert),staticPages:base.staticPages?.map(convert)},now);
    if(stableStringify((await new SitePublicationStore(db,owner).activeVersion())?.pointer)!==stableStringify(active.pointer))throw Error('migration_base_changed');
    return {hash,expected:active.pointer,previews:[{label:'Homepage',path:'/'},{label:'Explore',path:base.configuration.routes.directory},{label:'Blog',path:base.configuration.routes.blog}]};
}
export async function publishElementSettingsCapture(db:DbRunner,owner:string,baseHash:string,hash:string,reviewer:string,now:string){
    // Recreate and compare the exact deterministic candidate; arbitrary hashes,
    // draft edits, another owner's source and stale pointers cannot piggyback.
    const prepared=await prepareElementSettingsCapture(db,owner,baseHash,now);
    if(prepared.hash!==hash)throw Error('migration_preview_changed');
    const reviews=new SitePublicationReviewStore(db,owner),baseReview=await reviews.get(baseHash);
    if(!baseReview)throw Error('migration_review_required');
    if(!await reviews.get(hash))await reviews.approve({hash,checks:baseReview.checks,note:`Owner approved element-settings/Explore conversion from preview of reviewed base ${baseHash}. Existing records, media, URLs and menu snapshots retained; authoring draft edits excluded.`},reviewer,now);
    const pointer=await reviews.activate(hash,prepared.expected,now);if(!pointer)throw Error('migration_base_changed');
    return {pointer};
}
