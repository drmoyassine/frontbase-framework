import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {menuReferenceSchema,resolveMenuRegions,type VerifiedMenuAudience} from '@frontbase/edge-core/menus';
import {composeMenuRegions} from '@frontbase/edge-core/menu-components';
import {MenusSnapshotStore} from './menus-snapshot.js';
import {SiteConfigurationStore} from './site-configuration-store.js';
import {KeyValueStore} from './store.js';
export async function readPublicSiteName(db:DbRunner,owner:string):Promise<string>{
    const configuration=await new SiteConfigurationStore(db,owner).get();if(configuration)return configuration.configuration.site.name;
    const project=await new KeyValueStore(db,owner).getJson('project',{}) as Record<string,any>;
    return typeof project?.siteIdentity?.name==='string'?project.siteIdentity.name:typeof project?.name==='string'?project.name:'';
}
/** Shared host adapter for ordinary pages, captured pages and private builder previews. */
export async function resolveAppMenuLayout(db:DbRunner,owner:string,layout:PageLayoutData,path:string,audience:VerifiedMenuAudience|null,siteName='',expectedPageId?:string):Promise<PageLayoutData>{
    if(layout.root?.appMenus===undefined)return layout;
    const legacy=(nodes:PageLayoutData['content']):boolean=>nodes.some(node=>node.type==='Navbar'||node.type==='Footer'||node.props?.sharedSiteHeader===true||legacy(node.children??[]));
    if(legacy(layout.content))throw Error('menu_legacy_region_conflict');
    const ref=menuReferenceSchema.parse(layout.root.appMenus);if(expectedPageId&&ref.pageId!==expectedPageId)throw Error('menu_reference_invalid');
    const document=await new MenusSnapshotStore(db,owner).get(ref.hash);if(!document)throw Error('menus_snapshot_unavailable');
    const regions=resolveMenuRegions(document,ref.pageId,path,audience),root={...layout.root};delete root.appMenus;
    return composeMenuRegions({...layout,root},regions,audience,siteName);
}
