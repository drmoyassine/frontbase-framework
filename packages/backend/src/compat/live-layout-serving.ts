import {compileDisplaySurfacePlan,displayPlanInterpolations} from '@frontbase/edge-core/localization';
import type {DbRunner} from '@frontbase/edge-infra';
import {renderResolvedPageDocument,audienceConditionUser,type PageLayoutData} from '@frontbase/edge-core';
import type {VerifiedMenuAudience} from '@frontbase/edge-core/menus';
import {LiveLayoutPublicationStore,liveDisplayPlan} from './live-layout-publication.js';
import type {LiveLayoutIndex,LoadLiveLayout,LiveLayoutPointer} from './live-layout-publication.js';
import {liveLayoutReader,requestLiveLayoutHost,type LiveLayoutHost} from './live-layout-reader.js';
import {resolveLiveLayoutPage,LivePageRequestError} from './live-layout-runtime.js';
import {liveListRequestSchema,type PublishedLiveQuery,type LiveListRequest} from './publication-list-source.js';
import {applyBlockVersion,selectBlockVersion} from '@frontbase/edge-core/block-versions';
import {contextReader,evaluateCondition} from '@frontbase/edge-core/conditions';
import {templatePolicyPresentation,localizedPolicyRecord} from './template-policy-runtime.js';
import {resolveAppMenuLayout} from './menus-runtime.js';
import {configuredTranslationStorage} from './translation-storage.js';
import {localizeLiveLayout,type LiveDisplayField} from './live-translation.js';
import {captureMenuFields} from './translation-homepage.js';
import {addHomepageLanguageLinks} from './translation-homepage-serving.js';
import {projectFrontendCopy} from './frontend-copy.js';
import {reportReadFailure} from './read-failure.js';
import {liveLayoutSitemap} from './live-layout-sitemap.js';
import {livePageSettings} from './live-page-settings.js';
import {readProjectSettings} from './assets.js';
import {BOOKING_PALETTE_KEY} from './booking-site-palette.js';
import type {BookingPalette} from '@frontbase/edge-core/directory/configuration';

export interface LiveLayoutServingOptions{
    host:LiveLayoutHost;liveQuery:PublishedLiveQuery;swBundle?:string;frontendEditing?:boolean;
    /** Supplied only by the authenticated private preview route, never visitor input. */
    prepared?:{pointer:LiveLayoutPointer;layout:LiveLayoutIndex;loadLayout?:LoadLiveLayout};
    previewPalette?:BookingPalette;
    /** Private Builder projection. The live route must belong to this page. */
    previewDraft?:{pageId:string;layout:PageLayoutData};
    /** Only the authenticated inline layout draft needs unbound sample values. */
    bindingEditor?:boolean;
    resolveAudience?(owner:string,request:Request):Promise<VerifiedMenuAudience>;
}
export interface LiveLayoutSurface{layout:PageLayoutData;pageId:string;locale:string;sourceLocale:string;version:string;lists?:Record<string,{count:number}>;
    detailColumns?:import('@frontbase/edge-core').DetailBindingColumns;
    detailRole?:import('@frontbase/edge-core').DetailBindingRole;detailValues?:Record<string,unknown>}
export async function resolveLiveLayoutSurface(db:DbRunner,owner:string,request:Request,options:LiveLayoutServingOptions):Promise<LiveLayoutSurface|null>{
    let surface:LiveLayoutSurface|undefined;
    const response=await serveLiveLayout(db,owner,request,options,value=>{surface=value;return new Response(null,{status:204});});
    if(!response)return null;
    if(!surface)throw Error('live_page_unavailable');
    return surface;
}

/** null means no live layout has been published. Once selected, failures are terminal:
 * callers must not fall back to a historical capture or pre-rendered record HTML. */
