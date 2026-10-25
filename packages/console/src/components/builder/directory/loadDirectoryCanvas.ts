import { directoryLayoutQueries, projectDirectoryRecords, projectRelativeSiteLinks, projectTemplatePresentation, landingQueryParams, projectDirectoryBrowsing, type SiteConfigurationDraft } from '@frontbase/edge-core/directory/configuration';
import {resolveValue,contextReader} from '@frontbase/edge-core/conditions';
import type { PageLayoutLike } from '@/lib/builder/iframeTypes';

/** Resolve registered authoring requests before the shared SW/network renderer. */
export async function loadDirectoryCanvas(layout: PageLayoutLike, saved: SiteConfigurationDraft, signal: AbortSignal, previewCollection?: 'institution'|'program'): Promise<PageLayoutLike> {
    const rows = new Map<string, Record<string, unknown>[]>();
    let recordContext:Record<string,unknown>={};
    let pageSize=saved.configuration.browsing.pageSize as number;
    let captureHash:string|undefined,configuration=saved.configuration,hasNext=false,total:number|undefined;
    const role=(layout.root?.siteConfiguration as {role?:string}|undefined)?.role;
    const inactive=new Set<string>();let q='',sort:'title-asc'|'title-desc'='title-asc',match:'contains'|'startsWith'|'equals'='contains',page=1;
    for (const { id, binding } of directoryLayoutQueries(layout)) {
        const [, role, mode] = binding.queryId.split('.');
        const params=landingQueryParams(layout,id,binding.params);
        const response = await fetch('/api/project/site-configuration/preview/', { method: 'POST', credentials: 'include', signal,
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source:'published',expectedCapture:captureHash,expectedRevision: saved.revision, role, mode, params }) });
        if (!response.ok) throw new Error('Directory preview unavailable; reload shared settings and check the query.');
        const result = await response.json();
        if (result.revision !== saved.revision || result.queryId !== binding.queryId || !Array.isArray(result.rows)) throw new Error('Directory preview revision mismatch');
        if(result.captureHash){captureHash=result.captureHash;configuration=result.configuration;}
        const pageRole=(layout.root?.siteConfiguration as {role?:string}|undefined)?.role;
        if(pageRole==='directory' && mode==='list' && ['institution','program'].includes(role) && role!==(previewCollection||configuration.browsing.defaultCollection)){inactive.add(id);continue;}
        if(mode==='list'){pageSize=result.pageSize??Math.min(('limit' in params?params.limit:undefined)||configuration.browsing.pageSize,configuration.browsing.pageSize);hasNext=!!result.hasMore;total=result.total;q=('q' in params?params.q:'')||'';sort=('sort' in params?params.sort:undefined)||'title-asc';match=('match' in params?params.match:undefined)||'contains';page=Math.floor((('offset' in params?params.offset:0)||0)/pageSize)+1;}
        rows.set(id, result.rows);
        if(mode==='detail'&&role===(layout.root?.siteConfiguration as {role?:string}|undefined)?.role&&result.rows[0])recordContext={recordId:result.rows[0].id,parentId:result.rows[0].institutionId??result.rows[0].cityId??null};
    }
    const bindContext=(nodes:PageLayoutLike['content']):PageLayoutLike['content']=>nodes.map(node=>{const binding=node.props?.binding;return {...node,...(binding?{props:{...node.props,...(node.type==='Repeater'&&!Array.isArray(node.props.initialRows)?{localeReadOnly:false}:{}),binding:{...binding,hiddenFilters:(binding.hiddenFilters??[]).map((filter:any)=>filter.value?.kind==='variable'&&['page.recordId','page.parentId'].includes(filter.value.path)?{...filter,value:resolveValue(filter.value,contextReader({page:recordContext}))??null}:filter)}}}:{}),...(node.children?{children:bindContext(node.children)}:{})};});
    const prune=(nodes:PageLayoutLike['content']):PageLayoutLike['content']=>nodes.filter(node=>!inactive.has(node.id)).map(node=>({...node,...(node.children?{children:prune(node.children)}:{})}));
    let projected=projectDirectoryRecords({...layout,root:{...layout.root,publicationRecordContext:recordContext},content:bindContext(prune(layout.content))},rows,{locale:configuration.site.locale});
    if(role==='directory'||role==='article-index')projected=projectDirectoryBrowsing(projected,[{path:role==='directory'?configuration.routes.directory:configuration.routes.blog,collection:role==='directory'?(previewCollection||configuration.browsing.defaultCollection):null,q,page,hasNext,total,pageSize,searchEnabled:configuration.browsing.search,sort,match}]);
    return projectRelativeSiteLinks(projectTemplatePresentation(projected,saved.configuration),configuration.site.origin);
}

/** Selection changes only the canvas visitor state, never the saved URL/default. */
export function selectedDirectoryCollection(layout:PageLayoutLike|undefined,selectedId:string|null):'institution'|'program'|undefined {
 if(!layout||!selectedId)return;
 const walk=(nodes:PageLayoutLike['content'],parent?:'institution'|'program'):'institution'|'program'|undefined=>{for(const node of nodes){const query=node.props.directoryQuery?.queryId;const current=query==='directory.institution.list'?'institution':query==='directory.program.list'?'program':parent;if(node.id===selectedId)return current;const result=walk(node.children||[],current);if(result)return result;}};
 return walk(layout.content);
}
