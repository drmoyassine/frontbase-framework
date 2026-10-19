import {PublicationRequestError} from './site-publication-runtime.js';
import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {captureHomepage,publishedHomepageLocales,projectHomepageLocale} from './translation-homepage.js';
import type {PublishedLiveQuery} from './publication-list-source.js';

export function homepageLanguageLinks(sourceLocale:string,locales:string[],current:string){return [{code:sourceLocale,label:sourceLocale==='en'?'English':sourceLocale,href:'/',current:current===sourceLocale},...locales.map(code=>({code,label:code==='ar'?'العربية':new Intl.DisplayNames([code],{type:'language'}).of(code)??code,href:`/${code}/`,current:current===code}))];}
export function addHomepageLanguageLinks(input:PageLayoutData,sourceLocale:string,locales:string[],current:string):PageLayoutData{
    const layout=structuredClone(input),links=homepageLanguageLinks(sourceLocale,locales,current);
    const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){if(node.type==='Navbar'){node.props={...node.props,languageSwitcher:links,localeLabels:{...node.props?.localeLabels as object,language:current==='ar'?'اللغة':'Language'}};const logo=node.props.logo as Record<string,unknown>|undefined;if(logo?.link==='/')logo.link=current===sourceLocale?'/':`/${current}/`;}
        if(node.type==='Footer')node.props={...node.props,logoHref:current===sourceLocale?'/':`/${current}/`};if(node.children)walk(node.children);}};walk(layout.content);return layout;
}
export async function resolveHomepageLanguageRequest(db:DbRunner,tenant:string,request:Request,liveQuery?:PublishedLiveQuery){
    const url=new URL(request.url),path=url.pathname;
    if(path==='/'&&url.searchParams.size)return null;
    if(path!=='/'&&!/^\/[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*\/$/.test(path))return null;
    const published=await publishedHomepageLocales(db,tenant);
    const selected=published.find(item=>`/${item.release.locale}/`===path);
    if(path!=='/'&&!selected)return null;
    if(selected&&url.searchParams.size)throw new PublicationRequestError();
    if(!published.length)return null;
    const capture=await captureHomepage(db,tenant,request,liveQuery);
    const available=published.filter(item=>item.release.siteHash===capture.active.pointer.hash&&item.release.sourceHash===capture.sourceHash);
    if(selected&&!available.includes(selected))throw Error('locale_unavailable');
    if(!available.length)return null;
    const sourceLocale=available[0]!.release.sourceLocale,current=selected?.release.locale??sourceLocale;
    const resolved=selected?projectHomepageLocale(capture,selected.release):capture.result;
    resolved.page={...resolved.page,layout:addHomepageLanguageLinks(resolved.page.layout as unknown as PageLayoutData,sourceLocale,available.map(item=>item.release.locale),current)};
    const canonical=new URL(selected?`/${current}/`:'/',resolved.document.canonicalUrl??request.url);
    const alternates=homepageLanguageLinks(sourceLocale,available.map(item=>item.release.locale),current).map(link=>({language:link.code,href:new URL(link.href,canonical).href}));
    resolved.document={...resolved.document,language:current,direction:/^(ar|fa|he|ur)(-|$)/.test(current)?'rtl':'ltr',canonicalUrl:canonical.href,alternates,
        openGraph:{title:resolved.page.title,description:resolved.page.description,url:canonical.href,type:'website',siteName:resolved.document.openGraph?.siteName??''}};
    return {resolved,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current};
}
