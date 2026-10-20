import {SitePublicationManifestStore} from './site-publication-manifest.js';
import {verifyManifestEditorial} from './site-publication-approval-check.js';
import {localizeNavigationProps,localizePublicHref} from '@frontbase/edge-core/localization';
import {resolvePublicationVersionPage,PublicationRequestError} from './site-publication-runtime.js';
import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {captureHomepage,publishedHomepageLocales,projectHomepageLocale,templateListingPath} from './translation-homepage.js';
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
    if(!published.length)return null;
    const localeMatches=published.filter(item=>path===`/${item.release.locale}/`||path.startsWith(`/${item.release.locale}/`));
    const sourceUrl=new URL(request.url);if(localeMatches.length)sourceUrl.pathname=path.slice(localeMatches[0]!.release.locale.length+1)||'/';
    const capture=await captureHomepage(db,tenant,request,liveQuery);
    const captures=new Map<string,Awaited<ReturnType<typeof captureHomepage>>>();
    const captureFor=async(p:string)=>{if(p==='/')return capture;if(!captures.has(p))captures.set(p,await captureHomepage(db,tenant,request,liveQuery,p));return captures.get(p)!;};
    // A per-unit release stays selectable while its page still resolves; freshness is decided per unit
    // at projection. If the page itself is gone the release is skipped so the source 404s naturally.
    const selectable=[];
    for(const item of localeMatches){
        if(item.release.policy?.outdated==='source-fallback'){try{await captureFor(item.release.path);}catch{continue;}}
        selectable.push(item);
    }
    const selected=selectable.find(item=>item.release.path!=='/'&&item.release.path===sourceUrl.pathname)??selectable.find(item=>item.release.path==='/')??null;
    if(selected&&sourceUrl.pathname==='/'&&url.searchParams.size)throw new PublicationRequestError();
    const available=[];
    for(const item of published){
        // Per-unit releases serve a fresh join against the live page, so a site re-publication
        // does not deactivate them; only the page itself disappearing does.
        if(item.release.policy?.outdated==='source-fallback'){try{await captureFor(item.release.path);}catch{continue;}available.push(item);continue;}
        if(item.release.siteHash!==capture.active.pointer.hash)continue;
        const c=item.release.path==='/'?capture:await captureFor(item.release.path).catch(()=>null);
        if(c&&item.release.sourceHash===c.sourceHash)available.push(item);
    }
    if(selected&&!available.includes(selected))throw Error('locale_unavailable');
    if(!available.length)return null;
    const sourceLocale=available[0]!.release.sourceLocale,current=selected?.release.locale??sourceLocale;
    const isHomepage=sourceUrl.pathname==='/';
    const pageRelease=selected&&selected.release.path!=='/'?selected:null;
    const origins=[url.origin,new URL(capture.active.artifact.configuration.site.origin).origin];
    const redirect=(capture.active.artifact.schemaVersion===2?capture.active.artifact.redirects:undefined)?.find(alias=>alias.from===sourceUrl.pathname);
    if(redirect){if(url.search)throw new PublicationRequestError();if(capture.active.artifact.schemaVersion===2){await new SitePublicationManifestStore(db,tenant).verify(capture.active.artifact);await verifyManifestEditorial(db,tenant,capture.active.artifact);}return {kind:'redirect' as const,redirect:selected?localizePublicHref(redirect.to,current,origins):redirect.to,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current};}
    // Template listing releases join the parameterized rendering (explore type/q/page); their
    // prepare-time fence guarantees per-unit policy, so the identity join stays per unit.
    const listingRelease=!!pageRelease&&capture.active.artifact.schemaVersion===2&&templateListingPath(capture.active.artifact,pageRelease.release.path);
    const resolved=pageRelease?projectHomepageLocale(listingRelease&&sourceUrl.search?await captureHomepage(db,tenant,request,liveQuery,pageRelease.release.path,sourceUrl):await captureFor(pageRelease.release.path),pageRelease.release):isHomepage?(selected?projectHomepageLocale(capture,selected.release):capture.result):await resolvePublicationVersionPage(capture.active.artifact,capture.active.pointer.hash,tenant,db,new Request(sourceUrl),{authenticated:false},liveQuery);
    if(!resolved)return null;
    if(selected&&!pageRelease&&!isHomepage){
        // Only the already approved shared shell is translated here. Other page copy stays source content.
        const layout=structuredClone(resolved.page.layout) as unknown as PageLayoutData;
        const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){if(node.type==='Navbar'||node.type==='Footer')for(const field of selected.release.catalog.filter(f=>f.blockId===node.id)){let target:any=node;for(const key of field.path.slice(0,-1)){if(!target||typeof target!=='object')break;target=target[key];}if(target&&typeof target==='object'&&typeof target[field.path.at(-1)!]==='string')target[field.path.at(-1)!]=field.text;}if(node.children)walk(node.children);}};walk(layout.content);
        layout.root={...layout.root,localeMessages:Object.fromEntries(selected.release.catalog.filter(f=>f.blockId==='$root').map(f=>[f.path.at(-1)!,f.text]))};
        resolved.page={...resolved.page,layout};
    }
    resolved.page={...resolved.page,layout:addHomepageLanguageLinks(resolved.page.layout as unknown as PageLayoutData,sourceLocale,available.map(item=>item.release.locale),current,sourceUrl.pathname+sourceUrl.search,origins)};
    const canonical=new URL(isHomepage?(selected?`/${current}/`:'/'):(pageRelease?`/${current}${sourceUrl.pathname}`:sourceUrl.pathname),resolved.document.canonicalUrl??request.url);
    const alternates=isHomepage||pageRelease?homepageLanguageLinks(sourceLocale,available.map(item=>item.release.locale),current,pageRelease?sourceUrl.pathname:'/').map(link=>({language:link.code,href:new URL(link.href,canonical).href})):undefined;
    resolved.document={...resolved.document,language:current,direction:/^(ar|fa|he|ur)(-|$)/.test(current)?'rtl':'ltr',canonicalUrl:canonical.href,alternates,
        openGraph:{title:resolved.page.title,description:resolved.page.description,url:canonical.href,type:'website',siteName:resolved.document.openGraph?.siteName??''}};
    return {kind:'page' as const,resolved,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current};
}
