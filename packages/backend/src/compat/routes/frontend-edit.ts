import {z} from 'zod';
import type {Hono} from 'hono';
import type {DbRunner} from '@frontbase/edge-infra';
import type {ConsoleAuthVars} from '../../mw/auth.js';
import type {PageLayoutData} from '@frontbase/edge-core';
import {PagesStore} from '../pages-store.js';
import {resolveReviewedSitePublication} from '../site-publication-serving.js';
import {resolveHomepageLanguageRequest,localizedListRequest} from '../translation-homepage-serving.js';
import {publicationListResponse} from '../publication-list-source.js';
import {resolveAppMenuLayout,readPublicSiteName} from '../menus-runtime.js';
import {SiteConfigurationStore} from '../site-configuration-store.js';
import {TranslationGenerationStore} from '../translation-generation.js';
import {copyDisplayLayout,copyFields,FrontendCopyStore,frontendEditorAllowed,projectFrontendCopy} from '../frontend-copy.js';
import {publicationHash} from '../publication-hash.js';
import {translationDisplayText} from '../translation-inputs.js';
import {publishedLiveQuery} from '../published-live-query.js';
import {publishFrontendTranslationEdits,readHomepagePointer} from '../translation-homepage.js';
import type {TranslationBatchHost} from '../translation-batches.js';
import {prepareFrontendRecordEdit} from '../frontend-records.js';
import {applyBlockVersion} from '@frontbase/edge-core/block-versions';

