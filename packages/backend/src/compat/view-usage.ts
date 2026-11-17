import type {DbRunner} from '@frontbase/edge-infra';
import {applyBlockVersion,walkBlockTree} from '@frontbase/edge-core/block-versions';
import {sitePageReferenceSchema,type DirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import type {PageLayoutData} from '@frontbase/edge-core';
import {LiveLayoutPublicationStore} from './live-layout-publication.js';
import {PagesStore} from './pages-store.js';
import {SiteConfigurationStore} from './site-configuration-store.js';
import {SitePublicationStore} from './site-publication-store.js';

type Usage={pageId:string;name:string;componentId:string;version:string;state:'Published'|'Draft'};
type DetailRole=keyof NonNullable<DirectoryConfiguration['detailViews']>;

export async function savedViewUsage(db:DbRunner,owner:string){
    const result:Record<string,Usage[]>=Object.create(null);
    const seen=new Set<string>();
    const [live,pages,draft]=await Promise.all([
        new LiveLayoutPublicationStore(db,owner).active(),
        new PagesStore(db,owner).list(),
        new SiteConfigurationStore(db,owner).get(),
    ]);
    const collect=(layout:PageLayoutData,pageId:string,name:string,state:Usage['state'],views?:DirectoryConfiguration['detailViews'])=>{
        const add=(id:string|undefined,componentId:string,version:string)=>{
            if(!id)return;
            const key=JSON.stringify([id,pageId,componentId,version]);
            // The editable copy of an identical binding adds no draft-only dependency.
            if(seen.has(key))return;
            seen.add(key);
            (result[id]??=[]).push({pageId,name,componentId,version,state});
        };
        const role=sitePageReferenceSchema.safeParse(layout.root?.siteConfiguration);
        if(views&&role.success){
            const detail=role.data.role==='editorial'?'article':role.data.role;
            if(detail==='institution'||detail==='program'||detail==='article'){
                add(views[detail],'$record-source','Detail source');
                if(detail==='program')add(views.institution,'$parent-source','Institution relationship');
            }
        }
        walkBlockTree(layout.content??[],node=>{
            for(const version of [{id:'default',name:'Default'},...node.versions??[]]){
                const effective=applyBlockVersion(node,version.id);
                const binding=effective.props?.binding??effective.binding;
                if(typeof binding?.viewId==='string')add(binding.viewId,node.id,version.name);
                const query=effective.props?.directoryQuery?.queryId;
                if(views&&typeof query==='string'){
                    const match=/^directory\.(institution|program|article|page)\.(list|detail)$/.exec(query);
                    if(!match)continue;
                    const queryRole=(match[1]==='page'?'article':match[1]) as DetailRole;
                    if(match[2]!=='detail'||!role.success||role.data.role!==queryRole&&!(role.data.role==='editorial'&&queryRole==='article')){
                        add(views[queryRole],node.id,match[2]==='list'?'Record list':'Related records');
                    }
                    if(queryRole==='program'&&!(role.success&&role.data.role==='program')){
                        add(views.institution,node.id,'Institution relationship');
                    }
                }
            }
        });
    };
    if(live){
        for(const page of [...live.layout.templates,...live.layout.staticPages]){
            collect(page.layout as unknown as PageLayoutData,page.pageId,page.title,'Published',live.layout.configuration.detailViews);
        }
    }else{
        const legacy=await new SitePublicationStore(db,owner).activeVersion();
        if(legacy?.artifact.schemaVersion===2){
            for(const page of [...legacy.artifact.templates,...legacy.artifact.staticPages??[]]){
                collect(page.layout as unknown as PageLayoutData,page.pageId,page.title,'Published');
            }
        }
    }
    for(const page of pages){
        collect(JSON.parse(page.layout_data),page.id,page.name,page.is_published&&!live?'Published':'Draft',draft?.configuration.detailViews);
    }
    return result;
}
