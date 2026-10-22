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
import { freshLocalizedIndexTitles, type LocalizedCatalogEntry } from './site-publication-chunk-queries.js';
import {liveViewBindingSchema} from '@frontbase/edge-core/directory/configuration';
import {projectFrontendCopyRows} from './frontend-copy.js';

export type PublishedLiveQuery=(owner:string,binding:Record<string,any>,query:Record<string,any>,request:Request)=>Promise<{rows:Record<string,unknown>[];total:number}>;

export const publicationListRequestSchema = z.object({ componentId:z.string().min(1).max(200),versionId:z.string().min(1).max(128).default('default'),
    page:z.number().int().min(0).max(20000),pageSize:z.number().int().min(1).max(48),
    sortColumn:z.enum(['title','id']).default('title'),direction:z.enum(['asc','desc']).default('asc'),
    filters:z.array(z.object({column:z.enum(['title','id','parentId','institutionId']),op:z.enum(['eq','neq','gt','gte','lt','lte','contains','in','is_null','not_null']),value:z.unknown().optional()}).strict()).max(50)
}).strict();
const liveColumn=z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(128);
const liveListRequestSchema=publicationListRequestSchema.extend({search:z.string().max(512).default(''),pageSize:z.number().int().min(1).max(100),sortColumn:liveColumn.default('title'),filters:z.array(z.object({column:liveColumn,op:z.enum(['eq','neq','gt','gte','lt','lte','contains','starts_with','ends_with','in','is_null','not_null']),value:z.unknown().optional()}).strict()).max(50)});
const collections = ['institutions','programs','articles'] as const;
export const publicationListBindingSchema=z.object({dataSourceId:z.literal('frontbase:publication'),tableName:z.enum(collections),source:z.object({kind:z.literal('publication'),hash:z.string().regex(/^[a-f0-9]{64}$/)}).passthrough()}).passthrough();

/** Released text a record row renders, keyed `${collection}:${id}` → column. Freshness is
 *  validated against the ROW's own value at apply time, so a pinned snapshot always agrees
 *  with the text it returns. */
function localizedRowText(catalog:readonly LocalizedCatalogEntry[]|undefined){
    const textByRecord=new Map<string,Map<string,{text:string;sourceText?:string}>>();
    if(catalog)for(const item of catalog){
        if(!item.record||!item.text.trim())continue;
        const fieldKey=item.fieldKey??'';
        if(!['title','summary','coverAlt','byline'].includes(fieldKey))continue;
        const key=item.record.collection+':'+String(item.record.key.find(part=>part.column==='id')?.value);
        let fields=textByRecord.get(key);
        if(!fields){fields=new Map();textByRecord.set(key,fields);}
        if(!fields.has(fieldKey))fields.set(fieldKey,{text:item.text,sourceText:item.sourceText});
    }
    return textByRecord;
}