const pathSchema=z.string().min(1).max(2048).refine(value=>value.startsWith('/')&&!value.startsWith('//')&&!/[\\#\u0000-\u0020]/.test(value));
const selectionSchema=z.array(z.object({componentId:z.string().min(1).max(200),versionId:z.string().min(1).max(128),ids:z.array(z.string().min(1).max(160)).min(1).max(100)}).strict()).max(8);
const saveSchema=z.object({path:pathSchema,token:z.string().regex(/^[a-f0-9]{64}$/),operationId:z.string().uuid(),selection:selectionSchema.optional(),entries:z.array(z.object({id:z.string().regex(/^[a-f0-9]{64}$/),text:z.string().min(1).max(12000)}).strict()).min(1).max(100)}).strict();
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
export async function frontendCopySurface(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,owner:string,request:Request,path:string,selection?:z.infer<typeof selectionSchema>){
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
    if(selection?.length){
        const localizedRead=await localizedListRequest(db,owner,url.pathname,live);
        for(const item of selection){
            if(new Set(item.ids).size!==item.ids.length)throw Error('duplicate_record_selection');
            const headers=new Headers(request.headers);headers.set('X-Frontbase-List',encodeURIComponent(JSON.stringify({componentId:item.componentId,versionId:item.versionId,page:0,pageSize:item.ids.length,sortColumn:'id',direction:'asc',filters:[{column:'id',op:'in',value:item.ids}]})));
            const response=await publicationListResponse(db,owner,new Request(url,{headers}),null,localizedRead??undefined,live);
            if(!response?.ok)throw Error('record_selection_unavailable');const result=await response.json() as {rows:Record<string,unknown>[]};
            if(!Array.isArray(result.rows)||result.rows.length!==item.ids.length||result.rows.some(row=>!item.ids.includes(String(row.id))))throw Error('record_selection_unavailable');
            let installed=false;const visit=(nodes:typeof layout.content)=>{for(const node of nodes){if(node.id===item.componentId){const effective=applyBlockVersion(node,item.versionId);if(!effective.props?.binding)throw Error('record_binding_required');if(item.versionId==='default')node.props={...node.props,initialRows:result.rows};else{const version=node.versions?.find(version=>version.id===item.versionId);if(!version)throw Error('record_version_unavailable');version.overrides.props={...version.overrides.props,initialRows:result.rows};}installed=true;}if(node.children)visit(node.children);for(const version of node.versions??[])if(version.overrides.children)visit(version.overrides.children as typeof nodes);}};visit(layout.content);if(!installed)throw Error('record_selection_unavailable');
        }
    }
    const store=new FrontendCopyStore(db,owner),current=await store.read(),fields=await copyFields(pageId,layout,locale,current.catalog);
    const translationHash=localized?.kind==='page'?localized.releaseHash:null;
    const token=await publicationHash({owner,path,locale,version,translationHash,copy:current.hash,fields:fields.map(field=>[field.id,field.source,field.current])});
    return {store,current,fields,token,pageId,locale,sourceLocale,version,translationHash,layout};
}
export function registerFrontendEditRoutes(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,now:()=>string,translationHost:TranslationBatchHost){
    app.use('/api/frontend-edit/*',async(c,next)=>{
        c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
        if(!frontendEditorAllowed(c.get('principal')?.user))return c.json({detail:'Frontend editing is unavailable'},403);
        if(c.req.method!=='GET'&&(!sameEditorOrigin(c.req.raw)||c.req.header('x-frontbase-editor')!=='1'||c.req.header('sec-fetch-site')==='cross-site'))return c.json({detail:'Same-origin editor request required'},403);
        return next();
    });
    app.get('/api/frontend-edit/inventory/',async c=>{
        try{const path=pathSchema.parse(c.req.query('path')),raw=c.req.query('selection');if(raw&&raw.length>16000)throw Error();const selection=raw?selectionSchema.parse(JSON.parse(raw)):undefined,s=await frontendCopySurface(app,db,c.get('tenant'),c.req.raw,path,selection);
            return c.json({token:s.token,locale:s.locale,revision:s.current.hash,fields:s.fields.map(field=>({id:field.id,blockId:field.blockId,versionId:field.versionId,path:field.path,text:field.current,label:field.label,...(field.record?{recordScope:JSON.stringify([field.record.connectionId,field.record.collection]),recordKey:String(field.record.key[0]?.value),fieldKey:field.fieldKey??field.path.at(-1),destination:s.locale===s.sourceLocale?'record':'record-translation'}:{destination:'ui-copy'})}))});
        }catch{return c.json({detail:'This page is unavailable for text editing'},409);}
    });
    app.post('/api/frontend-edit/save/',async c=>{
        if(c.req.header('content-type')?.split(';')[0]!=='application/json')return c.json({detail:'JSON editor request required'},415);
        const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let raw='',size=0;
        try{if(!reader)throw Error();for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>200000){await reader.cancel();return c.json({detail:'Too many text changes'},413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();
            const body=saveSchema.parse(JSON.parse(raw));if(new Set(body.entries.map(entry=>entry.id)).size!==body.entries.length)throw Error();
            const s=await frontendCopySurface(app,db,c.get('tenant'),c.req.raw,body.path,body.selection);
            if(s.token!==body.token)return c.json({detail:'Copy or source changed. Your edits are retained; reload before merging.',code:'copy_conflict'},409);
            const edits=body.entries.map(entry=>{const field=s.fields.find(field=>field.id===entry.id);if(!field)throw Error();return{field,text:translationDisplayText(field.text,entry.text)};});
            const actor=String((c.get('principal').user as {id?:string}).id??'');if(!actor)throw Error();
            const sourcePath=body.path.startsWith('/'+s.locale+'/')?body.path.slice(s.locale.length+1).split('?')[0]||'/':body.path.split('?')[0]!;
            const records=edits.filter(edit=>edit.field.record),copy=edits.filter(edit=>!edit.field.record);
            // All destinations and values are validated before the first write. The page batch
            // spans independent stores; retain a private operation receipt rather than claim a
            // distributed transaction or blindly replay an uncertain provider response.
            const prepared=[];
            if(s.locale===s.sourceLocale)for(const edit of records){
                let schema:string|undefined;
                const visit=(nodes:typeof s.layout.content)=>{for(const node of nodes){if(node.id===edit.field.blockId){const effective=applyBlockVersion(node,edit.field.versionId??'default');schema=(effective.props?.binding as any)?.sourceSchema;}if(node.children)visit(node.children);for(const version of node.versions??[])if(version.overrides.children)visit(version.overrides.children as typeof nodes);}};visit(s.layout.content);
                prepared.push(await prepareFrontendRecordEdit(translationHost,db,c.get('tenant'),edit.field,edit.text,schema));
            }
            if(records.length&&s.locale!==s.sourceLocale&&(!s.translationHash||(await readHomepagePointer(db,c.get('tenant'),s.locale,sourcePath))?.hash!==s.translationHash))throw Error('record_translation_release_required');
            const additionalRecords=records.length&&s.locale!==s.sourceLocale?[...new Map((await frontendCopySurface(app,db,c.get('tenant'),c.req.raw,body.path.slice(s.locale.length+1)||'/',body.selection)).fields.filter(field=>field.record&&records.some(edit=>edit.field.id===field.id)).map(field=>[field.id,field])).values()]:[];
            if(records.length&&s.locale!==s.sourceLocale&&additionalRecords.length!==records.length)throw Error('record_source_unavailable');
            const unique=new Map<string,typeof prepared[number]>();for(const edit of prepared){const key=JSON.stringify(edit.identity),prior=unique.get(key);if(prior&&JSON.stringify(prior.after)!==JSON.stringify(edit.after))throw Error('conflicting_record_edits');unique.set(key,edit);}
            const receiptKey='frontend_edit_operation:v1:'+body.operationId,receipt={version:1,token:body.token,actor,state:'saving',saved:[] as string[],entries:body.entries};
            if(records.length){const claimed=await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[c.get('tenant'),receiptKey,JSON.stringify(receipt),now()]);if(claimed!==1)throw Error('editor_operation_already_attempted');}
            const checkpoint=async(value:string)=>{receipt.saved.push(value);await db.exec('UPDATE settings SET value=?,updated_at=? WHERE tenant_slug=? AND key=?',[JSON.stringify(receipt),now(),c.get('tenant'),receiptKey]);};
            for(const [key,edit]of unique){await edit.commit();await checkpoint(key);}
            if(records.length&&s.locale!==s.sourceLocale){await publishFrontendTranslationEdits(translationHost,db,c.get('tenant'),c.req.raw,s.locale,sourcePath,s.translationHash!,records.map(edit=>({...edit.field,replacement:edit.text})),actor,now(),publishedLiveQuery(value=>app.fetch(value)),additionalRecords,async()=>{const fresh=await frontendCopySurface(app,db,c.get('tenant'),c.req.raw,body.path.slice(s.locale.length+1)||'/',body.selection);for(const field of additionalRecords)if(!fresh.fields.some(candidate=>candidate.id===field.id&&candidate.source===field.source))throw Error('record_source_changed');});await checkpoint('record-translations');}
            // UI text, including a selected UI translation, belongs to active host state.
            if(copy.length)await s.store.save(s.current.hash,copy.map(edit=>({id:edit.field.id,locale:s.locale,source:edit.field.source,text:edit.text})),body.operationId,actor,now());
            if(records.length){receipt.state='complete';await checkpoint('complete');}
            return c.json({saved:edits.length,operationId:body.operationId});
        }catch{return c.json({detail:'Changes could not be confirmed. Keep your edits and reload in another tab before retrying.',code:'copy_not_confirmed'},409);}
    });
}
