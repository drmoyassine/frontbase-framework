import {readTemplatePolicy} from '@frontbase/edge-core/template-policy';
import type {SitePublicationManifest} from './site-publication-manifest.js';
type Catalog=Pick<SitePublicationManifest,'index'|'templates'>;
export function templateRoute(catalog:Catalog,path:string){
    const entry=catalog.index.find(entry=>entry.originalPath===path);if(!entry)return null;
    const attached=catalog.templates.flatMap(template=>(readTemplatePolicy(template.layout.root as Record<string,unknown>).attachedRoutes??[]).filter(route=>route.source===`${entry.collection}:${entry.id}`).map(route=>({template,route})));
    if(attached.length>1)throw Error('template_route_ambiguous');
    if(attached.length){const {template,route}=attached[0]!;const collection=({program:'programs',institution:'institutions',article:'articles'} as Record<string,string>)[template.role];if(entry.collection!=='pages'||!collection)throw Error('template_route_invalid');
        return {entry,role:template.role,template,collection,recordId:route.recordId,parentId:route.parentId,attached:true};}
    const role=({institutions:'institution',programs:'program',articles:'article',pages:'editorial',cities:''})[entry.collection];
    return {entry,role,template:catalog.templates.find(template=>template.role===role),collection:entry.collection,recordId:entry.id,parentId:entry.parentId,attached:false};
}
export function validateTemplateRoutes(catalog:Catalog){
    const sources=new Set<string>();
    for(const template of catalog.templates)for(const route of readTemplatePolicy(template.layout.root as Record<string,unknown>).attachedRoutes??[]){
        const entry=catalog.index.find(entry=>`${entry.collection}:${entry.id}`===route.source);
        if(!entry?.originalPath||sources.has(route.source))throw Error('template_route_invalid');sources.add(route.source);
        const resolved=templateRoute(catalog,entry.originalPath);if(!resolved?.attached)throw Error('template_route_invalid');
        if(catalog.index.some(row=>row.collection===resolved.collection&&String(row.id)===String(route.recordId)))throw Error('template_record_already_published');
    }
}
