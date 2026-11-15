import type {LiveLayoutPublication} from './live-layout-publication.js';
import type {LivePageReader} from './live-layout-runtime.js';

const xml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
/** Small live shards avoid reading or serializing the entire database on a Free Worker. */
export async function liveLayoutSitemap(layout:LiveLayoutPublication,reader:LivePageReader,owner:string,request:Request):Promise<Response|null>{
    const url=new URL(request.url),origin=layout.configuration.site.origin;
    if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /\nSitemap: '+new URL('/sitemap.xml',origin).href+'\n',{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
    const match=/^\/sitemap-live-(static|institution|program|article|page)-(\d+)\.xml$/.exec(url.pathname);
    if(url.pathname!=='/sitemap.xml'&&!match)return null;
    const reply=(body:string,status=200)=>new Response(request.method==='HEAD'?null:body,{status,headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
    if(url.search)return reply('',400);
    const roles:string[]=layout.templates.map(template=>template.role==='editorial'?'page':template.role).filter(role=>['institution','program','article','page'].includes(role));
    const limit=layout.configuration.browsing.pageSize;
    const staticPaths=[...layout.staticPages.map(page=>page.originalPath),...layout.templates.flatMap(page=>page.role==='directory'?[layout.configuration.routes.directory]:page.role==='article-index'?[layout.configuration.routes.blog]:[])];
    if(!match){
        const counts=await Promise.all(roles.map(async role=>({role,total:Number((await reader.queries['directory.'+role+'.count']!.execute({},{tenant:owner}))[0]!.total)})));
        if(counts.some(({total})=>!Number.isSafeInteger(total)||total>20000))throw Error('live_sitemap_capacity');
        const shards=['/sitemap-live-static-0.xml',...counts.flatMap(({role,total})=>Array.from({length:Math.ceil(Math.min(total,20000)/limit)},(_,index)=>'/sitemap-live-'+role+'-'+index+'.xml'))];
        return reply('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+shards.map(path=>'<sitemap><loc>'+xml(new URL(path,origin).href)+'</loc></sitemap>').join('')+'</sitemapindex>');
    }
    const role=match[1]!,page=Number(match[2]),offset=page*limit;
    if(!Number.isSafeInteger(page)||offset>19999||role==='static'&&page!==0||role!=='static'&&!roles.includes(role))return reply('',404);
    const paths=role==='static'?staticPaths:(await reader.queries['directory.'+role+'.routes']!.execute({offset,limit},{tenant:owner})).slice(0,limit).flatMap(row=>typeof row.originalPath==='string'?[row.originalPath]:[]);
    return reply('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...new Set(paths)].flatMap(path=>layout.locales.map(locale=>'<url><loc>'+xml(new URL(locale===layout.configuration.site.locale?path:'/'+locale+path,origin).href)+'</loc></url>')).join('')+'</urlset>');
}