export async function readPublicationList(db:DbRunner,owner:string,bindingInput:unknown,input:unknown,catalog?:readonly LocalizedCatalogEntry[]){
    const binding=publicationListBindingSchema.parse(bindingInput),query=publicationListRequestSchema.parse(input);
    if(!await new SitePublicationReviewStore(db,owner).get(binding.source.hash))throw Error('snapshot_unavailable');
    const source=await new SitePublicationStore(db,owner).getVersion(binding.source.hash);
    if(source?.schemaVersion!==2)throw Error('snapshot_unavailable');
    const {page:pageNumber,pageSize,filters,direction,sortColumn}=query;
    // Per-element page size is validated against the snapshot adapter's hard
    // 48-row bound. The legacy global page size remains a legacy-path default.
    // Localized semantics intersect the release with THIS snapshot's index: title equality/
    // containment and title sorting run on fresh released titles; every other column and
    // operator keeps source values, and membership stays the pinned index alone.
    const plan=catalog?freshLocalizedIndexTitles(catalog,new Map<string,string>(source.index.map(row=>[`${row.collection}:${row.id}`,row.title] as const))):undefined;
    const effectiveTitle=(row:typeof source.index[number])=>plan?.get(`${row.collection}:${row.id}`)??String(row.title);
    const entries=source.index.filter(row=>row.collection===binding.tableName).filter(row=>filters.every(filter=>{
        if(plan&&filter.column==='title'&&(filter.op==='eq'||filter.op==='contains')){const left=effectiveTitle(row).toLowerCase(),right=String(filter.value??'').toLowerCase();
            return filter.op==='eq'?left===right:left.includes(right);}
        const value=filter.column==='institutionId'?row.parentId:(row as any)[filter.column];
        const operator=filter.op==='is_null'?'eq':filter.op==='not_null'?'neq':filter.op;
        return evaluateCondition({left:{kind:'literal',value:value??null},operator,right:{kind:'literal',value:(filter.op==='is_null'||filter.op==='not_null'?null:filter.value) as any}},()=>undefined);
    }));
    entries.sort((a,b)=>{const av=plan&&sortColumn==='title'?effectiveTitle(a):String(a[sortColumn]),bv=plan&&sortColumn==='title'?effectiveTitle(b):String(b[sortColumn]);return (av<bv?-1:av>bv?1:0)*(direction==='desc'?-1:1)||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);});
    const rows:Record<string,unknown>[]=[],store=new SitePublicationManifestStore(db,owner),loaded=new Map<string,Awaited<ReturnType<typeof store.loadChunk>>>();
    const loadChunk=store.chunkReader(source);
    const selectedEntries=entries.slice(pageNumber*pageSize,(pageNumber+1)*pageSize),textByRecord=localizedRowText(catalog);
    for(const entry of selectedEntries){
        let chunk=loaded.get(entry.chunkHash);
        if(!chunk){const reference=source.chunks.find(chunk=>chunk.hash===entry.chunkHash);if(!reference)throw Error();chunk=await loadChunk(reference);loaded.set(entry.chunkHash,chunk);}
        const row=chunk.records[entry.position];if(!row)throw Error();rows.push(Object.fromEntries(Object.entries(row).filter(([key])=>key!=='body')));
    }
    if(binding.tableName==='articles')await verifyManifestEditorial(db,owner,source,rows);
    if(textByRecord.size)for(let i=0;i<rows.length;i++){const entry=selectedEntries[i]!,row=rows[i]!,fields=textByRecord.get(entry.collection+':'+String(entry.id));
        if(fields)for(const [fieldKey,localized] of fields){const current=row[fieldKey];
            if(typeof current==='string'&&(localized.sourceText===undefined||localized.sourceText===current))row[fieldKey]=localized.text;}}
    return {rows,total:entries.length,captureHash:binding.source.hash};
}

/** One bounded full-dataset scan for a localized live query (the rpc page-size ceiling). Beyond
 *  it no honest full-dataset ordering exists, so the localized serve refuses instead of silently
 *  sorting a window. */
export const LIVE_LOCALIZED_SCAN=1000;
/** Full-dataset localized semantics for one live view: released record text that is still fresh
 *  against the current row (the same per-unit rule the display join applies) drives text
 *  filters and sorting on those columns across the WHOLE result before paging; every other
 *  operator keeps source values — exact semantics for non-text columns — and membership stays
 *  live. The same path serves initial HTML and the page-scoped browser continuation. */
