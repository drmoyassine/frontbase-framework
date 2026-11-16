import type {DbRunner} from '@frontbase/edge-infra';
import type {QueryRegistry} from '@frontbase/compiler';
import type {PageLayoutData,PageEntry,EngineOptions} from '@frontbase/edge-core';
import {runtimeFeatures} from '@frontbase/edge-core';
import {compileDirectoryProjection,restorePublishedDirectoryProjection,projectSharedDirectoryPreview,projectRelativeSiteLinks,projectDirectoryBrowsing,type PublishedDirectoryProjectionPlan} from '@frontbase/edge-core/directory/configuration';
import {publicationPathSchema} from '@frontbase/edge-core/directory/publication';
import {localeDirection} from '@frontbase/edge-core/localization';
import {projectPublicationListRows,type PublishedLiveQuery,type LiveListRequest} from './publication-list-source.js';
import {templatePolicyPresentation} from './template-policy-runtime.js';
import type {LiveLayoutIndex, LoadLiveLayout} from './live-layout-publication.js';

const directoryPlans = new WeakMap<PageLayoutData, ReturnType<typeof compileDirectoryProjection>>();

function directoryPlan(layout: PageLayoutData,published?:PublishedDirectoryProjectionPlan) {
    let plan = directoryPlans.get(layout);
    if (plan) return plan;
    plan = published ? restorePublishedDirectoryProjection(layout,published) : compileDirectoryProjection(layout);
    if (Object.isFrozen(layout)) directoryPlans.set(layout, plan);
    return plan;
}

const layoutFeatures=new WeakMap<PageLayoutData,NonNullable<EngineOptions['features']>&{legacyMenuRegion:boolean}>();
/** Compute the four per-render whole-tree flags once per frozen published layout:
 * the exact renderPage runtime-feature walk over the content subtree, the engine's
 * non-empty-versions probe for public-tree projection, and the pre-composition
 * legacy menu region scan. Projection and localization are key-pure for these
 * flags (they never add versions/visibilityCondition/hiddenFilters keys), so the
 * authored-layout result equals what per-request walks would produce. */
export function liveLayoutFeatures(layout:PageLayoutData):NonNullable<EngineOptions['features']>&{legacyMenuRegion:boolean}{
    const cached=layoutFeatures.get(layout);if(cached)return cached;
    type LayoutNodes=PageLayoutData['content']|undefined;
 const {versions,conditions}=runtimeFeatures({content:layout.content} as unknown as PageLayoutData);
    const arrays=(nodes:LayoutNodes):boolean=>(nodes??[]).some(node=>!!node.versions?.length||arrays(node.children as LayoutNodes));
    const legacy=(nodes:LayoutNodes):boolean=>(nodes??[]).some(node=>node.type==='Navbar'||node.type==='Footer'||node.props?.sharedSiteHeader===true||legacy(node.children as LayoutNodes));
    const features={versions,versionsArrays:arrays(layout.content),conditions,legacyMenuRegion:legacy(layout.content)};
    if(Object.isFrozen(layout))layoutFeatures.set(layout,features);
    return features;
}

export class LivePageRequestError extends Error{}
export type LiveRoute={role:'institution'|'program'|'article'|'editorial';row:Record<string,unknown>};
export interface LivePageReader{
    close?():void|Promise<void>;
    queries:QueryRegistry;
    liveQuery:PublishedLiveQuery;
    /** Current eligible records only, with ambiguity refusal. No saved route index. */
    resolveRoute(path:string):Promise<LiveRoute|null>;
}

/** Rendering input contains the published structure plus request-local current records.
 * Neither route selection nor list membership consults a content publication/catalog. */
