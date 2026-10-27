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
/** Project only navigation values. Never rewrite content, image sources, bindings or secrets. */
export function localizeNavigationProps<T>(input:T,locale:string,origins:string[]):T {
    const keys=new Set(['href','link','target','action','path','originalPath','detailPath','ctaHref','ctaLink','secondaryCtaLink','pageUrl']);
    const walk=(value:unknown,key=''):unknown=>{
        if(key==='languageSwitcher')return value;
        if(typeof value==='string')return keys.has(key)&&!value.includes('{{')?localizePublicHref(value,locale,origins):value;
        if(Array.isArray(value))return value.map(item=>walk(item,key));
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,k)]));
        return value;
    };
    return walk(input) as T;
}