export async function readLocalizedLiveList(owner:string,binding:Record<string,any>,query:Record<string,any>,request:Request,liveQuery:PublishedLiveQuery,catalog:readonly LocalizedCatalogEntry[]):Promise<{rows:Record<string,unknown>[];total:number}>{
    const columns=new Set(catalog.filter(item=>item.record?.connectionId===String(binding.dataSourceId)&&item.record.collection===binding.tableName).map(item=>item.fieldKey??item.path?.at(-1)??'').filter(column=>column!=='id'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)));
    const released=new Map<string,Map<string,{text:string;sourceText?:string}>>();
    for(const item of catalog){
        if(!item.record||!item.text.trim())continue;
        if(item.record.connectionId!==String(binding.dataSourceId)||item.record.collection!==binding.tableName)continue;
        // Repeater-row units carry no explicit fieldKey; the pipeline names their column by path tail.
        const fieldKey=item.fieldKey??item.path?.at(-1)??'';
        if(!columns.has(fieldKey))continue;
        const key=String(item.record.key.find(part=>part.column==='id')?.value);
        let fields=released.get(key);
        if(!fields){fields=new Map();released.set(key,fields);}
        if(!fields.has(fieldKey))fields.set(fieldKey,{text:item.text,sourceText:item.sourceText});
    }
    const localized=!!query.search||query.filters.some((filter:Record<string,any>)=>columns.has(filter.column)&&['eq','neq','contains','starts_with','ends_with','in'].includes(filter.op))||columns.has(query.sortColumn);
    if(!released.size)return liveQuery(owner,binding,query,request);
    // Always join released row text, even when sorting/filtering uses a numeric source column.
    if(!localized){const result=await liveQuery(owner,binding,query,request);return {...result,rows:result.rows.map(row=>{const copy={...row};for(const column of columns){const field=released.get(String(row.id))?.get(column);if(field&&typeof row[column]==='string'&&(field.sourceText===undefined||field.sourceText===row[column]))copy[column]=field.text;}return copy;})};}
    const full=await liveQuery(owner,binding,{...query,page:0,pageSize:LIVE_LOCALIZED_SCAN,search:'',
        // Localized predicates must not prefilter source strings before the effective-text join.
        filters:[...(query.sourceFilters??[]),...query.filters.filter((filter:Record<string,any>)=>!columns.has(filter.column))]},request);
    if(full.total>LIVE_LOCALIZED_SCAN)throw Error('localized_live_query_beyond_cap');
    const effective=(row:Record<string,unknown>,column:string)=>{const entry=released.get(String(row.id))?.get(column);
        return entry&&(entry.sourceText===undefined||entry.sourceText===String(row[column]??''))?entry.text:String(row[column]??'');};
    const textOf=(row:Record<string,unknown>,column:string)=>columns.has(column)?effective(row,column):String(row[column]??'');
    const filtered=full.rows.filter(row=>(!query.search||(binding.searchColumns?.length?binding.searchColumns:['title']).some((column:string)=>textOf(row,column).toLowerCase().includes(String(query.search).toLowerCase())))&&query.filters.every((filter:Record<string,any>)=>{
        const op=String(filter.op??'eq');
        if(columns.has(filter.column)&&op==='neq')return textOf(row,filter.column).toLowerCase()!==String(filter.value??'').toLowerCase();
        if(columns.has(filter.column)&&op==='in')return Array.isArray(filter.value)&&filter.value.some((value:unknown)=>textOf(row,filter.column).toLowerCase()===String(value??'').toLowerCase());
        if(['eq','contains','starts_with','ends_with'].includes(op)){
            const left=textOf(row,filter.column).toLowerCase(),right=String(filter.value??'').toLowerCase();
            return op==='eq'?left===right:op==='contains'?left.includes(right):op==='starts_with'?left.startsWith(right):left.endsWith(right);}
        if(op==='is_null')return row[filter.column]===null||row[filter.column]===undefined;
        if(op==='not_null')return !(row[filter.column]===null||row[filter.column]===undefined);
        return evaluateCondition({left:{kind:'literal',value:(row[filter.column]??null) as any},operator:op as any,right:{kind:'literal',value:filter.value as any}},()=>undefined);}));
    if(columns.has(query.sortColumn))filtered.sort((a,b)=>{const av=textOf(a,query.sortColumn),bv=textOf(b,query.sortColumn);
        return (av<bv?-1:av>bv?1:0)*(query.direction==='desc'?-1:1)||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);});
    const page=Math.max(0,Number(query.page)||0);
    const rows=filtered.slice(page*query.pageSize,(page+1)*query.pageSize).map(row=>{
        const copy={...row};for(const column of columns)if(typeof row[column]==='string')copy[column]=effective(row,column);return copy;
    });
    return {rows,total:filtered.length};
}

/** Resolve only the selected source for initial HTML; alternatives stay query-free. The optional
 *  catalog localizes pinned publication reads (query + returned text) and gives live views
 *  full-dataset localized sort/filter semantics (readLocalizedLiveList); without a catalog live
 *  views keep coherent source semantics. */
