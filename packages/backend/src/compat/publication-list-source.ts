import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { applyBlockVersion, blockVersionPossible, selectBlockVersion, type VersionedBlock } from '@frontbase/edge-core/block-versions';
import { contextReader, evaluateCondition, resolveValue } from '@frontbase/edge-core/conditions';
import type { PageLayoutData, PageComponent } from '@frontbase/edge-core';
import { audienceConditionUser } from '@frontbase/edge-core';
import type { VerifiedMenuAudience } from '@frontbase/edge-core/menus';
import { SitePublicationStore } from './site-publication-store.js';
import { SitePublicationReviewStore } from './site-publication-review-store.js';
import { SitePublicationManifestStore } from './site-publication-manifest.js';
import { verifyManifestEditorial } from './site-publication-approval-check.js';

export const publicationListRequestSchema = z.object({ componentId:z.string().min(1).max(200),versionId:z.string().min(1).max(128).default('default'),
    page:z.number().int().min(0).max(20000),pageSize:z.number().int().min(1).max(48),
    sortColumn:z.enum(['title','id']).default('title'),direction:z.enum(['asc','desc']).default('asc'),
    filters:z.array(z.object({column:z.enum(['title','id','parentId','institutionId']),op:z.enum(['eq','neq','gt','gte','lt','lte','contains','in','is_null','not_null']),value:z.unknown().optional()}).strict()).max(50)
}).strict();
const collections = ['institutions','programs','articles'] as const;
export const publicationListBindingSchema=z.object({dataSourceId:z.literal('frontbase:publication'),tableName:z.enum(collections),source:z.object({kind:z.literal('publication'),hash:z.string().regex(/^[a-f0-9]{64}$/)}).passthrough()}).passthrough();

export async function readPublicationList(db:DbRunner,owner:string,bindingInput:unknown,input:unknown){
    const binding=publicationListBindingSchema.parse(bindingInput),query=publicationListRequestSchema.parse(input);
    if(!await new SitePublicationReviewStore(db,owner).get(binding.source.hash))throw Error('snapshot_unavailable');
    const source=await new SitePublicationStore(db,owner).getVersion(binding.source.hash);
    if(source?.schemaVersion!==2)throw Error('snapshot_unavailable');
    const {page:pageNumber,pageSize,filters,direction,sortColumn}=query;
    // Per-element page size is validated against the snapshot adapter's hard
    // 48-row bound. The legacy global page size remains a legacy-path default.
    const entries=source.index.filter(row=>row.collection===binding.tableName).filter(row=>filters.every(filter=>{
        const value=filter.column==='institutionId'?row.parentId:(row as any)[filter.column];
        const operator=filter.op==='is_null'?'eq':filter.op==='not_null'?'neq':filter.op;
        return evaluateCondition({left:{kind:'literal',value:value??null},operator,right:{kind:'literal',value:(filter.op==='is_null'||filter.op==='not_null'?null:filter.value) as any}},()=>undefined);
    }));
    entries.sort((a,b)=>{const av=String(a[sortColumn]),bv=String(b[sortColumn]);return (av<bv?-1:av>bv?1:0)*(direction==='desc'?-1:1)||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);});
    const rows:Record<string,unknown>[]=[],store=new SitePublicationManifestStore(db,owner),loaded=new Map<string,Awaited<ReturnType<typeof store.loadChunk>>>();
    for(const entry of entries.slice(pageNumber*pageSize,(pageNumber+1)*pageSize)){
        let chunk=loaded.get(entry.chunkHash);
        if(!chunk){const reference=source.chunks.find(chunk=>chunk.hash===entry.chunkHash);if(!reference)throw Error();chunk=await store.loadChunk(source,reference);loaded.set(entry.chunkHash,chunk);}
        const row=chunk.records[entry.position];if(!row)throw Error();rows.push(Object.fromEntries(Object.entries(row).filter(([key])=>key!=='body')));
    }
    if(binding.tableName==='articles')await verifyManifestEditorial(db,owner,source,rows);
    return {rows,total:entries.length,captureHash:binding.source.hash};
}

