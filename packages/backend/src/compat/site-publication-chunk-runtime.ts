import type { DbRunner } from '@frontbase/edge-infra';
import { buildSiteManifest } from '@frontbase/compiler/manifest';
import { directoryLayoutQueries, projectDirectoryRecords, projectSharedDirectoryPreview, projectDirectoryBrowsing, projectRelativeSiteLinks, projectTemplatePresentation, readLandingSettings, landingQueryParams } from '@frontbase/edge-core/directory/configuration';
import type { PageLayoutData, EngineOptions, PageEntry } from '@frontbase/edge-core';
import { publicationPathSchema } from '@frontbase/edge-core/directory/publication';
import { sitePublicationManifestSchema, type SitePublicationManifest } from './site-publication-manifest.js';
import { createChunkDirectoryQueries,localizedIndexTitleReader,type LocalizedQueryPlan } from './site-publication-chunk-queries.js';
import { PublicationRequestError } from './site-publication-runtime.js';
import { projectPublicationListRows,type PublishedLiveQuery } from './publication-list-source.js';

/** Existing renderer/query projection; immutable chunks only, never canonical/draft reads. */
export async function resolveChunkPublicationPage(input:SitePublicationManifest,hash:string,owner:string,db:DbRunner,request:Request,user:Record<string,unknown>|null=null,liveQuery?:PublishedLiveQuery,localizedTitles?:LocalizedQueryPlan):Promise<{page:PageEntry;version:string;cacheKey:string;document:NonNullable<EngineOptions['document']>}|null>{
    if(!owner || !/^[a-f0-9]{64}$/.test(hash))throw new Error('publication_context_required');
    const artifact=sitePublicationManifestSchema.parse(input),url=new URL(request.url),path=url.pathname;
    if(!publicationPathSchema.safeParse(path).success)return null;
    const staticPage=artifact.staticPages?.find(page=>page.originalPath===path),entry=artifact.index.find(row=>row.originalPath===path);
    const role=staticPage?'static':entry?({institutions:'institution',programs:'program',articles:'article',pages:'editorial',cities:''}[entry.collection])
        :path===artifact.configuration.routes.directory && artifact.index.some(row=>['institutions','programs'].includes(row.collection))?'directory'
        :path===artifact.configuration.routes.blog && artifact.index.some(row=>row.collection==='articles')?'article-index':undefined;
    if(!role)return null;
    const template=staticPage??artifact.templates.find(page=>page.role===role);if(!template)throw new Error('publication_template_unavailable');
    const layout=template.layout as unknown as PageLayoutData;
    const allowed=role==='directory'?['type','q','page','sort','match']:role==='article-index'?['q','page','sort','match']:[];
    for(const key of url.searchParams.keys())if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)throw new PublicationRequestError();
    const requestedType=url.searchParams.get('type')??artifact.configuration.browsing.defaultCollection;
    const standard=!!(layout.root as any)?.standardListComponents;
    if(role==='directory' && !['institution','program'].includes(requestedType) && !standard)throw new PublicationRequestError();
    // Legacy browsing projection still has a bounded collection contract. The
    // ordinary version condition reads the original URL and falls back itself.
    const type=standard&&requestedType!=='program'?'institution':requestedType;
    const listBinding=['directory','article-index'].includes(role)?directoryLayoutQueries(layout).find(query=>query.binding.queryId===`directory.${role==='article-index'?'article':type}.list`):undefined;
    const defaults=(listBinding?.binding.params??{}) as {sort?:string;match?:string;limit?:number};
    const pageSize=Math.min(defaults.limit??artifact.configuration.browsing.pageSize,artifact.configuration.browsing.pageSize);
    const sort=url.searchParams.get('sort')??defaults.sort??'title-asc',match=url.searchParams.get('match')??defaults.match??'contains';
    if(!['title-asc','title-desc'].includes(sort)||!['contains','startsWith','equals'].includes(match))throw new PublicationRequestError();
    const page=url.searchParams.get('page')??'1',search=(url.searchParams.get('q')??'').trim();
    if(!/^[1-9][0-9]{0,4}$/.test(page)||search.length>100)throw new PublicationRequestError();
    const offset=(Number(page)-1)*pageSize;if(offset>19999)throw new PublicationRequestError();
    const queries=createChunkDirectoryQueries(artifact,owner,db,localizedTitles?.titles);
    const roleQuery=role==='editorial'?'page':role;
    let row:Record<string,unknown>|undefined;
    if(entry){const query=queries[`directory.${roleQuery}.detail`];if(!query)throw new Error('publication_query_unavailable');row=(await query.execute({path},{tenant:owner,request}))[0];if(!row)throw new Error('publication_chunk_unavailable');}
    const records=new Map<string,Record<string,unknown>[]>(),inactive=new Set<string>(),normalized:Record<string,unknown>={};let hasNext=false;
    for(const query of directoryLayoutQueries(layout)){
        const [,collection,mode]=query.binding.queryId.split('.');
        if(role==='directory' && mode==='list' && ['institution','program'].includes(collection!) && collection!==type){inactive.add(query.id);continue;}
        const parentPath=role==='program' && collection==='institution' && entry?artifact.index.find(parent=>parent.collection==='institutions' && String(parent.id)===String(entry.parentId))?.originalPath:undefined;
const params:Record<string,unknown>=mode==='detail'?{path:parentPath??path}:role==='static'?{...query.binding.params,limit:Math.min(Number((query.binding.params as Record<string,unknown>).limit??pageSize),pageSize)}:{q:search,sort,match,offset,limit:pageSize,
            ...(role==='institution' && collection==='program' && row?{institutionId:row.id}:{})};
        if(role==='static' && mode==='list')Object.assign(params,landingQueryParams(layout,query.id,params));
        const registered=queries[query.binding.queryId];if(!registered)throw new Error('publication_query_unavailable');
        const rows=await registered.execute(params,{tenant:owner,request});
        if((role==='directory' && collection===type || role==='article-index' && collection==='article') && mode==='list')hasNext ||= rows.length>pageSize;
        records.set(query.id,rows.slice(0,mode==='detail'?1:Number(params.limit)));normalized[query.id]=params;
    }
    const prune=(nodes:PageLayoutData['content']):PageLayoutData['content']=>nodes.filter(node=>!inactive.has(node.id)).map(node=>({...node,...(node.children?{children:prune(node.children)}:{})}));
    let projected=projectDirectoryRecords(projectSharedDirectoryPreview({...layout,content:prune(layout.content)},artifact.configuration),records,{locale:artifact.configuration.site.locale});
    if(role==='directory'||role==='article-index'){const titleOf=localizedIndexTitleReader(localizedTitles?.titles);
    projected=projectDirectoryBrowsing(projected,[{path,collection:role==='directory'?type as 'institution'|'program':null,q:search,page:Number(page),sort:sort as 'title-asc'|'title-desc',match:match as 'contains'|'startsWith'|'equals',pageSize:pageSize,total:artifact.index.filter(row=>row.collection===(role==='article-index'?'articles':type==='program'?'programs':'institutions')).filter(row=>!search || (match==='equals'?titleOf(row).toLowerCase()===search.toLowerCase():match==='startsWith'?titleOf(row).toLowerCase().startsWith(search.toLowerCase()):titleOf(row).toLowerCase().includes(search.toLowerCase()))).length,searchEnabled:artifact.configuration.browsing.search,hasNext:hasNext && offset+pageSize<=19999}]);}
    projected=projectTemplatePresentation(projected,artifact.configuration,artifact.staticPages?.find(page=>page.originalPath==='/')?readLandingSettings(artifact.staticPages.find(page=>page.originalPath==='/')!.layout as unknown as PageLayoutData):undefined);
    projected=projectRelativeSiteLinks(projected,artifact.configuration.site.origin);
    const title=typeof row?.title==='string'?row.title:template.title,description=typeof row?.summary==='string'?row.summary:template.description;
    projected=await projectPublicationListRows(projected,db,owner,request,user,liveQuery,localizedTitles?.catalog);
    const built=buildSiteManifest({pages:{[path]:{title,slug:path.replace(/^\//,''),description,layout:projected as unknown as Record<string,unknown>}},queries:{},versionPrefix:hash});
    const canonicalUrl=new URL(path,artifact.configuration.site.origin).href;
    return {page:built.pages[path]!,version:built.version,cacheKey:JSON.stringify([owner,hash,path,normalized]),document:{faviconUrl:'',language:typeof row?.language==='string'?row.language:artifact.configuration.site.locale||'en',canonicalUrl,robots:url.searchParams.size?'noindex, follow':'index, follow',
        openGraph:{title,description,url:canonicalUrl,type:role==='article'?'article':'website',siteName:artifact.configuration.site.name,...(typeof row?.cover==='string'?{image:row.cover,imageAlt:typeof row.coverAlt==='string'?row.coverAlt:''}:{})}}};
}
