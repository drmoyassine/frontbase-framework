import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import {stableStringify} from '@frontbase/compiler/manifest';
import {sitePublicationPointerSchema} from '@frontbase/edge-core/directory/publication';
import {MenusStore} from './menus-store.js';
import {MenusSnapshotStore} from './menus-snapshot.js';
import {SitePublicationStore} from './site-publication-store.js';
import {SitePublicationReviewStore} from './site-publication-review-store.js';
import {prepareMenuCapture} from './menus-capture.js';

const receiptSchema=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),revision:z.number().int().positive(),expected:sitePublicationPointerSchema,menusHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const key=(hash:string)=>`app_menus:preview:v1:${hash}`;
export async function previewSavedMenus(db:DbRunner,owner:string,revision:number,now:string){
    const active=await new SitePublicationStore(db,owner).activeVersion();if(!active)throw Error('menu_first_publication_required');
    const prepared=await prepareMenuCapture(db,owner,{baseHash:active.pointer.hash,expectedRevision:revision,removals:[]},now);
    const receipt=receiptSchema.parse({hash:prepared.hash,revision,expected:active.pointer,menusHash:prepared.menusHash});
    // Each exact candidate remembers the full pointer, including rollback generations.
    await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',[owner,key(prepared.hash),JSON.stringify(receipt),now]);
    const base=active.artifact;
    return{hash:receipt.hash,revision,previews:[{label:'Homepage',path:'/'},{label:'Directory',path:base.configuration.routes.directory},{label:'Blog',path:base.configuration.routes.blog}]};
}
export async function publishPreviewedMenus(db:DbRunner,owner:string,hash:string,revision:number,reviewer:string,now:string){
    const rows=await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',[owner,key(hash)]);
    if(!rows.length)throw Error('menu_preview_required');const receipt=receiptSchema.parse(JSON.parse(String(rows[0]!.value)));
    if(receipt.hash!==hash||receipt.revision!==revision||(await new MenusStore(db,owner).get()).revision!==revision)throw Error('menus_changed');
    const publication=new SitePublicationStore(db,owner),active=await publication.activeVersion();
    if(!active||stableStringify(active.pointer)!==stableStringify(receipt.expected))throw Error('menu_base_changed');
    // Re-prove that the target is exclusively this saved-menu change, not an arbitrary capture.
    const prepared=await prepareMenuCapture(db,owner,{baseHash:receipt.expected.hash,expectedRevision:revision,removals:[]},now);
    if(prepared.hash!==hash||prepared.menusHash!==receipt.menusHash)throw Error('menu_preview_required');
    const reviews=new SitePublicationReviewStore(db,owner),baseReview=await reviews.get(receipt.expected.hash);
    if(!baseReview)throw Error('publication_review_required');
    if(!await reviews.get(hash))await reviews.approve({hash,checks:baseReview.checks,note:`Owner approved saved menus revision ${revision} from preview. Existing content/media/URLs/CTAs retained from reviewed base ${receipt.expected.hash}; only managed regions changed.`},reviewer,now);
    if((await new MenusStore(db,owner).get()).revision!==revision)throw Error('menus_changed');
    const pointer=await reviews.activate(hash,receipt.expected,now);if(!pointer)throw Error('menu_base_changed');
    return{pointer};
}
export async function discardMenuDraft(db:DbRunner,owner:string,revision:number,now:string){
    const publication=new SitePublicationStore(db,owner),active=await publication.activeVersion();if(!active)throw Error('menu_first_publication_required');
    const pages=[...active.artifact.templates,...(active.artifact.schemaVersion===2?active.artifact.staticPages??[]:[])];
    const hashes=new Set(pages.map(page=>(page.layout as {root?:{appMenus?:{hash?:string}}}).root?.appMenus?.hash).filter((hash):hash is string=>!!hash));
    if(hashes.size>1)throw Error('menu_published_definitions_conflict');
    const hash=[...hashes][0],snapshot=hash?await new MenusSnapshotStore(db,owner).get(hash):null;
    if(hash&&!snapshot)throw Error('menus_snapshot_unavailable');
    if(stableStringify((await publication.activeVersion())?.pointer)!==stableStringify(active.pointer))throw Error('menu_base_changed');
    const document=await new MenusStore(db,owner).save(snapshot?.menus??[],revision,now);if(!document)throw Error('menus_changed');
    return document;
}
