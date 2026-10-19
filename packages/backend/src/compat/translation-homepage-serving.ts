import {SitePublicationManifestStore} from './site-publication-manifest.js';
import {verifyManifestEditorial} from './site-publication-approval-check.js';
import {localizeNavigationProps,localizePublicHref} from '@frontbase/edge-core/localization';
import {resolvePublicationVersionPage,PublicationRequestError} from './site-publication-runtime.js';
import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {captureHomepage,publishedHomepageLocales,projectHomepageLocale} from './translation-homepage.js';
import type {PublishedLiveQuery} from './publication-list-source.js';

export function homepageLanguageLinks(sourceLocale:string,locales:string[],current:string,sourcePath='/'){return [{code:sourceLocale,label:sourceLocale==='en'?'English':sourceLocale,href:sourcePath,current:current===sourceLocale},...locales.map(code=>({code,label:code==='ar'?'العربية':new Intl.DisplayNames([code],{type:'language'}).of(code)??code,href:`/${code}${sourcePath}`,current:current===code}))];}
export function addHomepageLanguageLinks(input:PageLayoutData,sourceLocale:string,locales:string[],current:string,sourcePath='/',origins:string[]=[]):PageLayoutData{
    const layout=structuredClone(input),links=homepageLanguageLinks(sourceLocale,locales,current,sourcePath);
    const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){if(node.type==='Navbar'){node.props={...node.props,languageSwitcher:links,localeLabels:{...node.props?.localeLabels as object,language:current==='ar'?'اللغة':'Language'}};const logo=node.props.logo as Record<string,unknown>|undefined;if(logo?.link==='/')logo.link=current===sourceLocale?'/':`/${current}/`;}
        if(node.type==='Footer')node.props={...node.props,logoHref:current===sourceLocale?'/':`/${current}/`};if(node.children)walk(node.children);}};walk(layout.content);
    if(current!==sourceLocale){const projected=localizeNavigationProps(layout,current,origins);projected.root={...projected.root,localeNavigation:{locale:current,origins}};return projected;}
    return layout;
}
export async function resolveHomepageLanguageRequest(db:DbRunner,tenant:string,request:Request,liveQuery?:PublishedLiveQuery){
    const url=new URL(request.url),path=url.pathname;
    if(path==='/'&&url.searchParams.size)return null;
    if(/^\/(?:api|frontbase-admin|static|assets)(?:\/|$)/.test(path)||/\.[A-Za-z0-9]+$/.test(path))return null;
    const published=await publishedHomepageLocales(db,tenant);
    const selected=published.find(item=>path===`/${item.release.locale}/`||path.startsWith(`/${item.release.locale}/`));
    if(!published.length)return null;
    const sourceUrl=new URL(request.url);if(selected)sourceUrl.pathname=path.slice(selected.release.locale.length+1)||'/';
    if(selected&&sourceUrl.pathname==='/'&&url.searchParams.size)throw new PublicationRequestError();
    const capture=await captureHomepage(db,tenant,request,liveQuery);
    const available=published.filter(item=>item.release.siteHash===capture.active.pointer.hash&&item.release.sourceHash===capture.sourceHash);
    if(selected&&!available.includes(selected))throw Error('locale_unavailable');
    if(!available.length)return null;
    const sourceLocale=available[0]!.release.sourceLocale,current=selected?.release.locale??sourceLocale;
    const isHomepage=sourceUrl.pathname==='/';
    const origins=[url.origin,new URL(capture.active.artifact.configuration.site.origin).origin];
    const redirect=(capture.active.artifact.schemaVersion===2?capture.active.artifact.redirects:undefined)?.find(alias=>alias.from===sourceUrl.pathname);
    if(redirect){if(url.search)throw new PublicationRequestError();if(capture.active.artifact.schemaVersion===2){await new SitePublicationManifestStore(db,tenant).verify(capture.active.artifact);await verifyManifestEditorial(db,tenant,capture.active.artifact);}return {kind:'redirect' as const,redirect:selected?localizePublicHref(redirect.to,current,origins):redirect.to,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current};}
    const resolved=isHomepage?(selected?projectHomepageLocale(capture,selected.release):capture.result):await resolvePublicationVersionPage(capture.active.artifact,capture.active.pointer.hash,tenant,db,new Request(sourceUrl),{authenticated:false},liveQuery);
    if(!resolved)return null;
    if(selected&&!isHomepage){
        // Only the already approved shared shell is translated here. Other page copy stays source content.
        const layout=structuredClone(resolved.page.layout) as unknown as PageLayoutData;
        const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){if(node.type==='Navbar'||node.type==='Footer')for(const field of selected.release.catalog.filter(f=>f.blockId===node.id)){let target:any=node;for(const key of field.path.slice(0,-1)){if(!target||typeof target!=='object')break;target=target[key];}if(target&&typeof target==='object'&&typeof target[field.path.at(-1)!]==='string')target[field.path.at(-1)!]=field.text;}if(node.children)walk(node.children);}};walk(layout.content);
        layout.root={...layout.root,localeMessages:Object.fromEntries(selected.release.catalog.filter(f=>f.blockId==='$root').map(f=>[f.path.at(-1)!,f.text]))};
        resolved.page={...resolved.page,layout};
    }
    resolved.page={...resolved.page,layout:addHomepageLanguageLinks(resolved.page.layout as unknown as PageLayoutData,sourceLocale,available.map(item=>item.release.locale),current,sourceUrl.pathname+sourceUrl.search,origins)};
    const canonical=new URL(isHomepage?(selected?`/${current}/`:'/'):sourceUrl.pathname,resolved.document.canonicalUrl??request.url);
    const alternates=isHomepage?homepageLanguageLinks(sourceLocale,available.map(item=>item.release.locale),current).map(link=>({language:link.code,href:new URL(link.href,canonical).href})):undefined;
    resolved.document={...resolved.document,language:current,direction:/^(ar|fa|he|ur)(-|$)/.test(current)?'rtl':'ltr',canonicalUrl:canonical.href,alternates,
        openGraph:{title:resolved.page.title,description:resolved.page.description,url:canonical.href,type:'website',siteName:resolved.document.openGraph?.siteName??''}};
    return {kind:'page' as const,resolved,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current};
}
