import {z} from 'zod';
import type {Hono} from 'hono';
import type {DbRunner} from '@frontbase/edge-infra';
import type {ConsoleAuthVars} from '../../mw/auth.js';
import type {PageLayoutData} from '@frontbase/edge-core';
import {PagesStore} from '../pages-store.js';
import {resolveReviewedSitePublication} from '../site-publication-serving.js';
import {resolveHomepageLanguageRequest} from '../translation-homepage-serving.js';
import {resolveAppMenuLayout,readPublicSiteName} from '../menus-runtime.js';
import {SiteConfigurationStore} from '../site-configuration-store.js';
import {TranslationGenerationStore} from '../translation-generation.js';
import {copyDisplayLayout,copyFields,FrontendCopyStore,frontendEditorAllowed,projectFrontendCopy} from '../frontend-copy.js';
import {publicationHash} from '../publication-hash.js';
import {translationDisplayText} from '../translation-inputs.js';
import {publishedLiveQuery} from '../published-live-query.js';
import {publishFrontendTranslationEdits,readHomepagePointer} from '../translation-homepage.js';
import type {TranslationBatchHost} from '../translation-batches.js';

const pathSchema=z.string().min(1).max(2048).refine(value=>value.startsWith('/')&&!value.startsWith('//')&&!/[\\#\u0000-\u0020]/.test(value));
const saveSchema=z.object({path:pathSchema,token:z.string().regex(/^[a-f0-9]{64}$/),operationId:z.string().uuid(),entries:z.array(z.object({id:z.string().regex(/^[a-f0-9]{64}$/),text:z.string().min(1).max(12000)}).strict()).min(1).max(100)}).strict();
export function sameEditorOrigin(request:Request):boolean{
    try{const raw=request.headers.get('origin');if(!raw)return false;const origin=new URL(raw),target=new URL(request.url);
        // TLS-terminating self-host proxies retain Host but deliver HTTP internally. Permit only
        // that scheme upgrade on the exact host/port; never trust arbitrary forwarded headers.
        return raw===origin.origin&&origin.host===target.host&&(origin.protocol===target.protocol||origin.protocol==='https:'&&target.protocol==='http:');
    }catch{return false;}
}
export async function frontendSourceLocale(db:DbRunner,owner:string){return (await new TranslationGenerationStore(db,owner).get()).configuration?.sourceLocale??(await new SiteConfigurationStore(db,owner).get())?.configuration.site.locale??'en';}
export async function projectSourceFrontendCopy(db:DbRunner,owner:string,pageId:string,layout:PageLayoutData){
    if(!(await new FrontendCopyStore(db,owner).read()).catalog)return {layout,hash:null};
    return projectFrontendCopy(db,owner,pageId,layout,await frontendSourceLocale(db,owner));
}
/** Same public resolver as serving, no draft preview, fabricated owner or credential elevation. */
export async function frontendCopySurface(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,owner:string,request:Request,path:string){
    pathSchema.parse(path);const url=new URL(path,request.url);
    if(url.origin!==new URL(request.url).origin||/^\/(?:api|frontbase-admin|frontbase-setup|builder|static|assets)(?:\/|$)/i.test(url.pathname))throw Error('page_unavailable');
    const pageRequest=new Request(url,{headers:request.headers}),live=publishedLiveQuery(value=>app.fetch(value));
    const localized=await resolveHomepageLanguageRequest(db,owner,pageRequest,live);
    const sourceLocale=await frontendSourceLocale(db,owner);
    let layout:PageLayoutData,pageId:string,locale=localized?.kind==='page'?localized.locale:sourceLocale,version:string;
    if(localized?.kind==='redirect')throw Error('page_redirect');
    const reviewed=localized?.kind==='page'?null:await resolveReviewedSitePublication(db,owner,pageRequest,null,live);
    if(localized?.kind==='page'||reviewed?.status==='resolved'){
        const result=localized?.kind==='page'?localized.resolved:reviewed?.status==='resolved'?reviewed.result:null;
        if(!result)throw Error('page_unavailable');layout=result.page.layout as unknown as PageLayoutData;version=result.version;pageId=result.sourcePageId;
    }else{
        if(reviewed?.status!=='inactive')throw Error('page_unavailable');
        const pages=new PagesStore(db,owner),page=url.pathname==='/'?await pages.homepage():await pages.getBySlug(decodeURIComponent(url.pathname.replace(/^\/|\/$/g,'')));
        if(!page||!page.is_published)throw Error('page_unavailable');
        layout=await resolveAppMenuLayout(db,owner,JSON.parse(page.layout_data),url.pathname,{authenticated:false},await readPublicSiteName(db,owner),page.id);
        pageId=page.id;version=page.content_hash??await publicationHash(page.layout_data);
    }
    layout=copyDisplayLayout(layout);
    const store=new FrontendCopyStore(db,owner),current=await store.read(),fields=await copyFields(pageId,layout,locale,current.catalog);
    const translationHash=localized?.kind==='page'?localized.releaseHash:null;
    const token=await publicationHash({owner,path,locale,version,translationHash,copy:current.hash,fields:fields.map(field=>[field.id,field.source,field.current])});
    return {store,current,fields,token,pageId,locale,sourceLocale,version,translationHash};
}
export function registerFrontendEditRoutes(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,now:()=>string,translationHost:TranslationBatchHost){
    app.use('/api/frontend-edit/*',async(c,next)=>{
        c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
        if(!frontendEditorAllowed(c.get('principal')?.user))return c.json({detail:'Frontend editing is unavailable'},403);
        if(c.req.method!=='GET'&&(!sameEditorOrigin(c.req.raw)||c.req.header('x-frontbase-editor')!=='1'||c.req.header('sec-fetch-site')==='cross-site'))return c.json({detail:'Same-origin editor request required'},403);
        return next();
    });
    app.get('/api/frontend-edit/inventory/',async c=>{
        try{const path=pathSchema.parse(c.req.query('path')),s=await frontendCopySurface(app,db,c.get('tenant'),c.req.raw,path);
            return c.json({token:s.token,locale:s.locale,revision:s.current.hash,fields:s.fields.map(field=>({id:field.id,blockId:field.blockId,versionId:field.versionId,path:field.path,text:field.current,label:field.label}))});
        }catch{return c.json({detail:'This page is unavailable for text editing'},409);}
    });
    app.post('/api/frontend-edit/save/',async c=>{
        if(c.req.header('content-type')?.split(';')[0]!=='application/json')return c.json({detail:'JSON editor request required'},415);
        const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let raw='',size=0;
        try{if(!reader)throw Error();for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>200000){await reader.cancel();return c.json({detail:'Too many text changes'},413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();
            const body=saveSchema.parse(JSON.parse(raw));if(new Set(body.entries.map(entry=>entry.id)).size!==body.entries.length)throw Error();
            const s=await frontendCopySurface(app,db,c.get('tenant'),c.req.raw,body.path);
            if(s.token!==body.token)return c.json({detail:'Copy or source changed. Your edits are retained; reload before merging.',code:'copy_conflict'},409);
            const entries=body.entries.map(entry=>{const field=s.fields.find(field=>field.id===entry.id);if(!field)throw Error();return{id:field.id,locale:s.locale,source:field.source,text:translationDisplayText(field.text,entry.text)};});
            const actor=String((c.get('principal').user as {id?:string}).id??'');if(!actor)throw Error();
            const sourcePath=body.path.startsWith('/'+s.locale+'/')?body.path.slice(s.locale.length+1).split('?')[0]||'/':body.path.split('?')[0]!;
            if(s.locale!==s.sourceLocale&&s.translationHash&&(await readHomepagePointer(db,c.get('tenant'),s.locale,sourcePath))?.hash===s.translationHash){
                const edits=body.entries.map(entry=>({...s.fields.find(field=>field.id===entry.id)!,replacement:entry.text}));
                return c.json(await publishFrontendTranslationEdits(translationHost,db,c.get('tenant'),c.req.raw,s.locale,sourcePath,s.translationHash,edits,actor,now(),publishedLiveQuery(value=>app.fetch(value))));
            }
            return c.json(await s.store.save(s.current.hash,entries,body.operationId,actor,now()));
        }catch{return c.json({detail:'Changes could not be confirmed. Keep your edits and reload in another tab before retrying.',code:'copy_not_confirmed'},409);}
    });
}
