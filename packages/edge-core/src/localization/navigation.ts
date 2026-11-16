/** Pure route projection, shared by SSR and the public navigation handler. */
export function localizePublicHref(href:string,locale:string,origins:string[]):string {
    if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)||!href||href.startsWith('#')||href.startsWith('//')||/[\\\u0000-\u0020]/.test(href))return href;
    let url:URL;
    try {url=new URL(href,origins[0]);}catch{return href;}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!origins.includes(url.origin))return href;
    if(!href.startsWith('/')&&!/^https?:\/\//i.test(href))return href;
    const path=url.pathname;
    if(/^\/(?:api|frontbase-admin|static|assets)(?:\/|$)/.test(path)||/\.(?:xml|txt|js|css|json|png|jpe?g|gif|svg|webp|avif|ico|pdf|zip|woff2?|mp4|webm)$/i.test(path))return href;
    if(path===`/${locale}`||path.startsWith(`/${locale}/`))return path+url.search+url.hash;
    return `/${locale}${path}`+url.search+url.hash;
}

const navigationKeys = new Set(['href','link','target','action','path','originalPath','detailPath','ctaHref','ctaLink','secondaryCtaLink','pageUrl']);
// This grammar needs no URL normalization. Dot segments, encoded path segments,
// empty query/fragment delimiters and complex URLs go through the normal parser.
const canonicalRelativeHref = /^(\/(?!\/)[\w/~\-]*)(?:\?[\w%~&=+.,\-]+)?(?:#[\w~.\-]+)?$/;
const internalPath = /^\/(?:api|frontbase-admin|static|assets)(?:\/|$)/;

/** Reuse URL work within one projection or render. The caller owns the lifetime. */
export function createPublicHrefLocalizer(locale: string, origins: string[]): (href: string) => string {
    const localizedRoot = localizePublicHref('/', locale, origins);
    const prefix = localizedRoot === '/' ? '' : localizedRoot.slice(0, -1);
    const memo = new Map<string, string>();
    return href => {
        const cached = memo.get(href);
        if (cached !== undefined) return cached;
        const path = prefix && canonicalRelativeHref.exec(href)?.[1];
        const result = path
            ? internalPath.test(path) || path === prefix || path.startsWith(localizedRoot) ? href : prefix + href
            : localizePublicHref(href, locale, origins);
        if (memo.size < 512 && href.length <= 2048) memo.set(href, result);
        return result;
    };
}

/** Project only navigation values. Never rewrite content, image sources, bindings or secrets. */
export function localizeNavigationProps<T>(input:T,locale:string,origins:string[]):T {
    const localize = createPublicHrefLocalizer(locale, origins);
    const walk=(value:unknown,key=''):unknown=>{
        if(key==='languageSwitcher')return value;
        if(typeof value==='string')return navigationKeys.has(key)&&!value.includes('{{')?localize(value):value;
        if(Array.isArray(value)){
            let result:unknown[]|undefined;
            for(let i=0;i<value.length;i++){const next=walk(value[i],key);if(next!==value[i]){result??=value.slice();result[i]=next;}}
            return result??value;
        }
        if(value&&typeof value==='object'){
            const values = value as Record<string, unknown>;
            let result:Record<string,unknown>|undefined;
            for(const k of Object.keys(values)){const v=values[k],next=walk(v,k);if(next!==v){result??={...values};result[k]=next;}}
            return result??value;
        }
        return value;
    };
    return walk(input) as T;
}
