import {SitePublicationManifestStore} from './site-publication-manifest.js';
import {verifyManifestEditorial} from './site-publication-approval-check.js';
import {localizeNavigationProps,localizePublicHref} from '@frontbase/edge-core/localization';
import {resolvePublicationVersionPage,PublicationRequestError} from './site-publication-runtime.js';
import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {captureHomepage,localizedTitleIndex,publishedHomepageLocales,projectHomepageLocale,templateListingPath} from './translation-homepage.js';
import type {LocalizedQueryPlan} from './site-publication-chunk-queries.js';
import type {PublishedLiveQuery} from './publication-list-source.js';

export function homepageLanguageLinks(sourceLocale:string,locales:string[],current:string,sourcePath='/'){const source=encodeURI(sourcePath),label=(code:string)=>{if(code==='ar')return 'العربية';try{return new Intl.DisplayNames([code],{type:'language'}).of(code)??code;}catch{return code;}};
    return [{code:sourceLocale,label:sourceLocale==='en'?'English':label(sourceLocale),href:source,current:current===sourceLocale},...locales.map(code=>({code,label:label(code),href:`/${code}${source}`,current:current===code}))];}
/** The release that translates `path`'s content under the URL's locale prefix, for the localized
 *  list endpoint: locale prefixes count only when a published locale matches, and the catalog
 *  comes only from the path-matched release. A prefix without a path-matched release still
 *  strips (catalog stays undefined): fallback pages keep hydration markers, so their list
 *  fetches must walk the source registry instead of 404ing on the prefixed URL. Null keeps
 *  the fetch pure source when no published locale matches at all. */