/** Resolve only the selected source for initial HTML; alternatives stay query-free. */
export async function projectPublicationListRows(layout:PageLayoutData,db:DbRunner,owner:string,request:Request,user:Record<string,unknown>|null=null):Promise<PageLayoutData>{
    const url=new URL(request.url),read=contextReader({url:Object.fromEntries(url.searchParams),user});
    const walk=async(nodes:PageComponent[]):Promise<PageComponent[]>=>Promise.all(nodes.map(async node=>{
        const versionId=selectBlockVersion(node,read),effective=applyBlockVersion(node,versionId),binding=effective.props?.binding as any;
        let result=node;
        if(binding?.source?.kind==='publication'){
            const controls=effective.props?.controls as any??{};
            const page=Math.max(0,Number(url.searchParams.get('page')||1)-1),search=url.searchParams.get('q')??'';
            const filters=[...Object.entries(binding.filtering?.filters??{}).filter(([,value])=>value!==undefined&&value!=='').map(([column,value])=>({column,op:'eq',value})),
                ...(binding.hiddenFilters??[]).filter((filter:any)=>filter.when===undefined||evaluateCondition(filter.when,read)).map((filter:any)=>({column:filter.column,op:filter.operator,value:resolveValue(filter.value,read)})),
                ...(search&&controls.searchColumn?[{column:controls.searchColumn,op:'contains',value:search}]:[])];
            const query={componentId:node.id,versionId,page,pageSize:binding.pagination?.pageSize??12,sortColumn:binding.sorting?.column??'title',direction:binding.sorting?.direction??'asc',filters};
            const records=await readPublicationList(db,owner,binding,query);
            const props={initialRows:records.rows,initialTotal:records.total,_initialVersionId:versionId,_initialQuery:{page,search,sortColumn:query.sortColumn,direction:query.direction}};
            if(versionId==='default')result={...node,props:{...node.props,...props}};
            else result={...node,versions:node.versions?.map(version=>version.id===versionId?{...version,overrides:{...version.overrides,props:{...version.overrides.props,...props}}}:version)};
        }
        // Recurse only into the active structure. Inactive child trees must not
        // fetch or receive initial records, even when their bindings are valid.
        const activeVersion=result.versions?.find(version=>version.id===versionId);
        if(activeVersion?.overrides.children){
            const children=await walk(activeVersion.overrides.children as PageComponent[]);
            result={...result,versions:result.versions?.map(version=>version.id===versionId?{...version,overrides:{...version.overrides,children}}:version)};
        }else if(result.children)result={...result,children:await walk(result.children)};
        return result;
    }));
    return {...layout,content:await walk(layout.content)};
}

/** Same public page/host boundary, exact reviewed element binding; no arbitrary datasource access. */
export async function publicationListResponse(db:DbRunner,owner:string,request:Request,audience:VerifiedMenuAudience|null):Promise<Response|null> {
    const raw=request.headers.get('X-Frontbase-List');if(!raw)return null;
    const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
    const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(raw.length>8192)return reply({error:'invalid_list_request'},422);
    let parsed:ReturnType<typeof publicationListRequestSchema.safeParse>;try{parsed=publicationListRequestSchema.safeParse(JSON.parse(decodeURIComponent(raw)));}catch{return reply({error:'invalid_list_request'},422);}
    if(!parsed.success)return reply({error:'invalid_list_request'},422);
    const input=parsed.data;
    try{
        const active=await new SitePublicationStore(db,owner).activeVersion();
        if(!active || active.artifact.schemaVersion!==2 || !await new SitePublicationReviewStore(db,owner).get(active.pointer.hash))return reply({error:'list_unavailable'},503);
        const artifact=active.artifact,url=new URL(request.url),path=url.pathname;
        const entry=artifact.index.find(row=>row.originalPath===path);
        const role=path===artifact.configuration.routes.directory?'directory':path===artifact.configuration.routes.blog?'article-index':entry?({institutions:'institution',programs:'program',articles:'article',pages:'editorial',cities:''}[entry.collection]):undefined;
        const page=artifact.staticPages?.find(page=>page.originalPath===path)??artifact.templates.find(page=>page.role===role);
        if(!page)return reply({error:'list_unavailable'},404);
        const read=contextReader({url:Object.fromEntries(url.searchParams),user:audienceConditionUser(audience)});
        let found:VersionedBlock|undefined;
        // Walk only Default structures here; alternative children are admitted only through a server-possible parent.
        const search=(nodes:VersionedBlock[])=>{for(const node of nodes){
            if(node.visibilityCondition&&!blockVersionPossible(node.visibilityCondition,read))continue;
            if(node.id===input.componentId){found=node;return;}
            if(node.children)search(node.children);
            for(const version of node.versions??[])if(version.when&&blockVersionPossible(version.when,read)&&version.overrides.children)search(version.overrides.children);
        }};
        search((page.layout as any).content??[]);
        if(!found)return reply({error:'list_unavailable'},404);
        if(input.versionId!=='default'){
            const version=found.versions?.find(version=>version.id===input.versionId);
            if(!version?.when||!blockVersionPossible(version.when,read))return reply({error:'list_unavailable'},403);
        }
        const node=applyBlockVersion(found,input.versionId),binding=node.props?.binding??node.binding;
        if(binding?.source?.kind!=='publication'||binding.dataSourceId!=='frontbase:publication'||!collections.includes(binding.tableName))return reply({error:'list_unavailable'},404);
        const result=await readPublicationList(db,owner,binding,input);
        if((await new SitePublicationStore(db,owner).activeVersion())?.pointer.hash!==active.pointer.hash)return reply({error:'publication_changed'},409);
        return reply(result);
    }catch{return reply({error:'list_unavailable'},503);}
}