export async function projectPublicationListRows(layout:PageLayoutData,db:DbRunner,owner:string,request:Request,user:Record<string,unknown>|null=null,liveQuery?:PublishedLiveQuery,catalog?:readonly LocalizedCatalogEntry[]):Promise<PageLayoutData>{
    const url=new URL(request.url),read=contextReader({url:Object.fromEntries(url.searchParams),user});
    const walk=async(nodes:PageComponent[]):Promise<PageComponent[]>=>Promise.all(nodes.map(async node=>{
        const versionId=selectBlockVersion(node,read),effective=applyBlockVersion(node,versionId),binding=effective.props?.binding as any;
        let result=node;
        if(binding?.source?.kind==='publication'||binding&&!binding.source){
            const live=!binding.source;
            if(live){liveViewBindingSchema.parse(binding);if(!liveQuery)throw Error('live_list_resolver_unavailable');}
            const controls=effective.props?.controls as any??{};
            const page=Math.max(0,Number(url.searchParams.get('page')||1)-1),search=url.searchParams.get('q')??'';
            const sourceFilters=[...Object.entries(binding.filtering?.filters??{}).filter(([,value])=>value!==undefined&&value!=='').map(([column,value])=>({column,op:'eq',value})),
                ...(binding.hiddenFilters??[]).filter((filter:any)=>filter.when===undefined||evaluateCondition(filter.when,read)).map((filter:any)=>({column:filter.column,op:filter.operator,value:resolveValue(filter.value,read)}))];
            const filters=[...sourceFilters,...(search&&controls.searchColumn?[{column:controls.searchColumn,op:'contains',value:search}]:[])];
            const query={componentId:node.id,versionId,page,...(live?{sourceFilters}:{}),pageSize:binding.pagination?.pageSize??12,sortColumn:binding.sorting?.column??'title',direction:binding.sorting?.direction??'asc',filters};
            const records=live?(catalog?await readLocalizedLiveList(owner,binding,query,request,liveQuery!,catalog):await liveQuery!(owner,binding,query,request)):await readPublicationList(db,owner,binding,query,catalog);
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

/** Same public page/host boundary, exact reviewed element binding; no arbitrary datasource access.
 *  The optional localized request (resolved by the caller from the URL's locale prefix) strips the
 *  prefix for the artifact walk and serves query+text through the page's own release catalog. */
export async function publicationListResponse(db:DbRunner,owner:string,request:Request,audience:VerifiedMenuAudience|null,localized?:{locale:string;path:string;catalog?:readonly LocalizedCatalogEntry[]},liveQuery?:PublishedLiveQuery):Promise<Response|null> {
    const raw=request.headers.get('X-Frontbase-List');if(!raw)return null;
    const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
    // Content-Language is declared only where the payload actually carries released localized
    // text (a prefix without a path-matched release keeps pure source semantics — never claim
    // a language the body does not carry); error replies stay undeclared.
    const reply=(body:unknown,status=200,extra?:Record<string,string>)=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
    if(raw.length>8192)return reply({error:'invalid_list_request'},422);
    let parsed:ReturnType<typeof liveListRequestSchema.safeParse>;try{parsed=liveListRequestSchema.safeParse(JSON.parse(decodeURIComponent(raw)));}catch{return reply({error:'invalid_list_request'},422);}
    if(!parsed.success)return reply({error:'invalid_list_request'},422);
    const input=parsed.data;
    try{
        const active=await new SitePublicationStore(db,owner).activeVersion();
        if(!active || active.artifact.schemaVersion!==2 || !await new SitePublicationReviewStore(db,owner).get(active.pointer.hash))return reply({error:'list_unavailable'},503);
        const artifact=active.artifact,url=new URL(request.url),path=localized?localized.path:url.pathname;
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
        let result;
        if(binding?.source?.kind==='publication'&&binding.dataSourceId==='frontbase:publication'&&collections.includes(binding.tableName)){
            const {search,...query}=input;
            result=await readPublicationList(db,owner,binding,{...query,filters:[...query.filters,...search?[{column:'title',op:'contains',value:search}]:[]]},localized?.catalog);
        }else if(binding&&!binding.source&&liveQuery){
            const admitted=liveViewBindingSchema.parse(binding);
            const mandatory=[...Object.entries(admitted.filtering.filters).filter(([,value])=>value!==undefined&&value!=='').map(([column,value])=>({column,op:'eq',value})),
                ...(admitted.hiddenFilters??[]).filter((filter:any)=>filter.when===undefined||evaluateCondition(filter.when,read)).map((filter:any)=>({column:filter.column,op:filter.operator,value:resolveValue(filter.value,read)}))];
            const query={...input,sourceFilters:mandatory,filters:[...mandatory,...input.filters]};
            result=localized?.catalog?await readLocalizedLiveList(owner,admitted,query,request,liveQuery,localized.catalog):await liveQuery(owner,admitted,query,request);
        }else return reply({error:'list_unavailable'},404);
        if((await new SitePublicationStore(db,owner).activeVersion())?.pointer.hash!==active.pointer.hash)return reply({error:'publication_changed'},409);
        result={...result,rows:await projectFrontendCopyRows(db,owner,binding,result.rows,localized?.locale??artifact.configuration.site.locale)};
        return reply(result,200,localized?.catalog?{'Content-Language':localized.locale}:undefined);
    }catch{return reply({error:'list_unavailable'},503);}
}
