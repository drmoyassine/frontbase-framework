import {validateTemplateRoutes} from './template-route.js';
import type {DbRunner} from '@frontbase/edge-infra';
import {PagesStore} from './pages-store.js';
import {PageChangeStore,PageChangeConflict} from './page-change-store.js';
import {SitePublicationStore} from './site-publication-store.js';
import {readTemplatePolicy,templatePolicySchema,type TemplatePolicy} from '@frontbase/edge-core/template-policy';

export async function templateUrlSettings(db:DbRunner,owner:string,pageId:string){
    const page=await new PagesStore(db,owner).get(pageId);if(!page||page.deleted_at)throw Error('template_unavailable');
    const layout=JSON.parse(page.layout_data),role=layout.root?.siteConfiguration?.role;
    if(!['program','institution','article','editorial'].includes(role))throw Error('template_unavailable');
    let binding:Record<string,unknown>|undefined;
    const scan=(nodes:any[])=>{for(const node of nodes??[]){if(!binding&&node.type==='Card'&&node.props?.binding)binding=node.props.binding;if(node.children)scan(node.children);}};scan(layout.content);
    const active=await new SitePublicationStore(db,owner).activeVersion();
    const collection=({program:'programs',institution:'institutions',article:'articles',editorial:'pages'} as const)[role as 'program'];
    const artifact=active?.artifact;
    const policy=readTemplatePolicy(layout.root);
    const entries=artifact?.schemaVersion===2?artifact.index.filter(row=>row.collection===collection):[];
    const attached=artifact?.schemaVersion===2?(policy.attachedRoutes??[]).map(route=>({route,entry:artifact.index.find(row=>`${row.collection}:${row.id}`===route.source)})).filter(item=>item.entry):[];
    return {pageId,name:page.name,role,revision:page.content_hash??'',policy,
        locale:artifact?.configuration.site.locale??'en',publication:active?.pointer??null,
        records:[...entries.map(row=>({identity:`${row.collection}:${row.id}`,id:row.id,title:row.title,path:row.originalPath!,attached:false})),...attached.map(({route,entry})=>({identity:`${collection}:${route.recordId}`,id:route.recordId,title:entry!.title,path:entry!.originalPath!,attached:true}))],
        binding:binding?{dataSourceId:binding.dataSourceId,tableName:binding.tableName,sourceSchema:binding.sourceSchema}:undefined,
        columns:['id','title','summary','cover','originalPath',...Object.keys(layout.root?.templateRecordFields??{})]};
}

/** Update ONLY settings, preserving every existing layout property. Compare the full layout
 * as well as its hash so an intervening builder write cannot be silently overwritten. */
export async function saveTemplateUrlSettings(db:DbRunner,owner:string,pageId:string,revision:string,policy:TemplatePolicy,now:string){
    const current=await templateUrlSettings(db,owner,pageId);if(current.revision!==revision)return null;
    const parsed=templatePolicySchema.parse(policy),known=new Set(current.records.map(row=>row.identity));
    const active=await new SitePublicationStore(db,owner).activeVersion();
    if(parsed.attachedRoutes?.length){if(active?.artifact.schemaVersion!==2)throw Error('publication_required');const artifact=structuredClone(active.artifact);const target=artifact.templates.find(row=>row.pageId===pageId);if(!target)throw Error('template_unavailable');target.layout.root={...target.layout.root as object,templatePolicy:parsed};validateTemplateRoutes(artifact);
        const collection=({program:'programs',institution:'institutions',article:'articles'} as Record<string,string>)[current.role];for(const route of parsed.attachedRoutes)known.add(`${collection}:${route.recordId}`);}
    // Retain previously authored exceptions for temporarily unpublished records.
    for(const key of Object.keys(parsed.overrides))if(!known.has(key)&&!Object.hasOwn(current.policy.overrides,key))throw Error('record_unavailable');
    const states=new PageChangeStore(db,owner),before=await states.state(pageId);
    const store=new PagesStore(db,owner),page=await store.get(pageId);if(!before?.draft||!page||page.content_hash!==revision)return null;
    const layout=JSON.parse(page.layout_data);layout.root={...layout.root,templatePolicy:parsed};
    try{
        const operationId=crypto.randomUUID();
        await states.begin(pageId,{operationId,expectedStateHash:before.hash,patch:{layoutData:layout}},now);
        const result=await states.execute(operationId);
        return result.status==='applied'?templateUrlSettings(db,owner,pageId):null;
    }catch(error){if(error instanceof PageChangeConflict)return null;throw error;}
}