export async function renderLiveLayoutPublication(db:DbRunner,owner:string,request:Request,options:LiveLayoutServingOptions):Promise<Response|null>{
    return serveLiveLayout(db,owner,request,options);
}
async function serveLiveLayout(db:DbRunner,owner:string,request:Request,options:LiveLayoutServingOptions,surface?:(value:LiveLayoutSurface)=>Response):Promise<Response|null>{
    const host=requestLiveLayoutHost(options.host);
    const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    let close:(()=>void|Promise<void>)|undefined;
    try{
        const active=options.prepared??await new LiveLayoutPublicationStore(db,owner).activeForServing();if(!active)return null;
        if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
        headers.set('X-Frontbase-Data','live');headers.set('X-Site-Version',active.pointer.hash);
        const publication=active.layout,url=new URL(request.url),sourceLocale=publication.configuration.site.locale;
        const prefix=url.pathname.split('/')[1]??'';
        const locale=publication.locales.includes(prefix)&&prefix!==sourceLocale?prefix:sourceLocale;
        const sourceUrl=new URL(url);if(locale!==sourceLocale)sourceUrl.pathname=url.pathname.slice(prefix.length+1)||'/';
        const sourceRequest=new Request(sourceUrl,{method:request.method,headers:request.headers});
        let list:LiveListRequest|undefined;
        const listHeader=request.headers.get('X-Frontbase-List');
        if(listHeader){try{if(listHeader.length>8192)throw Error();list=liveListRequestSchema.parse(JSON.parse(decodeURIComponent(listHeader)));}catch{throw new LivePageRequestError('invalid_list_request');}}
        const [reader,audience]=await Promise.all([
            liveLayoutReader(host,owner,publication,options.liveQuery,options.previewDraft?.layout),
            options.resolveAudience?.(owner,request)??Promise.resolve({authenticated:false}),
        ]);
        close=reader.close;
        const sitemap=await liveLayoutSitemap(publication,reader,owner,request);if(sitemap)return sitemap;
        const redirect=publication.redirects.find(item=>item.from===sourceUrl.pathname);
        if(redirect){
            const target=new URL(redirect.to,sourceUrl);
            const exists=await resolveLiveLayoutPage(publication,active.pointer.hash,owner,db,new Request(target),reader,locale,audienceConditionUser(audience),undefined,active.loadLayout);
            if(!exists)return new Response('Not found',{status:404,headers});
            headers.set('Location',(locale===sourceLocale?'':'/'+locale)+redirect.to+url.search);
            return new Response(null,{status:301,headers});
        }
        const resolved=await resolveLiveLayoutPage(publication,active.pointer.hash,owner,db,sourceRequest,reader,locale,audienceConditionUser(audience),list,active.loadLayout,options.previewDraft);
        if(!resolved)return new Response(request.method==='HEAD'?null:'Not found',{status:404,headers});
        const template = { layout: resolved.authored };
        const displayPlan = options.previewDraft ? compileDisplaySurfacePlan(resolved.authored)
            : resolved.displayPlan ?? liveDisplayPlan(publication as Parameters<typeof liveDisplayPlan>[0], resolved.sourcePageId);
        const menuHash=(resolved.page.layout.root?.appMenus as {hash?:unknown}|undefined)?.hash;
        const settings=await livePageSettings(db,owner,['project','frontend_copy:active:v1',...(locale!==sourceLocale?['translation_storage:v1']:[]),
            ...(resolved.page.layout.root?.bookingForX? [BOOKING_PALETTE_KEY] : []),
            ...(typeof menuHash==='string'&&/^[a-f0-9]{64}$/.test(menuHash)?['app_menus:publication:v1:'+menuHash]:[])]);
        let layout=await resolveAppMenuLayout(settings,owner,resolved.page.layout,sourceUrl.pathname,audience,publication.configuration.site.name,resolved.sourcePageId,options.previewPalette);
        layout=(await projectFrontendCopy(settings,owner,resolved.sourcePageId,layout,locale,false)).layout;
        let localizedFields:LiveDisplayField[]|undefined;
        if(locale!==sourceLocale){
            const [storage,menuFields]=await Promise.all([
                configuredTranslationStorage(host,settings,owner),
                captureMenuFields(settings,owner,template,layout),
            ]);
            layout=await localizeLiveLayout(layout,{scope:storage.scope,pageId:resolved.sourcePageId,sourceLocale,locale,reader:storage.persistence,menuFields,plan:displayPlan,identityPlan:resolved.translationIds,resolvedFields:fields=>{localizedFields=fields;}});
        }
        layout=addHomepageLanguageLinks(layout,sourceLocale,publication.locales.filter(code=>code!==sourceLocale),locale,sourceUrl.pathname+url.search,[publication.configuration.site.origin,url.origin]);
        if(surface){
            const detailRole=resolved.context.collection==='institutions'?'institution':resolved.context.collection==='programs'?'program':undefined;
            return surface({layout,pageId:resolved.sourcePageId,locale,sourceLocale,version:active.pointer.hash,lists:resolved.lists,
                ...(options.bindingEditor&&{detailColumns:reader.detailColumns,detailRole,
                    detailValues:detailRole?resolved.record.columns as Record<string,unknown>|undefined:undefined})});
        }
        if(list){
            const read=contextReader({url:Object.fromEntries(sourceUrl.searchParams),user:audienceConditionUser(audience),page:resolved.context});
            let result:{rows:unknown[];total:number}|undefined;
            const visit=(nodes:PageLayoutData['content'])=>{for(const node of nodes){
                if(node.visibilityCondition&&!evaluateCondition(node.visibilityCondition,read))continue;
                const version=selectBlockVersion(node,read),effective=applyBlockVersion(node,version);
                if(node.id===list!.componentId&&version===list!.versionId&&Array.isArray(effective.props?.initialRows)&&Number.isSafeInteger(effective.props?.initialTotal))result={rows:effective.props!.initialRows as unknown[],total:effective.props!.initialTotal as number};
                if(effective.children)visit(effective.children);
            }};visit(layout.content);
            headers.set('Content-Type','application/json');headers.set('Content-Language',locale);
            return new Response(JSON.stringify(result??{error:'list_not_available'}),{status:result?200:404,headers});
        }
        const localizedRecord=locale===sourceLocale||resolved.context.recordId===undefined?resolved.record:localizedPolicyRecord(layout,resolved.record,resolved.context,localizedFields);
        const policy=templatePolicyPresentation(layout,localizedRecord,resolved.context.recordId?resolved.context.collection+':'+resolved.context.recordId:'',locale,resolved.context);
        const title=policy.values.title||String(policy.record.title??resolved.page.title);
        const description=policy.values.description||String(policy.record.summary??resolved.page.description??'');
        resolved.page={...resolved.page,title,description};
        if(resolved.document.openGraph)resolved.document={...resolved.document,openGraph:{...resolved.document.openGraph,title,description}};
        const page = { ...resolved.page, layout };
        const manifest = { version: active.pointer.hash, pages: {}, queries: {} };
        const branding=await readProjectSettings(settings,owner);
        const document={...resolved.document,frontendEditing:options.frontendEditing,faviconUrl:typeof branding.faviconUrl==='string'&&branding.faviconUrl?branding.faviconUrl:'/static/icon.png'};
        const html = await renderResolvedPageDocument(page, request, {
            manifest, environment: 'edge', document, swBundle: options.swBundle,
            interpolations: displayPlanInterpolations(displayPlan),
            lists: resolved.lists,
        }, audienceConditionUser(audience));
        headers.set('Content-Language', locale);
        headers.set('Content-Type', 'text/html; charset=UTF-8');
        headers.set('x-rendered-by', 'edge');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');
        return new Response(request.method === 'HEAD' ? null : html, { headers });
    }catch(error){
        const invalid=error instanceof LivePageRequestError;
        if(!invalid)reportReadFailure('live-page',error);
        headers.set('X-Robots-Tag','noindex, nofollow');
        return new Response(request.method==='HEAD'?null:invalid?'Invalid page query':'Live content is temporarily unavailable. Please try again.',{status:invalid?400:503,headers});
    }finally{await close?.();}
}
