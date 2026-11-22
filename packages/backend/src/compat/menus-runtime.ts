import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {menuReferenceSchema,resolveMenuRegions,type VerifiedMenuAudience} from '@frontbase/edge-core/menus';
import {composeMenuRegions} from '@frontbase/edge-core/menu-components';
import {MenusSnapshotStore} from './menus-snapshot.js';
import {SiteConfigurationStore} from './site-configuration-store.js';
import {KeyValueStore} from './store.js';
import {applyBookingSitePalette, BOOKING_PALETTE_KEY} from './booking-site-palette.js';
import type {BookingPalette} from '@frontbase/edge-core/directory/configuration';
export async function readPublicSiteName(db:DbRunner,owner:string):Promise<string>{
    const configuration=await new SiteConfigurationStore(db,owner).get();if(configuration)return configuration.configuration.site.name;
    const project=await new KeyValueStore(db,owner).getJson('project',{}) as Record<string,any>;
    return typeof project?.siteIdentity?.name==='string'?project.siteIdentity.name:typeof project?.name==='string'?project.name:'';
}
/** Shared host adapter for ordinary pages, captured pages and private builder previews. */
export async function resolveAppMenuLayout(db:DbRunner,owner:string,layout:PageLayoutData,path:string,audience:VerifiedMenuAudience|null,siteName='',expectedPageId?:string,previewPalette?:BookingPalette):Promise<PageLayoutData>{
    const readPalette = () => previewPalette ?? (layout.root?.bookingForX ? new KeyValueStore(db,owner).getJson(BOOKING_PALETTE_KEY,null) : null);
    if(layout.root?.appMenus===undefined)return applyBookingSitePalette(layout,await readPalette());
    const legacy=(nodes:PageLayoutData['content']):boolean=>nodes.some(node=>node.type==='Navbar'||node.type==='Footer'||node.props?.sharedSiteHeader===true||legacy(node.children??[]));
    if(legacy(layout.content))throw Error('menu_legacy_region_conflict');
    const ref=menuReferenceSchema.parse(layout.root.appMenus);if(expectedPageId&&ref.pageId!==expectedPageId)throw Error('menu_reference_invalid');
    const [document,palette]=await Promise.all([new MenusSnapshotStore(db,owner).get(ref.hash),readPalette()]);
    if(!document)throw Error('menus_snapshot_unavailable');
    const regions=resolveMenuRegions(document,ref.pageId,path,audience),root={...layout.root};delete root.appMenus;
    return applyBookingSitePalette(composeMenuRegions({...layout,root},regions,audience,siteName),palette);
}
