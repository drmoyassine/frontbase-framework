import {templateRoute} from './template-route.js';
import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import {stableStringify} from '@frontbase/compiler/manifest';
import {menuPlacementMatches,type MenuDocument,type MenuAudience} from '@frontbase/edge-core/menus';
import type {PageLayoutData,PageComponent} from '@frontbase/edge-core';
import {MenusStore} from './menus-store.js';
import {MenusSnapshotStore} from './menus-snapshot.js';
import {SitePublicationStore} from './site-publication-store.js';
import {SitePublicationManifestStore} from './site-publication-manifest.js';
import {SitePublicationReviewStore} from './site-publication-review-store.js';
import {verifyManifestEditorial} from './site-publication-approval-check.js';
import {SiteConfigurationStore} from './site-configuration-store.js';
import {publicationHash} from './publication-hash.js';
import type {PublicationVersion} from './publication-version.js';

export const menusCaptureInput=z.object({baseHash:z.string().regex(/^[a-f0-9]{64}$/),expectedRevision:z.number().int().min(1),removals:z.array(z.object({pageId:z.string().uuid(),nodeId:z.string().min(1).max(200),nodeHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(2000)}).strict();
type Removal=z.infer<typeof menusCaptureInput>['removals'][number];
const pages=(version:PublicationVersion)=>[...version.templates,...(version.schemaVersion===2?version.staticPages??[]:[])];
function hasData(node:PageComponent):boolean{return !!(node.binding||node.props?.directoryQuery||node.props?.recordBindings||node.props?.dataRequest||node.props?.binding)||(node.children??[]).some(hasData);}
function audienceOverlap(a:MenuAudience,b:MenuAudience):boolean{
    const auth=(rule:MenuAudience)=>rule.authentication==='anonymous'?(rule.contactTypes.length||rule.permissionLevels.length?[]:[false]):rule.authentication==='authenticated'||rule.contactTypes.length||rule.permissionLevels.length?[true]:[false,true];
    const overlap=(x:string[],y:string[])=>!x.length||!y.length||x.some(key=>y.includes(key));
    return auth(a).some(value=>auth(b).includes(value))&&overlap(a.contactTypes,b.contactTypes)&&overlap(a.permissionLevels,b.permissionLevels);
}
function contexts(version:PublicationVersion){
    const points:{pageId:string;path:string}[]=[];const template=(role:string)=>version.templates.find(t=>t.role===role)?.pageId;
    if(version.schemaVersion===1){for(const [role,rows]of [['institution',version.records.institutions],['program',version.records.programs],['article',version.records.articles]] as const){for(const row of rows){const pageId=template(role);if(pageId)points.push({pageId,path:row.originalPath});}}}
    else{for(const row of version.index){const role=row.originalPath?templateRoute(version,row.originalPath)?.role??'':'',pageId=template(role);if(pageId&&row.originalPath)points.push({pageId,path:row.originalPath});}for(const page of version.staticPages??[])points.push({pageId:page.pageId,path:page.originalPath});}
    const directory=template('directory'),blog=template('article-index');if(directory)points.push({pageId:directory,path:version.configuration.routes.directory});if(blog)points.push({pageId:blog,path:version.configuration.routes.blog});return points;
}
function checkConflicts(document:MenuDocument,version:PublicationVersion){const points=contexts(version),enabled=document.menus.filter(m=>m.enabled),matched=new Map(enabled.map(m=>[m.id,new Set(points.filter(p=>menuPlacementMatches(m,p.pageId,p.path)).map(p=>p.path))]));
    for(let i=0;i<enabled.length;i++)for(let j=i+1;j<enabled.length;j++){const a=enabled[i]!,b=enabled[j]!;if(a.slot===b.slot&&a.priority===b.priority&&audienceOverlap(a.audience,b.audience)&&[...matched.get(a.id)!].some(path=>matched.get(b.id)!.has(path)))throw Error('menu_placement_conflict');}
}
function relativeMenus(document:MenuDocument,origin:string):MenuDocument{
    const relative=(href:string)=>{try{const url=new URL(href);return url.origin===new URL(origin).origin?url.pathname+url.search+url.hash:href;}catch{return href;}};
    const items=(nodes:MenuDocument['menus'][number]['items']):typeof nodes=>nodes.map(item=>({...item,href:relative(item.href),children:items(item.children)}));
    return{...document,menus:document.menus.map(menu=>({...menu,items:items(menu.items),design:{...menu.design,brandHref:relative(menu.design.brandHref)}}))};
}
/** Only named, digest-matched nodes are removed; never infer deletion from generic styling. */
async function migrateLayout(layout:PageLayoutData,pageId:string,removals:Removal[],hash:string):Promise<PageLayoutData>{
    const selected=new Map(removals.map(row=>[row.nodeId,row]));if(selected.size!==removals.length)throw Error('menu_removal_invalid');
    const removed=new Set<string>();
    const walk=async(nodes:PageComponent[]):Promise<PageComponent[]>=>{const output:PageComponent[]=[];for(const node of nodes){const removal=selected.get(node.id);
        if(removal){if(!['Container','Navbar','Footer'].includes(node.type)||hasData(node)||await publicationHash(node)!==removal.nodeHash)throw Error('menu_removal_invalid');removed.add(node.id);continue;}
        if(node.type==='Navbar'||node.type==='Footer'||node.props?.sharedSiteHeader===true)throw Error('menu_legacy_region_conflict');
        output.push({...node,...(node.children?{children:await walk(node.children)}:{})});}return output;};
    const content=await walk(layout.content);if(removed.size!==selected.size)throw Error('menu_removal_invalid');
    return{...layout,root:{...layout.root,appMenus:{schemaVersion:1,hash,pageId}},content};
}
export async function menuPublicationPlan(db:DbRunner,owner:string){
    const active=await new SitePublicationStore(db,owner).activeVersion();if(!active)return{baseHash:null,pages:[]};
    return{baseHash:active.pointer.hash,generation:active.pointer.generation,pages:await Promise.all(pages(active.artifact).map(async page=>{
        const nodes:{id:string;type:string;hash:string;label:string;native:boolean}[]=[];
        const walk=async(rows:PageComponent[])=>{for(const node of rows){if(['Container','Navbar','Footer'].includes(node.type)&&!hasData(node))nodes.push({id:node.id,type:node.type,hash:await publicationHash(node),label:node.props?.sharedSiteHeader===true?'Existing shared header':String(node.props?.templateStyle??node.type),native:node.type==='Navbar'||node.type==='Footer'||node.props?.sharedSiteHeader===true});if(node.children)await walk(node.children);}};
        await walk((page.layout as unknown as PageLayoutData).content);return{pageId:page.pageId,title:page.title,...('originalPath'in page?{path:page.originalPath}:{}),nodes};
    }))};
}
export async function prepareMenuCapture(db:DbRunner,owner:string,value:unknown,now:string){
    const input=menusCaptureInput.parse(value),publication=new SitePublicationStore(db,owner),active=await publication.activeVersion();
    if(!active||active.pointer.hash!==input.baseHash||!await new SitePublicationReviewStore(db,owner).get(input.baseHash))throw Error('menu_base_changed');
    const base=active.artifact,draft=await new SiteConfigurationStore(db,owner).get();
    if(!draft||draft.revision!==base.configurationRevision||stableStringify(draft.configuration)!==stableStringify(base.configuration))throw Error('publication_configuration_conflict');
    if(base.schemaVersion===2){await new SitePublicationManifestStore(db,owner).verify(base);await verifyManifestEditorial(db,owner,base);}
    const document=await new MenusStore(db,owner).get();if(document.revision!==input.expectedRevision)throw Error('menus_changed');checkConflicts(document,base);
    const known=new Set(pages(base).map(page=>page.pageId));if(input.removals.some(row=>!known.has(row.pageId)))throw Error('menu_removal_invalid');
    const menusHash=await new MenusSnapshotStore(db,owner).prepare(relativeMenus(document,base.configuration.site.origin),now);
    const rewrite=async<T extends{pageId:string;layout:Record<string,unknown>}>(page:T):Promise<T>=>({...page,layout:await migrateLayout(page.layout as unknown as PageLayoutData,page.pageId,input.removals.filter(row=>row.pageId===page.pageId),menusHash) as unknown as Record<string,unknown>});
    const templates=await Promise.all(base.templates.map(rewrite)),staticPages=base.schemaVersion===2?await Promise.all((base.staticPages??[]).map(rewrite)):undefined;
    if((await new MenusStore(db,owner).get()).revision!==document.revision||(await publication.activeVersion())?.pointer.hash!==input.baseHash||(await new SiteConfigurationStore(db,owner).get())?.revision!==draft.revision)throw Error('menus_changed');
    const hash=base.schemaVersion===1?await publication.prepare({...base,templates},now):await new SitePublicationManifestStore(db,owner).prepareLayouts(input.baseHash,{templates,staticPages},now);
    return{hash,menusHash,revision:document.revision,baseHash:input.baseHash};
}
