import { z } from 'zod';
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { SyncStore } from '../sync-store.js';
import type { CompatFetch } from '../external-http.js';
import { mergeAccountConfig,type AccountConfigFor } from '../providers/merge-account.js';
import { datasourceRunner,dialectOf } from '../../db/datasource-runner.js';
import { SiteConfigurationStore } from '../site-configuration-store.js';
import { sitePreparationRequestSchema,prepareSitePublication } from '../site-publication-prepare.js';
import { SitePublicationStore } from '../site-publication-store.js';
import { SitePublicationReviewStore } from '../site-publication-review-store.js';
import { resolveSitePublicationPage } from '../site-publication-runtime.js';
import { publicationPathSchema,sitePublicationReviewRequestSchema } from '@frontbase/edge-core/directory/publication';
import { createEngine,directProvider } from '@frontbase/edge-core';
import { directoryBrowsingStateSchema } from '@frontbase/edge-core/directory/configuration';
import { registerSitePublicationControls } from './site-publication-controls.js';

const previewRequest=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),path:publicationPathSchema,
    params:z.object({type:z.enum(['institution','program']).optional(),q:z.string().max(100).optional(),page:z.number().int().min(1).max(834).optional()}).strict().default({})}).strict();
/** Preparation/review remain private; separate guarded controls publish exact reviewed captures. */
export function registerSitePublicationRoutes(app:Hono<{Variables:ConsoleAuthVars}>,control:DbRunner,storeFor:(tenant:string)=>SyncStore,
    externalFetch:CompatFetch,accounts:AccountConfigFor,now:()=>string):void {
    registerSitePublicationControls(app,control,now);
    app.get('/api/project/site-configuration/publication/render/',async c=>{
        c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
        const user=c.get('principal').user as {role?:string};
        if(!user?.role || !['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role))return c.json({detail:'Prepared preview is unavailable'},403);
        const url=new URL(c.req.url);
        const allowed=['hash','path','type','q','page'];
        if(url.search.length>4096 || [...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1))return c.json({detail:'Invalid preview request'},422);
        const params=Object.fromEntries([...url.searchParams.entries()].filter(([key])=>['type','q','page'].includes(key)).map(([key,value])=>[key,key==='page'?Number(value):value]));
        const parsed=previewRequest.safeParse({hash:url.searchParams.get('hash'),path:url.searchParams.get('path'),params});
        if(!parsed.success)return c.json({detail:'Invalid preview request'},422);
        try {
            const tenant=c.get('tenant'),artifact=await new SitePublicationStore(control,tenant).get(parsed.data.hash);
            if(!artifact)return c.json({detail:'Prepared site is unavailable'},404);
            const pageUrl=new URL(parsed.data.path,'https://publication-preview.invalid');
            for(const [key,value] of Object.entries(parsed.data.params))pageUrl.searchParams.set(key,String(value));
            const result=await resolveSitePublicationPage(artifact,parsed.data.hash,tenant,new Request(pageUrl));
            if(!result)return c.json({detail:'No prepared page at this URL'},404);
            const paths=new Set([artifact.configuration.routes.directory,artifact.configuration.routes.blog,
                ...artifact.records.institutions.map(row=>row.originalPath),...artifact.records.programs.map(row=>row.originalPath),...artifact.records.articles.map(row=>row.originalPath)]);
            // Private preview navigation stays within the SAME captured version.
            const rewrite=(nodes:typeof result.page.layout.content):typeof result.page.layout.content=>nodes.map(node=>{
                const props={...node.props};
                if(props.directoryBrowsingState!==undefined){
                    const [state]=directoryBrowsingStateSchema.parse(props.directoryBrowsingState);
                    props.directoryBrowsingState=[{...state,previewHash:parsed.data.hash}];
                }
                if(node.type==='Link' && typeof props.href==='string' && props.href.startsWith('/')){
                    const target=new URL(props.href,'https://publication-preview.invalid');
                    if(target.origin==='https://publication-preview.invalid' && paths.has(target.pathname) && !target.hash){
                        const params=new URLSearchParams({hash:parsed.data.hash,path:target.pathname});
                        for(const [key,value] of target.searchParams)params.append(key,value);
                        props.href=`/api/project/site-configuration/publication/render/?${params}`;
                    }
                }
                return {...node,props,...(node.children?{children:rewrite(node.children)}:{})};
            });
            result.page={...result.page,layout:{...result.page.layout,content:rewrite(result.page.layout.content)}};
            const manifest={version:result.version,pages:{[pageUrl.pathname]:result.page},queries:{}};
            const engine=createEngine({manifest,data:directProvider(manifest),environment:'builder'});
            const rendered=await engine.fetch(new Request(pageUrl));
            const headers=new Headers(rendered.headers);headers.set('Cache-Control','no-store');headers.set('X-Robots-Tag','noindex, nofollow');
            return new Response(rendered.body,{status:rendered.status,headers});
        }catch{return c.json({detail:'Prepared preview is unavailable'},422);}
    });
    for(const mode of ['prepare','preview','read','review'] as const)app.post(`/api/project/site-configuration/publication/${mode}/`,async c=>{
        c.header('Cache-Control','no-store');
        const user=c.get('principal').user as {role?:string};
        if(!user?.role || !['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role))return c.json({detail:'Site preparation is unavailable'},403);
        const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let text='',size=0;
        if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
            if(size>65536){await reader.cancel();return c.json({detail:'Preparation request is too large'},413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
        let input:unknown;try{input=JSON.parse(text);}catch{return c.json({detail:'Invalid preparation request'},422);}
        const tenant=c.get('tenant');
        if(mode==='review'){
            const request=sitePublicationReviewRequestSchema.safeParse(input);
            if(!request.success)return c.json({detail:'Complete every review check and provide a note'},422);
            try{
                const reviewer=(c.get('principal').user as {id?:string}).id;
                if(!reviewer)return c.json({detail:'Reviewer is unavailable'},403);
                const review=await new SitePublicationReviewStore(control,tenant).approve(request.data,reviewer,now());
                if(!review)return c.json({detail:'This version already has a review; reopen it first'},409);
                return c.json({hash:review.hash,review:{reviewedAt:review.reviewedAt},publicationAvailable:false});
            }catch{return c.json({detail:'Version review is unavailable'},422);}
        }
        if(mode==='read'){
            const request=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().safeParse(input);
            if(!request.success)return c.json({detail:'Invalid preparation request'},422);
            try{
                const artifact=await new SitePublicationStore(control,tenant).get(request.data.hash);
                if(!artifact)return c.json({detail:'Prepared site is unavailable'},404);
                return c.json({hash:request.data.hash,configurationRevision:artifact.configurationRevision,
                    routes:artifact.configuration.routes,
                    records:Object.fromEntries(Object.entries(artifact.records).map(([role,rows])=>[role,rows.map(row=>({id:row.id,title:row.title,...('originalPath' in row?{originalPath:row.originalPath}:{})}))])),
                    review:(await new SitePublicationReviewStore(control,tenant).get(request.data.hash))?.reviewedAt??null,
                    purpose:'private-prepared-candidate',publicationAvailable:false});
            }catch{return c.json({detail:'Prepared site is unavailable'},422);}
        }
        if(mode==='preview'){
            const request=previewRequest.safeParse(input);if(!request.success)return c.json({detail:'Invalid preview request'},422);
            try{
                const artifact=await new SitePublicationStore(control,tenant).get(request.data.hash);
                if(!artifact)return c.json({detail:'Prepared site is unavailable'},404);
                const url=new URL(request.data.path,'https://publication-preview.invalid');
                for(const [key,value] of Object.entries(request.data.params))url.searchParams.set(key,String(value));
                const result=await resolveSitePublicationPage(artifact,request.data.hash,tenant,new Request(url));
                if(!result)return c.json({detail:'No prepared page at this URL'},404);
                return c.json({hash:request.data.hash,page:result.page,version:result.version,purpose:'private-prepared-preview',publicationAvailable:false});
            }catch{return c.json({detail:'Prepared preview is unavailable'},422);}
        }
        const request=sitePreparationRequestSchema.safeParse(input);if(!request.success)return c.json({detail:'Invalid preparation request'},422);
        const draft=await new SiteConfigurationStore(control,tenant).get();
        if(!draft || draft.revision!==request.data.expectedConfigurationRevision)return c.json({detail:'Shared settings changed; reload first'},409);
        const source=await storeFor(tenant).getDatasource(draft.configuration.datasourceId);
        if(!source)return c.json({detail:'Directory datasource is unavailable'},403);
        if(!['supabase','postgres','neon','sqlite','turso','d1'].includes(source.kind))return c.json({detail:'Preparation requires a supported SQL datasource'},422);
        try{
            const db=datasourceRunner(source.kind,await mergeAccountConfig(accounts,externalFetch,tenant,source.kind,source.config), externalFetch);
            const result=await prepareSitePublication(control,db,tenant,draft,dialectOf(source.kind),request.data,user,now());
            return c.json({hash:result.hash,configurationRevision:draft.revision,
                records:Object.fromEntries(Object.entries(result.artifact.records).map(([role,rows])=>[role,rows.map(row=>({id:row.id,title:row.title,...('originalPath' in row?{originalPath:row.originalPath}:{})}))])),
                purpose:'private-prepared-candidate',publicationAvailable:false});
        }catch(error){
            if(error instanceof Error && error.message==='publication_route_serialization')return c.json({detail:'An original URL changes when requested by a browser. Review its original encoding before preparing this version; no URL was renamed.',code:'publication_route_serialization'},422);
            return c.json({detail:'Site preparation failed. Check saved templates, scoped records and matching article approvals.'},422);
        }
    });
}
