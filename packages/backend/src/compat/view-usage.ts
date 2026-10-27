import type {DbRunner} from '@frontbase/edge-infra';
import {walkBlockTree,applyBlockVersion} from '@frontbase/edge-core/block-versions';
import {PagesStore} from './pages-store.js';
import {SitePublicationStore} from './site-publication-store.js';
export async function savedViewUsage(db:DbRunner,owner:string){
    const result:Record<string,{pageId:string;name:string;componentId:string;version:string;state:'Published'|'Draft'}[]>={};
    const inspect=(layout:any,pageId:string,name:string,state:'Published'|'Draft')=>{
        walkBlockTree(layout?.content??[],node=>{
            for(const version of [{id:'default',name:'Default'},...(node.versions??[])]){
                const effective=applyBlockVersion(node,version.id),binding=(effective.props?.binding??effective.binding) as any;
                if(binding?.viewId)(result[binding.viewId]??=[]).push({pageId,name,componentId:node.id,version:version.name,state});
            }
        });
    };
    for(const page of await new PagesStore(db,owner).list())if(!page.is_published)inspect(JSON.parse(page.layout_data),page.id,page.name,'Draft');
    const active=await new SitePublicationStore(db,owner).activeVersion();
    if(active?.artifact.schemaVersion===2)for(const page of [...active.artifact.templates,...(active.artifact.staticPages??[])])inspect(page.layout,page.pageId,page.title,'Published');
    return result;
}
