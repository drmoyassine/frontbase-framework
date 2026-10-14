import {z} from 'zod';
import type {Hono} from 'hono';
import type {DbRunner} from '@frontbase/edge-infra';
import type {ConsoleAuthVars} from '../../mw/auth.js';
import {menuDocumentSchema,type MenuItem} from '@frontbase/edge-core/menus';
import {MenusStore} from '../menus-store.js';
import type {KeyValueStore} from '../store.js';
import {PagesStore} from '../pages-store.js';
import {renderPage,buildTemplateContext} from '@frontbase/edge-core';
import {menuDefinitionSchema,menuAudienceMatches} from '@frontbase/edge-core/menus';
import {menuComponent} from '@frontbase/edge-core/menu-components';
import {FALLBACK_CSS} from '@frontbase/edge-core/ssr/baseStyles';
import {menuPublicationPlan,prepareMenuCapture} from '../menus-capture.js';
import {SiteConfigurationStore} from '../site-configuration-store.js';
import {MenusSnapshotStore} from '../menus-snapshot.js';
import {resolveAppMenuLayout,readPublicSiteName} from '../menus-runtime.js';
const input=z.object({expectedRevision:z.number().int().min(0).max(2147483646),menus:menuDocumentSchema.innerType().shape.menus}).strict();
const admin=(c:any)=>['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(c.get('principal')?.user?.role);
function options(project:Record<string,unknown>){
    const cfg=project.usersConfig as Record<string,any>|undefined;
    const dictionary=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([k,v])=>k.length>0&&k.length<=100&&!/[\x00-\x1f]/.test(k)&&typeof v==='string'&&v.length<=200)):{};
    return{enabled:cfg?.enabled===true,authConfigured:typeof cfg?.authDataSourceId==='string'&&!!cfg.authDataSourceId,contactsConfigured:!!(cfg?.contactsTable&&cfg?.columnMapping?.authUserIdColumn&&cfg?.columnMapping?.contactTypeColumn&&cfg?.columnMapping?.permissionLevelColumn),contactTypes:dictionary(cfg?.contactTypes),permissionLevels:dictionary(cfg?.permissionLevels)};
}
export function registerMenusRoutes(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,kvFor:(owner:string)=>KeyValueStore,now:()=>string){
    const boundedBody=async(request:Request,max:number)=>{const reader=request.body?.getReader(),decoder=new TextDecoder();let raw='',size=0;if(reader){while(true){const part=await reader.read();if(part.done)break;if((size+=part.value.length)>max){await reader.cancel();throw Error('body_too_large');}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}return JSON.parse(raw);};
    app.post('/api/project/menus/reference/',async c=>{
        c.header('Cache-Control','no-store');if(!admin(c))return c.json({detail:'Shared menus unavailable'},403);if(new URL(c.req.url).searchParams.size)return c.json({detail:'Invalid menu reference'},422);
        try{const input=z.object({pageId:z.string().uuid(),expectedRevision:z.number().int().positive()}).strict().parse(await boundedBody(c.req.raw,4096)),owner=c.get('tenant'),page=await new PagesStore(db,owner).get(input.pageId);
            if(!page||page.deleted_at)return c.json({detail:'Page unavailable'},404);
            const document=await new MenusStore(db,owner).get();if(document.revision!==input.expectedRevision)return c.json({detail:'Menus changed. Reload before linking.'},409);
            const hash=await new MenusSnapshotStore(db,owner).prepare(document,now());return c.json({schemaVersion:1,hash,pageId:page.id});
        }catch(error){return c.json({detail:'Shared menus unavailable'},error instanceof Error&&error.message==='body_too_large'?413:422);}
    });
    app.post('/api/project/menus/canvas/',async c=>{
        c.header('Cache-Control','no-store');if(!admin(c)&&c.get('principal')?.user?.role!=='editor')return c.json({detail:'Shared menus preview unavailable'},403);if(new URL(c.req.url).searchParams.size)return c.json({detail:'Invalid menu preview'},422);
        try{const input=z.object({pageId:z.string().uuid(),path:z.string().startsWith('/').max(400),layout:z.object({root:z.record(z.unknown()),content:z.array(z.unknown()).max(3000)}).strict()}).strict().parse(await boundedBody(c.req.raw,2*1024*1024)),owner=c.get('tenant'),page=await new PagesStore(db,owner).get(input.pageId);
            if(!page||page.deleted_at)return c.json({detail:'Page unavailable'},404);
            const layout=await resolveAppMenuLayout(db,owner,input.layout as import('@frontbase/edge-core').PageLayoutData,input.path,null,await readPublicSiteName(db,owner),page.id);return c.json({layout});
        }catch(error){return c.json({detail:'Shared menus preview unavailable'},error instanceof Error&&error.message==='body_too_large'?413:422);}
    });
    app.get('/api/project/menus/publication-plan/',async c=>{
        c.header('Cache-Control','no-store');if(!admin(c))return c.json({detail:'Menu publication unavailable'},403);if(new URL(c.req.url).searchParams.size)return c.json({detail:'Unexpected query parameters'},422);
        try{return c.json(await menuPublicationPlan(db,c.get('tenant')));}catch{return c.json({detail:'Menu publication unavailable'},503);}
    });
    app.post('/api/project/menus/prepare/',async c=>{
        c.header('Cache-Control','no-store');if(!admin(c))return c.json({detail:'Menu publication unavailable'},403);if(new URL(c.req.url).searchParams.size)return c.json({detail:'Unexpected query parameters'},422);
        const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let raw='',size=0;if(reader){while(true){const part=await reader.read();if(part.done)break;if((size+=part.value.length)>256*1024){await reader.cancel();return c.json({detail:'Menu publication request too large'},413);}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}
        try{return c.json(await prepareMenuCapture(db,c.get('tenant'),JSON.parse(raw),now()));}catch(error){
            const message=error instanceof Error?error.message:'';return c.json({detail:message==='menu_placement_conflict'?'Resolve equal-priority menu placements before publishing.':message==='menu_legacy_region_conflict'?'Select existing header/footer nodes to replace before preparing.':message==='menu_removal_invalid'?'The selected replacement nodes changed or contain page data. Reload the plan.':'Menu preparation unavailable. Reload the draft and publication plan.'},['menus_changed','menu_base_changed','publication_configuration_conflict'].includes(message)?409:422);
        }
    });
    app.post('/api/project/menus/preview/',async c=>{
        c.header('Cache-Control','no-store');if(!admin(c))return c.json({detail:'Menu preview unavailable'},403);if(new URL(c.req.url).searchParams.size)return c.json({detail:'Unexpected query parameters'},422);
        const body=c.req.raw.body?.getReader();let raw='',bytes=0;const decoder=new TextDecoder();
        if(body){while(true){const part=await body.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>128*1024){await body.cancel();return c.json({detail:'Menu preview too large'},413);}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}
        try{
            const value=z.object({menu:menuDefinitionSchema,audience:z.object({authenticated:z.boolean(),contactType:z.string().max(100).optional(),permissionLevel:z.string().max(100).optional()}).strict()}).strict().parse(JSON.parse(raw));
            const project=(await kvFor(c.get('tenant')).getJson('project',{})) as Record<string,unknown>,opts=options(project);
            if(value.audience.contactType&&!Object.hasOwn(opts.contactTypes,value.audience.contactType)||value.audience.permissionLevel&&!Object.hasOwn(opts.permissionLevels,value.audience.permissionLevel))return c.json({detail:'Preview audience unavailable'},422);
            const context=await buildTemplateContext(c.req.raw,{id:value.menu.id,title:'Menu design preview',slug:'menu-preview',published:false,createdAt:now(),updatedAt:now()},undefined,undefined,c.get('tenant'));
            const visible=menuAudienceMatches(value.menu.audience,value.audience);
            const siteName=(await new SiteConfigurationStore(db,c.get('tenant')).get())?.configuration.site.name??'';
            const html=visible?await renderPage({root:{},content:[menuComponent(value.menu,value.audience,siteName)]},context):'<p style="padding:24px">This menu is hidden for the selected audience.</p>';
            return c.html(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http:; base-uri 'none'; form-action 'none'"><style>${FALLBACK_CSS}</style></head><body>${html}</body></html>`);
        }catch{return c.json({detail:'Menu preview unavailable or invalid'},422);}
    });
    app.get('/api/project/menus/',async c=>{
        c.header('Cache-Control','no-store');if(!admin(c))return c.json({detail:'Menus unavailable'},403);if(new URL(c.req.url).searchParams.size)return c.json({detail:'Unexpected query parameters'},422);
        try{const owner=c.get('tenant'),project=(await kvFor(owner).getJson('project',{})??{}) as Record<string,unknown>;return c.json({document:await new MenusStore(db,owner).get(),audiences:options(project),pages:(await new PagesStore(db,owner).list()).filter(p=>!p.deleted_at).map(p=>({id:p.id,name:p.name,path:p.is_homepage?'/':p.slug}))});}catch{return c.json({detail:'Menus unavailable'},503);}
    });
    app.put('/api/project/menus/',async c=>{
        c.header('Cache-Control','no-store');if(!admin(c))return c.json({detail:'Menus editing unavailable'},403);if(new URL(c.req.url).searchParams.size)return c.json({detail:'Unexpected query parameters'},422);
        let raw='';const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let bytes=0;
        if(reader){while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>256*1024){await reader.cancel();return c.json({detail:'Menus too large'},413);}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}
        let parsed:z.infer<typeof input>;try{parsed=input.parse(JSON.parse(raw));menuDocumentSchema.parse({schemaVersion:1,revision:0,menus:parsed.menus});}catch{return c.json({detail:'Invalid menus'},422);}
        try{
            const owner=c.get('tenant'),project=(await kvFor(owner).getJson('project',{})??{}) as Record<string,unknown>,audiences=options(project),ids=new Set((await new PagesStore(db,owner).list()).filter(p=>!p.deleted_at).map(p=>p.id));
            const validate=(rule:{contactTypes:string[];permissionLevels:string[]})=>rule.contactTypes.every(k=>Object.hasOwn(audiences.contactTypes,k))&&rule.permissionLevels.every(k=>Object.hasOwn(audiences.permissionLevels,k));
            const walk=(items:MenuItem[]):boolean=>items.every(i=>validate(i.audience)&&walk(i.children));
            if(parsed.menus.some(m=>!validate(m.audience)||!walk(m.items)||[...m.placement.pageIds,...m.placement.excludePageIds].some(id=>!ids.has(id))))return c.json({detail:'Menu audience or page reference is unavailable'},422);
            const saved=await new MenusStore(db,owner).save(parsed.menus,parsed.expectedRevision,now());return saved?c.json(saved):c.json({detail:'Menus changed; reload before saving'},409);
        }catch{return c.json({detail:'Menus unavailable; reload before saving'},503);}
    });
}