export async function localizedListRequest(db:DbRunner,tenant:string,path:string):Promise<{locale:string;path:string;catalog?:readonly import('./site-publication-chunk-queries.js').LocalizedCatalogEntry[]}|null>{
    const published=await publishedHomepageLocales(db,tenant);
    const locale=published.find(item=>path===`/${item.release.locale}/`||path.startsWith(`/${item.release.locale}/`));
    if(!locale)return null;
    const stripped=path.slice(locale.release.locale.length+1)||'/';
    const release=published.find(item=>item.release.locale===locale.release.locale&&item.release.path===stripped)?.release;
    return {locale:locale.release.locale,path:stripped,...(release?{catalog:release.catalog}:{})};
}
export function addHomepageLanguageLinks(input:PageLayoutData,sourceLocale:string,locales:string[],current:string,sourcePath='/',origins:string[]=[]):PageLayoutData{
    // The switcher refuses more than 16 links (whole-page 503): cap the locale entries so a
    // pointer-capped site can never trip it. Published locales are themselves bounded at 16.
    const layout=structuredClone(input),links=homepageLanguageLinks(sourceLocale,locales.slice(0,15),current,sourcePath);
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
    // Listing releases resolve through localized queries: their fresh released titles drive the
    // registry (search/sort/totals) and standard-list reads beside the per-unit text join.
    // Cached beside the source capture.
    const captureFor=async(p:string,localizedTitles?:LocalizedQueryPlan)=>{
        if(localizedTitles){const key=p+'\u0000localized';
            if(!captures.has(key))captures.set(key,await captureHomepage(db,tenant,request,liveQuery,p,undefined,localizedTitles));
            return captures.get(key)!;}
        if(p==='/')return capture;
        if(!captures.has(p))captures.set(p,await captureHomepage(db,tenant,request,liveQuery,p));
        return captures.get(p)!;};
    // A per-unit release stays selectable while its page still resolves; freshness is decided per unit
    // at projection. If the page itself is gone the release is skipped so the source 404s naturally.
    const selectable=[];
    for(const item of localeMatches){
        if(item.release.policy?.outdated==='source-fallback'){try{await captureFor(item.release.path);}catch{continue;}}
        selectable.push(item);
    }
    const selected=selectable.find(item=>item.release.path!=='/'&&item.release.path===sourceUrl.pathname)??selectable.find(item=>item.release.path==='/')??null;
    if(sourceUrl.pathname==='/'&&url.searchParams.size)throw new PublicationRequestError();
    // Template listing releases resolve every parameterization through localized queries: the
    // selected release's fresh released titles drive the registry beside the per-unit text join.
    const listingTitles=capture.active.artifact.schemaVersion===2&&selected&&selected.release.path!=='/'&&templateListingPath(capture.active.artifact,selected.release.path)
        ?localizedTitleIndex(selected.release,capture.active.artifact):undefined;
    const available=[];
    for(const item of published){
        // Per-unit releases serve a fresh join against the live page, so a site re-publication
        // does not deactivate them; only the page itself disappearing does.
        if(item.release.policy?.outdated==='source-fallback'){try{await captureFor(item.release.path,item===selected?listingTitles:undefined);}catch{continue;}available.push(item);continue;}
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
    // Public locale registries are per-path, never site-wide: a locale joins a page's switcher
    // and alternates only when it publishes that same path (a homepage-only release must not
    // advertise /fr/ equivalents for every page it merely shells). The switcher additionally
    // keeps the current locale so the active URL stays reachable on fallback serves.
    const scopedLocales=[...new Set(available.filter(item=>item.release.path===sourceUrl.pathname).map(item=>item.release.locale))].filter(code=>code!==sourceLocale);
    const redirect=(capture.active.artifact.schemaVersion===2?capture.active.artifact.redirects:undefined)?.find(alias=>alias.from===sourceUrl.pathname);
    if(redirect){if(url.search)throw new PublicationRequestError();if(capture.active.artifact.schemaVersion===2){await new SitePublicationManifestStore(db,tenant).verify(capture.active.artifact);await verifyManifestEditorial(db,tenant,capture.active.artifact);}return {kind:'redirect' as const,redirect:selected?localizePublicHref(redirect.to,current,origins):redirect.to,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current};}
    // Template listing releases join the parameterized rendering (explore type/q/page); their
    // prepare-time fence guarantees per-unit policy, so the identity join stays per unit.
    const listingRelease=!!pageRelease&&capture.active.artifact.schemaVersion===2&&templateListingPath(capture.active.artifact,pageRelease.release.path);
    // Static pages refuse query parameters at their source path; the localized path refuses
    // them identically instead of rendering an indexable duplicate the source never serves.
    if(pageRelease&&!listingRelease&&sourceUrl.search)throw new PublicationRequestError();
    const resolved=pageRelease?projectHomepageLocale(listingRelease&&sourceUrl.search?await captureHomepage(db,tenant,request,liveQuery,pageRelease.release.path,sourceUrl,listingTitles):await captureFor(pageRelease.release.path,listingTitles),pageRelease.release):isHomepage?(selected?projectHomepageLocale(capture,selected.release):capture.result):await resolvePublicationVersionPage(capture.active.artifact,capture.active.pointer.hash,tenant,db,new Request(sourceUrl),{authenticated:false},liveQuery);
    if(!resolved)return null;
    if(selected&&!pageRelease&&!isHomepage){
        // Only the already approved shared shell is translated here. Other page copy stays source content.
        const layout=structuredClone(resolved.page.layout) as unknown as PageLayoutData;
        const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){if(node.type==='Navbar'||node.type==='Footer')for(const field of selected.release.catalog.filter(f=>f.blockId===node.id)){let target:any=node;for(const key of field.path.slice(0,-1)){if(!target||typeof target!=='object')break;target=target[key];}if(target&&typeof target==='object'&&typeof target[field.path.at(-1)!]==='string')target[field.path.at(-1)!]=field.text;}if(node.children)walk(node.children);}};walk(layout.content);
        layout.root={...layout.root,localeMessages:Object.fromEntries(selected.release.catalog.filter(f=>f.blockId==='$root').map(f=>[f.path.at(-1)!,f.text]))};
        resolved.page={...resolved.page,layout};
    }
    const switcherLocales=[...new Set([...scopedLocales,...(current!==sourceLocale?[current]:[])])];
    resolved.page={...resolved.page,layout:addHomepageLanguageLinks(resolved.page.layout as unknown as PageLayoutData,sourceLocale,switcherLocales,current,sourceUrl.pathname+sourceUrl.search,origins)};
    const canonical=new URL(isHomepage?(selected?`/${current}/`:'/'):(pageRelease?`/${current}${sourceUrl.pathname}`:sourceUrl.pathname),resolved.document.canonicalUrl??request.url);
    // Alternates stay strictly per-path (no current-locale augmentation) and extend to plain
    // source-locale serves of released pages, so hreflang clusters stay reciprocal.
    const sourceServe=!localeMatches.length;
    const alternates=isHomepage||pageRelease||sourceServe&&scopedLocales.length>0&&!url.search?homepageLanguageLinks(sourceLocale,scopedLocales,current,isHomepage?'/':sourceUrl.pathname).map(link=>({language:link.code,href:new URL(link.href,canonical).href})):undefined;
    // Language metadata follows the content, not the URL prefix: shared-shell fallback serves
    // keep the source locale's lang/dir so untranslated bodies never claim the page language.
    const contentLocale=pageRelease||isHomepage&&selected?current:sourceLocale;
    resolved.document={...resolved.document,language:contentLocale,direction:/^(ar|fa|he|ur)(-|$)/.test(contentLocale)?'rtl':'ltr',canonicalUrl:canonical.href,alternates,
        openGraph:{title:resolved.page.title,description:resolved.page.description,url:canonical.href,type:'website',siteName:resolved.document.openGraph?.siteName??''}};
    return {kind:'page' as const,resolved,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current,contentLocale};
}
