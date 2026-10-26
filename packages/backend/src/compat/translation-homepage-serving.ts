import {templatePolicyPresentation} from './template-policy-runtime.js';
import {SitePublicationManifestStore} from './site-publication-manifest.js';
import {verifyManifestEditorial} from './site-publication-approval-check.js';
import {localizeNavigationProps,localizePublicHref,localeDirection} from '@frontbase/edge-core/localization';
import {resolvePublicationVersionPage,PublicationRequestError} from './site-publication-runtime.js';
import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {captureHomepage,localizedTitleIndex,listPublishedLocalePointers,LOCALE_PATTERN,publishedLocalesForPath,projectHomepageLocale,templateListingPath} from './translation-homepage.js';
import type {PublishedLocalePointerEntry} from './translation-homepage.js';
import type {LocalizedQueryPlan} from './site-publication-chunk-queries.js';
import type {PublishedLiveQuery} from './publication-list-source.js';

export function homepageLanguageLinks(sourceLocale:string,locales:string[],current:string,sourcePath='/'){const source=encodeURI(sourcePath),label=(code:string)=>{if(code==='ar')return 'العربية';try{return new Intl.DisplayNames([code,'en'],{type:'language'}).of(code)??code;}catch{return code;}};
    return [{code:sourceLocale,label:sourceLocale==='en'?'English':label(sourceLocale),href:source,current:current===sourceLocale},...locales.map(code=>({code,label:label(code),href:`/${code}${source}`,current:current===code}))];}
/** The release that translates `path`'s content under the URL's locale prefix, for the localized
 *  list endpoint: a prefix counts only when that locale publishes THIS path (or the homepage,
 *  whose shell-fallback pages hydrate their lists under the prefix too), and the catalog comes
 *  only from the path-matched release. A matched prefix without a path-matched release still
 *  strips (catalog stays undefined): fallback pages keep hydration markers, so their list
 *  fetches must walk the source registry instead of 404ing on the prefixed URL. Null keeps the
 *  fetch pure source when no publication claims the prefix. Resolution is per-path point
 *  lookup — never a site-wide registry walk. */
export async function localizedListRequest(db:DbRunner,tenant:string,path:string,liveQuery?:PublishedLiveQuery):Promise<{locale:string;path:string;catalog?:readonly import('./site-publication-chunk-queries.js').LocalizedCatalogEntry[]}|null>{
    const prefix=path.slice(1).split('/')[0]??'';
    if(!LOCALE_PATTERN.test(prefix))return null;
    const stripped=path.slice(prefix.length+1)||'/';
    const forPath=await publishedLocalesForPath(db,tenant,stripped);
    const exact=forPath.find(item=>item.locale===prefix);
    if(exact?.corrupt)throw Error('locale_unavailable');
    if(exact?.release){
        if(exact.release.policy?.outdated!=='source-fallback'){
            const current=await captureHomepage(db,tenant,new Request('https://locale-validation.invalid'+stripped),liveQuery,stripped);
            if(current.active.pointer.hash!==exact.release.siteHash||current.sourceHash!==exact.release.sourceHash)throw Error('locale_unavailable');
        }
        return {locale:prefix,path:stripped,catalog:exact.release.catalog};
    }
    const home=stripped==='/'?forPath:await publishedLocalesForPath(db,tenant,'/');
    if(home.some(item=>item.locale===prefix)||forPath.some(item=>item.locale===prefix))return {locale:prefix,path:stripped};
    return null;
}
/** Sitemap locale entries: one per fresh released (locale,path), evaluated by the SAME rule as
 *  page serving (the per-path availability walk) — a release whose site re-published (siteHash),
 *  whose page drifted (sourceHash), or whose page vanished serves no localized URL, so it must
 *  acquire no false SEO. The registry is read through pagination, so the walk stays bounded at
 *  any publication scale; one source capture per distinct path, memoized. */
