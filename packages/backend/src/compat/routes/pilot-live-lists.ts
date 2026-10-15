import {z} from 'zod';
import type {Hono} from 'hono';
import type {DbRunner} from '@frontbase/edge-infra';
import type {ConsoleAuthVars} from '../../mw/auth.js';
import type {SyncStore} from '../sync-store.js';
import type {CompatFetch} from '../external-http.js';
import {mergeAccountConfig,type AccountConfigFor} from '../providers/merge-account.js';
import {datasourceRunner} from '../../db/datasource-runner.js';
import {SitePublicationStore} from '../site-publication-store.js';
import {SitePublicationManifestStore} from '../site-publication-manifest.js';
import {SitePublicationReviewStore} from '../site-publication-review-store.js';
import {PagesStore} from '../pages-store.js';
import {PageChangeStore} from '../page-change-store.js';
import {pilotLiveViewPlan,convertPilotLiveLists,type PilotLiveViews} from '../pilot-live-lists.js';
import {publicationHash} from '../publication-hash.js';
import type {PageLayoutData} from '@frontbase/edge-core';
import {walkBlockTree,applyBlockVersion} from '@frontbase/edge-core/block-versions';
import {protectPublishedLiveSource} from '../published-live-access.js';

export function registerPilotLiveLists(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,storeFor:(owner:string)=>SyncStore,externalFetch:CompatFetch,accounts:AccountConfigFor,now:()=>string){
    app.post('/api/project/live-list-migration/',async c=>{
        c.header('Cache-Control','no-store');
        const user=c.get('principal').user as {role?:string;id?:string},owner=c.get('tenant');
        if(!user?.id||!['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role??''))return c.json({detail:'Migration unavailable'},403);
        if(c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')return c.json({detail:'JSON required'},415);
        try{
            const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let raw='',size=0;
            if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096){await reader.cancel();return c.json({detail:'Request too large'},413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}
            const input=z.object({mode:z.enum(['preview','publish']),baseHash:z.string().regex(/^[a-f0-9]{64}$/),planHash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(JSON.parse(raw));
            const store=new SitePublicationStore(db,owner),reviews=new SitePublicationReviewStore(db,owner),active=await store.activeVersion();
            if(!active||active.pointer.hash!==input.baseHash||active.artifact.schemaVersion!==2||!await reviews.get(input.baseHash))throw Error('base_changed');
            const base=active.artifact;
            if(input.mode==='publish'){
                if(!input.planHash)throw Error('preview_required');
                const rows=await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[owner,`live_list_migration:v1:${input.planHash}`]);
                const plan=JSON.parse(String(rows[0]?.value));
                if(await publicationHash(plan)!==input.planHash||plan.baseHash!==input.baseHash)throw Error('preview_changed');
                const changes=new PageChangeStore(db,owner);
                for(const page of plan.drafts)if((await changes.state(page.id))?.hash!==page.stateHash)throw Error('draft_changed');
                for(const page of plan.drafts){
                    const operation=await changes.begin(page.id,{operationId:crypto.randomUUID(),expectedStateHash:page.stateHash,patch:{layoutData:page.layout}},now());
                    const result=await changes.execute(operation.operationId);
                    if(result.status!=='applied')throw Error('draft_conversion_incomplete');
                }
                const baseReview=(await reviews.get(input.baseHash))!;
                if(!await reviews.get(plan.hash))await reviews.approve({hash:plan.hash,checks:baseReview.checks,note:`Owner-authorized live-list conversion from ${input.baseHash}; existing approved route membership, records, menus and pending design edits preserved. Live SELECT views replace catalog list reads only.`},user.id,now());
                const pointer=await reviews.activate(plan.hash,active.pointer,now());if(!pointer)throw Error('base_changed');
                return c.json({pointer,views:plan.views,draftsConverted:plan.drafts.length});
            }
            let pending=false;
            for(const page of [...base.templates,...(base.staticPages??[])])if(['directory','article-index'].includes('role' in page?page.role:'')||!!(page.layout as any)?.root?.directoryLanding){
                walkBlockTree((page.layout as any).content,node=>{for(const id of ['default',...(node.versions??[]).map(version=>version.id)]){
                    const current=applyBlockVersion(node,id),props=current.props as any;
                    if(props?.binding?.source?.kind==='publication'||props?.directoryQuery?.queryId?.endsWith('.list'))pending=true;
                }});
            }
            if(!pending)throw Error('lists_already_live');
            const sync=storeFor(owner),ds=await sync.getDatasource(base.configuration.datasourceId);
            if(!ds||!['supabase','postgres'].includes(ds.kind))throw Error('postgres_source_required');
            await protectPublishedLiveSource(db,owner,ds.id,now());
            const canonical=datasourceRunner(ds.kind,await mergeAccountConfig(accounts,externalFetch,owner,ds.kind,ds.config),externalFetch);
            const definitions=await pilotLiveViewPlan(base,owner,input.baseHash),views={datasourceId:ds.id} as PilotLiveViews;
            const existing=await sync.listViews(ds.id);
            for(const definition of definitions){
                await canonical.exec(definition.sql);
                const counts=await canonical.query(`SELECT COUNT(*) AS total FROM public."${definition.table}"`);
                if(Number(counts[0]?.total)!==definition.expected)throw Error('live_population_changed');
                let view=existing.find(view=>view.target_table===definition.table);
                const columns=definition.columns;
                if(!view){
                    const digest=await publicationHash({owner,table:definition.table}),id=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
                    view=await sync.createView({datasource_id:ds.id,name:`Study in USA · ${definition.collection} · live`,target_table:definition.table,visible_columns:columns,column_order:columns,filters:[{column:'country_id',op:'eq',value:base.configuration.collections.institution.scope.value}],description:'Live SELECT projection. Approved route membership and article revisions are enforced in the underlying database view; no stored record copy.'},id,now());
                }
                views[definition.collection]={id:view.id,name:view.name,target_table:view.target_table,columns};
            }
            const selected=(page:any)=>['directory','article-index'].includes(page.role)||!!page.layout?.root?.directoryLanding;
            const convert=(page:any)=>selected(page)?{...page,layout:convertPilotLiveLists(page.layout as PageLayoutData,views)}:page;
            const hash=await new SitePublicationManifestStore(db,owner).prepareLayouts(input.baseHash,{templates:base.templates.map(convert),staticPages:base.staticPages?.map(convert)},now());
            const ids=new Set([...base.templates,...(base.staticPages??[])].filter(selected).map(page=>page.pageId)),changes=new PageChangeStore(db,owner),drafts=[];
            for(const page of await new PagesStore(db,owner).list())if(ids.has(page.id)){
                const state=await changes.state(page.id);if(!state?.draft)throw Error('authoring_draft_required');
                const before=JSON.parse(page.layout_data),layout=convertPilotLiveLists(before,views);
                if(JSON.stringify(before)!==JSON.stringify(layout))drafts.push({id:page.id,stateHash:state.hash,layout});
            }
            if((await store.activeVersion())?.pointer.hash!==input.baseHash)throw Error('base_changed');
            const plan={baseHash:input.baseHash,hash,views,drafts},planHash=await publicationHash(plan);
            await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[owner,`live_list_migration:v1:${planHash}`,JSON.stringify(plan),now()]);
            return c.json({planHash,hash,baseHash:input.baseHash,views:definitions.map(view=>({collection:view.collection,table:view.table,total:view.expected})),drafts:drafts.length,previews:[{label:'Homepage',path:'/'},{label:'Explore',path:base.configuration.routes.directory},{label:'Blog',path:base.configuration.routes.blog}]});
        }catch(error){return c.json({detail:'Live conversion stopped; publication was not automatically retried.',code:error instanceof Error?error.message:'migration_unavailable'},409);}
    });
}
