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
        if(Array.isArray(value)){
            let result:unknown[]|undefined;
            for(let i=0;i<value.length;i++){const next=walk(value[i],key);if(next!==value[i]){result??=value.slice();result[i]=next;}}
            return result??value;
        }
        if(value&&typeof value==='object'){
            let result:Record<string,unknown>|undefined;
            for(const [k,v]of Object.entries(value)){const next=walk(v,k);if(next!==v){result??={...value};result[k]=next;}}
            return result??value;
        }
        return value;
    };
    return walk(input) as T;
}