export async function sitemapLocaleEntries(db:DbRunner,tenant:string,request:Request,activePointer:{hash:string},liveQuery?:PublishedLiveQuery):Promise<{locale:string;path:string}[]>{
    const captures=new Map<string,Awaited<ReturnType<typeof captureHomepage>>|null>();
    const captureFor=async(p:string)=>{if(!captures.has(p))captures.set(p,await captureHomepage(db,tenant,request,liveQuery,p).catch(()=>null));return captures.get(p)!;};
    const entries:{locale:string;path:string}[]=[],seen=new Set<string>();
    for(let offset=0;;offset+=100){
        const page=await listPublishedLocalePointers(db,tenant,{limit:100,offset});
        for(const {release} of page.items){
            if(!release||seen.has(release.locale+'\u0000'+release.path))continue;seen.add(release.locale+'\u0000'+release.path);
            if(release.policy?.outdated==='source-fallback'){if(await captureFor(release.path))entries.push({locale:release.locale,path:release.path});continue;}
            if(release.siteHash!==activePointer.hash)continue;
            const capture=await captureFor(release.path);
            if(capture&&release.sourceHash===capture.sourceHash)entries.push({locale:release.locale,path:release.path});
        }
        if(!page.items.length||offset+page.items.length>=page.total)break;
    }
    return entries;
}
export function addHomepageLanguageLinks(input:PageLayoutData,sourceLocale:string,locales:string[],current:string,sourcePath='/',origins:string[]=[]):PageLayoutData{
    // The switcher refuses more than 16 links (whole-page 503): cap the rendered entries at the
    // component's DISPLAY bound. This bounds language CHOICES on one page, never publications —
    // configured target locales are bounded at 16, so the published set never exceeds it either.
    const layout=structuredClone(input),links=homepageLanguageLinks(sourceLocale,locales.slice(0,15),current,sourcePath);
    const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){if(node.type==='Navbar'){const labels=node.props?.localeLabels as Record<string,unknown>|undefined;node.props={...node.props,languageSwitcher:links,localeLabels:{...labels,language:typeof labels?.language==='string'?labels.language:current==='ar'?'اللغة':'Language'}};const logo=node.props.logo as Record<string,unknown>|undefined;if(logo?.link==='/')logo.link=current===sourceLocale?'/':`/${current}/`;}
        if(node.type==='Footer')node.props={...node.props,logoHref:current===sourceLocale?'/':`/${current}/`};if(node.children)walk(node.children);}};walk(layout.content);
    if(current!==sourceLocale){const projected=localizeNavigationProps(layout,current,origins);projected.root={...projected.root,localeNavigation:{locale:current,origins}};return projected;}
    return layout;
}
export async function resolveHomepageLanguageRequest(db:DbRunner,tenant:string,request:Request,liveQuery?:PublishedLiveQuery){
    const url=new URL(request.url),path=url.pathname;
    if(path==='/'&&url.searchParams.size)return null;
    if(/^\/(?:api|frontbase-admin|static|assets)(?:\/|$)/.test(path)||/\.[A-Za-z0-9]+$/.test(path))return null;
    // Per-path point lookups instead of a site-wide registry walk: one bounded query per path,
    // sized by the LANGUAGES publishing that page (the former global walk threw site-wide 503s
    // past an aggregate pointer count and let one corrupt release disable unrelated pages). The
    // URL's locale prefix is recognized only when THIS path or the homepage publishes it — a
    // release for other paths must not claim every /{locale}/… URL of the source publication.
    const head=path.slice(1).split('/')[0]??'';
    const prefix=LOCALE_PATTERN.test(head)?head:null;
    const stripped=prefix?path.slice(prefix.length+1)||'/':path;
    const perPath=await publishedLocalesForPath(db,tenant,stripped);
    const homeEntries=stripped==='/'?perPath:await publishedLocalesForPath(db,tenant,'/');
    if(!perPath.length&&!homeEntries.length)return null;
    const matchFor=(entries:PublishedLocalePointerEntry[])=>prefix?entries.find(item=>item.locale===prefix)??null:null;
    const rawExact=matchFor(perPath),rawHome=stripped==='/'?null:matchFor(homeEntries);
    // A pointer whose release is unreadable is a broken REQUESTED page, not a silent fallback:
    // strict-fence semantics throw so the serving boundary 503s this page alone while sibling
    // locales, the admin listing and unrelated pages stay alive.
    if(rawExact?.corrupt||rawHome?.corrupt)throw Error('locale_unavailable');
    // Product fallback (pinned): a locale published for ANY page still claims its /{locale}/
    // homepage URL, serving the source homepage as the shared shell (source language, no false
    // hreflang). One bounded suffix lookup replaces the old whole-registry walk.
    let homepageFallback=false;
    if(prefix&&!rawExact&&!rawHome&&stripped==='/'){
        const rows=await db.query('SELECT key FROM settings WHERE tenant_slug = ? AND key LIKE ? LIMIT 1',[tenant,'%:'+prefix]);
        homepageFallback=rows.length>0;
    }
    const matched=!!(rawExact||rawHome||homepageFallback);
    // Everything past the corrupt fence works with live entries: pointer and release both exist.
    type LiveEntry=PublishedLocalePointerEntry&{pointer:{hash:string;generation:number};release:NonNullable<PublishedLocalePointerEntry['release']>};
    const liveOf=(item:PublishedLocalePointerEntry|null):LiveEntry|null=>item&&!item.corrupt&&item.release?item as LiveEntry:null;
    const sourceUrl=new URL(request.url);if(matched)sourceUrl.pathname=stripped;
    const capture=await captureHomepage(db,tenant,request,liveQuery);
    const captures=new Map<string,Awaited<ReturnType<typeof captureHomepage>>>();
    // Listing releases resolve through localized queries: their fresh released titles drive the
    // registry (search/sort/totals) and standard-list reads beside the per-unit text join.
    // Cached beside the source capture.
    const captureFor=async(p:string,localizedTitles?:LocalizedQueryPlan,recordsLocale?:string)=>{
        if(localizedTitles){const key=p+'\u0000localized';
            if(!captures.has(key))captures.set(key,await captureHomepage(db,tenant,request,liveQuery,p,undefined,localizedTitles,recordsLocale));
            return captures.get(key)!;}
        if(p==='/')return capture;
        if(!captures.has(p))captures.set(p,await captureHomepage(db,tenant,request,liveQuery,p));
        return captures.get(p)!;};
    // A per-unit release stays selectable while its page still resolves; freshness is decided per unit
    // at projection. If the page itself is gone the release is skipped so the source 404s naturally.
    // Selection is exact-path first, homepage shell-fallback second — no site-wide registry scan.
    const perUnitResolves=async(item:LiveEntry)=>{try{await captureFor(item.release.path);}catch{return false;}return true;};
    const selectable=async(item:LiveEntry)=>!(item.release.policy?.outdated==='source-fallback'&&!await perUnitResolves(item));
    const liveExact=liveOf(rawExact),liveHome=liveOf(rawHome);
    let selected:LiveEntry|null=null;
    if(liveExact&&await selectable(liveExact))selected=liveExact;
    if(!selected&&liveHome&&await selectable(liveHome))selected=liveHome;
    if(sourceUrl.pathname==='/'&&url.searchParams.size)throw new PublicationRequestError();
    // Template listing releases resolve every parameterization through localized queries: the
    // selected release's fresh released titles drive the registry beside the per-unit text join.
    // Every selected page release gets a localized query plan: listings intersect fresh titles
    // with the parameterized registry; static pages pass the catalog to their live lists
    // (full-dataset localized sort/filter) and any pinned reads beside them.
    const listingTitles=capture.active.artifact.schemaVersion===2&&selected&&selected.release.path!=='/'
        ?localizedTitleIndex(selected.release,capture.active.artifact):undefined;
    // Freshness is decided per entry, never per registry: per-unit releases stay fresh while
    // their page resolves (a site re-publication does not deactivate them); strict releases need
    // the unchanged site+source they were prepared against. Each entry is evaluated and caught
    // on its own, so one stale/corrupt release can never fail a sibling locale or another page.
    const isFresh=async(item:LiveEntry)=>{
        if(item.release.policy?.outdated==='source-fallback')return perUnitResolves(item);
        if(item.release.siteHash!==capture.active.pointer.hash)return false;
        const c=item.release.path==='/'?capture:await captureFor(item.release.path).catch(()=>null);
        return !!c&&item.release.sourceHash===c.sourceHash;};
    if(selected&&!await isFresh(selected))throw Error('locale_unavailable');
    const availableExact:LiveEntry[]=[];
    for(const item of perPath){const entry=liveOf(item);if(entry&&await isFresh(entry))availableExact.push(entry);}
    const availableHome:LiveEntry[]=[];
    if(stripped!=='/')for(const item of homeEntries){const entry=liveOf(item);if(entry&&await isFresh(entry))availableHome.push(entry);}
    if(!selected&&!availableExact.length&&!availableHome.length)return null;
    // sourceLocale falls back to the selected entry (both families carry the same value): the
    // freshness refusal above must stay the ONLY refusal for a stale release — the mutation gate
    // disables refusal layers and needs to observe the actual stale serve, never a crash.
    const sourceLocale=(availableExact[0]??availableHome[0]??selected)!.release.sourceLocale,current=selected?.release.locale??sourceLocale;
    const isHomepage=sourceUrl.pathname==='/';
    const pageRelease=selected&&selected.release.path!=='/'?selected:null;
    const origins=[url.origin,new URL(capture.active.artifact.configuration.site.origin).origin];
    // Public locale registries are per-path, never site-wide: a locale joins a page's switcher
    // and alternates only when it publishes that same path (a homepage-only release must not
    // advertise /fr/ equivalents for every page it merely shells). The switcher additionally
    // keeps the current locale so the active URL stays reachable on fallback serves.
    const scopedLocales=[...new Set(availableExact.map(item=>item.release.locale))].filter(code=>code!==sourceLocale);
    const redirect=(capture.active.artifact.schemaVersion===2?capture.active.artifact.redirects:undefined)?.find(alias=>alias.from===sourceUrl.pathname);
    if(redirect){if(url.search)throw new PublicationRequestError();if(capture.active.artifact.schemaVersion===2){await new SitePublicationManifestStore(db,tenant).verify(capture.active.artifact);await verifyManifestEditorial(db,tenant,capture.active.artifact);}return {kind:'redirect' as const,redirect:selected?localizePublicHref(redirect.to,current,origins):redirect.to,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current};}
    // Template listing releases join the parameterized rendering (explore type/q/page); their
    // prepare-time fence guarantees per-unit policy, so the identity join stays per unit.
    const listingRelease=!!pageRelease&&capture.active.artifact.schemaVersion===2&&templateListingPath(capture.active.artifact,pageRelease.release.path);
    // Static pages refuse query parameters at their source path; the localized path refuses
    // them identically instead of rendering an indexable duplicate the source never serves.
    if(pageRelease&&!listingRelease&&sourceUrl.search)throw new PublicationRequestError();
    const resolved=pageRelease?projectHomepageLocale(listingRelease&&sourceUrl.search?await captureHomepage(db,tenant,request,liveQuery,pageRelease.release.path,sourceUrl,listingTitles,pageRelease.release.locale):await captureFor(pageRelease.release.path,pageRelease.release.policy?.outdated==='source-fallback'?listingTitles:undefined,pageRelease.release.locale),pageRelease.release):isHomepage?(selected?projectHomepageLocale(capture,selected.release):capture.result):await resolvePublicationVersionPage(capture.active.artifact,capture.active.pointer.hash,tenant,db,new Request(sourceUrl),{authenticated:false},liveQuery);
    if(!resolved)return null;
    if(selected&&!pageRelease&&!isHomepage){
        // Only the already approved shared shell is translated here. Other page copy stays source content.
        const layout=structuredClone(resolved.page.layout) as unknown as PageLayoutData;
        const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){if(node.type==='Navbar'||node.type==='Footer')for(const field of selected.release.catalog.filter(f=>f.blockId===node.id)){let target:any=node;for(const key of field.path.slice(0,-1)){if(!target||typeof target!=='object')break;target=target[key];}if(target&&typeof target==='object'&&typeof target[field.path.at(-1)!]==='string')target[field.path.at(-1)!]=field.text;}if(node.children)walk(node.children);}};walk(layout.content);
        layout.root={...layout.root,localeMessages:Object.fromEntries(selected.release.catalog.filter(f=>f.blockId==='$root').map(f=>[f.path.at(-1)!,f.text]))};
        resolved.page={...resolved.page,layout};
    }
    let templateSeo:import('@frontbase/edge-core/template-policy').TemplatePatch={};
    const policyLayout=resolved.page.layout as unknown as PageLayoutData;
    if(policyLayout.root?.templatePolicy){
        const route=policyLayout.root.publicationRecordContext as Record<string,unknown>|undefined;
        const presentation=templatePolicyPresentation(policyLayout,{title:resolved.page.title,summary:resolved.page.description},route?.collection?`${route.collection}:${route.recordId}`:'',current,route??{});
        const seo=presentation.values;templateSeo=seo;resolved.page={...resolved.page,layout:presentation.layout,title:seo.title||resolved.page.title,description:seo.description||resolved.page.description};
        resolved.document={...resolved.document,...(seo.indexing==='noindex'?{robots:'noindex, follow'}:{}),...(resolved.document.openGraph?{openGraph:{...resolved.document.openGraph,...(seo.image?{image:seo.image}:{})}}:{})};
    }
    const switcherLocales=[...new Set([...scopedLocales,...(current!==sourceLocale?[current]:[])])];
    resolved.page={...resolved.page,layout:addHomepageLanguageLinks(resolved.page.layout as unknown as PageLayoutData,sourceLocale,switcherLocales,current,sourceUrl.pathname+sourceUrl.search,origins)};
    const canonical=new URL(isHomepage?(selected?`/${current}/`:'/'):(pageRelease?`/${current}${sourceUrl.pathname}`:sourceUrl.pathname),resolved.document.canonicalUrl??request.url);
    // Alternates stay strictly per-path (no current-locale augmentation) and extend to plain
    // source-locale serves of released pages, so hreflang clusters stay reciprocal.
    const sourceServe=!matched;
    const alternates=isHomepage||pageRelease||sourceServe&&scopedLocales.length>0&&!url.search?homepageLanguageLinks(sourceLocale,scopedLocales,current,isHomepage?'/':sourceUrl.pathname).map(link=>({language:link.code,href:new URL(link.href,canonical).href})):undefined;
    // Language metadata follows the content, not the URL prefix: shared-shell fallback serves
    // keep the source locale's lang/dir so untranslated bodies never claim the page language.
    const contentLocale=pageRelease||isHomepage&&selected?current:sourceLocale;
    resolved.document={...resolved.document,language:contentLocale,direction:localeDirection(contentLocale),canonicalUrl:canonical.href,alternates,
        // SEO GAP-2: merge, never replace — the source document's image/imageAlt/type (and any
        // future keys) survive the localized serve; only identity fields are overridden.
        openGraph:{...resolved.document.openGraph,title:templateSeo.socialTitle||resolved.page.title,description:templateSeo.socialDescription||resolved.page.description,url:canonical.href,siteName:resolved.document.openGraph?.siteName??'',type:resolved.document.openGraph?.type??'website',locale:contentLocale},
        // og:locale follows the content locale; alternates mirror the per-path hreflang set minus current.
        localesAlternate:alternates?.map(link=>link.language).filter(code=>code!==contentLocale)};
    return {kind:'page' as const,resolved,siteHash:capture.active.pointer.hash,generation:capture.active.pointer.generation,releaseHash:selected?.pointer.hash??null,locale:current,contentLocale};
}