export async function resolveLiveLayoutPage(
    publication:LiveLayoutIndex,version:string,owner:string,db:DbRunner,request:Request,
    reader:LivePageReader,locale=publication.configuration.site.locale,user:Record<string,unknown>|null=null,list?:LiveListRequest, loadLayout?:LoadLiveLayout,
):Promise<{sourcePageId:string;authored:PageLayoutData;displayPlan?:Awaited<ReturnType<LoadLiveLayout>>['displayPlan'];translationIds?:Awaited<ReturnType<LoadLiveLayout>>['translationIds'];features:NonNullable<EngineOptions['features']>&{legacyMenuRegion:boolean};page:PageEntry;document:NonNullable<EngineOptions['document']>;record:Record<string,unknown>;context:Record<string,unknown>}|null>{
    if(!owner||!publication.locales.includes(locale))throw Error('live_page_context_required');
    const url=new URL(request.url),path=url.pathname,c=publication.configuration;
    if(!publicationPathSchema.safeParse(path).success)return null;
    const staticPage=publication.staticPages.find(page=>page.originalPath===path);
    const listing=path===c.routes.directory?'directory':path===c.routes.blog?'article-index':undefined;
    const route=staticPage||listing?null:await reader.resolveRoute(path);
    const role=staticPage?'static':listing??route?.role;
    if(!role)return null;
    const template=staticPage??publication.templates.find(page=>page.role===role);
    if(!template)return null;
    const allowed=listing==='directory'?['type','q','page','sort','match']:listing?['q','page','sort','match']:[];
    for(const key of url.searchParams.keys())if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)throw new LivePageRequestError('invalid_page_query');
    const type=url.searchParams.get('type')??c.browsing.defaultCollection;
    if(listing==='directory'&&!['institution','program'].includes(type))throw new LivePageRequestError('invalid_collection');
    const pageText=url.searchParams.get('page')??'1',search=(url.searchParams.get('q')??'').trim();
    const sort=url.searchParams.get('sort')??'title-asc',match=url.searchParams.get('match')??'contains';
    if(!/^[1-9][0-9]{0,4}$/.test(pageText)||search.length>100||!['title-asc','title-desc'].includes(sort)||!['contains','startsWith','equals'].includes(match))throw new LivePageRequestError('invalid_page_query');
    const page=Number(pageText),limit=c.browsing.pageSize,offset=(page-1)*limit;
    if(offset>19999)throw new LivePageRequestError('invalid_page_query');
    const row=route?.row;
    const context={path,locale,siteName:c.site.name,...(row?{recordId:row.id,parentId:row.institutionId??row.cityId??null,collection:role==='institution'?'institutions':role==='program'?'programs':role==='article'?'articles':'pages'}:{})};
    const read=async(id:string,params:Record<string,unknown>)=>{
        const query=reader.queries[id];if(!query)throw Error('live_query_unavailable');
        return query.execute(params,{tenant:owner,request,user});
    };
    const artifact = loadLayout ? await loadLayout(template) : undefined;
    const authored = artifact?.layout ?? ('layout' in template ? template.layout as unknown as PageLayoutData : undefined);
    if (!authored) throw Error('published_layout_artifact_unavailable');
    const layout = publication.siteBindingsCompiled ? authored : projectSharedDirectoryPreview(authored, c);
    const plan = directoryPlan(layout,artifact?.directoryPlan);
    const records=new Map<string,Record<string,unknown>[]>(),inactive=new Set<string>();
    const count = listing ? read('directory.' + (listing === 'article-index' ? 'article' : type) + '.count', { q: search, match, sort, limit }) : undefined;
    const [countRows] = await Promise.all([count, ...plan.queries.map(async query=>{
        const [,collection,mode]=query.binding.queryId.split('.');
        if(listing==='directory'&&mode==='list'&&['institution','program'].includes(collection!)&&collection!==type){inactive.add(query.id);return;}
        if(mode==='detail'&&route&&collection===(role==='editorial'?'page':role)){records.set(query.id,[row!]);return;}
        const params:Record<string,unknown>=mode==='detail'?{path}:role==='static'
            ?{...query.binding.params,limit:query.landingLimit??limit}
            :{q:search,sort,match,offset,limit,...(role==='institution'&&collection==='program'?{institutionId:row!.id}:{})};
        if(mode==='detail'&&role==='program'&&collection==='institution'){
            // A related parent comes from a live relationship lookup, never a saved catalog.
            const parent=await read('directory.institution.detail',{id:row!.institutionId});
            records.set(query.id,parent);return;
        }
        records.set(query.id,(await read(query.binding.queryId,params)).slice(0,mode==='detail'?1:Number(params.limit)));
    })]);
    let projected = plan.project(records, { locale, inactive, liveDetailRecords: true });
    const sourceQuery:PublishedLiveQuery=async(scopedOwner,binding,query)=>{
        if(scopedOwner!==owner||binding.dataSourceId!=='frontbase:publication')throw Error('live_source_refused');
        const collection=({institutions:'institution',programs:'program',articles:'article'} as Record<string,string>)[binding.tableName];
        if(!collection)throw Error('live_source_refused');
        // Legacy source markers are resolved against the live configured source, never their hash.
        const filters=query.filters??[];
        if(filters.some((filter:any)=>!['title','institutionId'].includes(filter.column)))throw Error('live_source_filter_unsupported');
        const title=filters.find((filter:any)=>filter.column==='title');
        const parent=filters.find((filter:any)=>filter.column==='institutionId');
        if(title&&!['eq','contains','starts_with'].includes(title.op)||parent&&parent.op!=='eq')throw Error('live_source_filter_unsupported');
        const size=Math.min(query.pageSize,limit);
        const params={q:title?.value??'',match:title?.op==='eq'?'equals':title?.op==='starts_with'?'startsWith':'contains',
            sort:query.direction==='desc'?'title-desc':'title-asc',offset:query.page*size,limit:size,...(parent?{institutionId:parent.value}:{})};
        const [rows,count]=await Promise.all([read('directory.'+collection+'.list',params),read('directory.'+collection+'.count',params)]);
        return {rows:rows.slice(0,size),total:Number(count[0]!.total)};
    };
    projected=await projectPublicationListRows(projected,db,owner,request,user,reader.liveQuery,undefined,context,{sourceQuery,list});
    if(listing && countRows){
        const total=Number(countRows[0]!.total);
        projected=projectDirectoryBrowsing(projected,[{path,locale,collection:listing==='directory'?type as 'institution'|'program':null,q:search,page,sort:sort as 'title-asc'|'title-desc',match:match as 'contains'|'startsWith'|'equals',pageSize:limit,total,hasNext:offset+limit<total&&offset+limit<=19999,searchEnabled:c.browsing.search}]);
    }
    projected=projectRelativeSiteLinks(plan.projectPresentation(projected,c),c.site.origin);
    const presentation=templatePolicyPresentation(projected,row,row?context.collection+':'+row.id:'',locale,context);
    const title=presentation.values.title||String(row?.title??template.title),description=presentation.values.description||String(row?.summary??template.description);
    const canonicalUrl=new URL(locale===c.site.locale?path:'/'+locale+path,c.site.origin).href;
    return {sourcePageId:template.pageId,authored,displayPlan:artifact?.displayPlan,translationIds:artifact?.translationIds,features:liveLayoutFeatures(authored),record:presentation.record,context,
        page:{title,description,slug:path.slice(1),layout:presentation.layout},
        document:{language:locale,direction:localeDirection(locale),canonicalUrl,robots:url.search||presentation.values.indexing==='noindex'?'noindex, follow':'index, follow',
            openGraph:{title,description,url:canonicalUrl,type:role==='article'?'article':'website',siteName:c.site.name,locale}}};
}
