import {z} from 'zod';
import type {Hono} from 'hono';
import type {DbRunner} from '@frontbase/edge-infra';
import type {ConsoleAuthVars} from '../../mw/auth.js';
import type {PageLayoutData} from '@frontbase/edge-core';
import {sitePageReferenceSchema,liveViewBindings} from '@frontbase/edge-core/directory/configuration';
import {PagesStore} from '../pages-store.js';
import {SiteConfigurationStore} from '../site-configuration-store.js';
import {LiveLayoutPublicationStore,liveLayoutPublicationSchema} from '../live-layout-publication.js';
import {consoleDataAdministrator,protectPublishedLiveSource} from '../published-live-access.js';
import {TranslationGenerationStore} from '../translation-generation.js';
import {resolveDirectoryViewScope,type LiveLayoutHost} from '../live-layout-reader.js';
import {renderLiveLayoutPublication} from '../live-layout-serving.js';
import {publicationBindingDiagnostics} from '../publication-binding-diagnostics.js';
import {publishedLiveQuery} from '../published-live-query.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const prepare=z.object({pageIds:z.array(z.string().uuid()).min(1).max(1000),locales:z.array(z.string()).min(1).max(40),expectedConfigurationRevision:z.number().int().positive()}).strict();
const publish=z.object({hash,expected:z.object({hash,generation:z.number().int().positive()}).strict().nullable()}).strict();

/** Publishing stores structure only. Data and translation heads are read at request time. */
export function registerLiveLayoutPublicationRoutes(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,now:()=>string,host:LiveLayoutHost){
    app.use('/api/project/live-layout/*',async(c,next)=>{
        c.header('Cache-Control','no-store');
        if(!consoleDataAdministrator(c.get('principal')))return c.json({detail:'Administrator access required'},403);
        await next();
    });
    app.get('/api/project/live-layout/',async c=>{
        const active=await new LiveLayoutPublicationStore(db,c.get('tenant')).activeForServing();
        const draft=await new SiteConfigurationStore(db,c.get('tenant')).get();
        const generation=await new TranslationGenerationStore(db,c.get('tenant')).get();
        const source=draft?.configuration.site.locale??'en';
        return c.json({pointer:active?.pointer??null,mode:active?'live':null,pageIds:active?[...active.layout.templates,...active.layout.staticPages].map(page=>page.pageId):[],locales:active?.layout.locales??[source],availableLocales:[...new Set([source,...generation.configuration?.targetLocales??[],...active?.layout.locales??[]])]});
    });
    app.get('/api/project/live-layout/render/',async c=>{
        try{
            const id=hash.parse(c.req.query('hash')),path=c.req.query('path')??'/';
            if(path.length>2048||!path.startsWith('/')||path.startsWith('//')||/[\\\u0000-\u0020]/.test(path))return c.json({detail:'Invalid preview path'},422);
            const url=new URL(path,c.req.url);if(url.origin!==new URL(c.req.url).origin)return c.json({detail:'Invalid preview path'},422);
            const release=await new LiveLayoutPublicationStore(db,c.get('tenant')).open(id);if(!release)return c.json({detail:'Prepared layout not found'},404);
            const response=await renderLiveLayoutPublication(db,c.get('tenant'),new Request(url,{headers:c.req.raw.headers}),{host,liveQuery:publishedLiveQuery(request=>app.fetch(request)),prepared:{pointer:{hash:id,generation:1},...release}});
            if(!response)return c.json({detail:'Prepared page unavailable'},404);
            const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');
            return new Response(response.body,{status:response.status,headers});
        }catch{return c.json({detail:'Prepared page unavailable'},422);}
    });
    for(const action of ['prepare','publish'] as const)app.post('/api/project/live-layout/'+action+'/',async c=>{
        const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let text='',size=0;
        if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>65536){await reader.cancel();return c.json({detail:'Request is too large'},413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
        let input:unknown;try{input=JSON.parse(text);}catch{return c.json({detail:'Invalid request'},422);}
        const owner=c.get('tenant'),store=new LiveLayoutPublicationStore(db,owner);
        try{
            if(action==='publish'){
                const parsed=publish.safeParse(input);if(!parsed.success)return c.json({detail:'Invalid publication request'},422);
                const layout=await store.get(parsed.data.hash);if(!layout)return c.json({detail:'Prepared layout not found'},404);
                try{await resolveDirectoryViewScope(host,owner,layout.configuration);}
                catch{return c.json({detail:'A detail layout Saved View changed. Check its source table and schema, then review again.',code:'detail_view_mismatch'},422);}
                const sources=new Set([layout.configuration.datasourceId,...[...layout.templates,...layout.staticPages].flatMap(page=>liveViewBindings(page.layout as unknown as PageLayoutData).map(binding=>binding.dataSourceId))]);
                for(const source of sources)if(source!=='frontbase:publication')await protectPublishedLiveSource(db,owner,source,now());
                const pointer=await store.publish(parsed.data.hash,parsed.data.expected,now());
                return pointer?c.json({pointer,mode:'live'}):c.json({detail:'Publication changed. Review the current layout before retrying.'},409);
            }
            const parsed=prepare.safeParse(input);if(!parsed.success)return c.json({detail:'Invalid layout request'},422);
            const draft=await new SiteConfigurationStore(db,owner).get();
            if(!draft||draft.revision!==parsed.data.expectedConfigurationRevision)return c.json({detail:'Configuration changed. Reload and review.'},409);
            if(new Set(parsed.data.pageIds).size!==parsed.data.pageIds.length)return c.json({detail:'Duplicate page'},422);
            try{await resolveDirectoryViewScope(host,owner,draft.configuration);}
            catch{return c.json({detail:'A detail layout Saved View is unavailable or uses a different source table or schema. Update its Builder binding.',code:'detail_view_mismatch'},422);}
            const pages=new PagesStore(db,owner),templates:unknown[]=[],staticPages:unknown[]=[];
            const authoredPages:{pageId:string;layout:PageLayoutData}[]=[];
            for(const id of parsed.data.pageIds){
                const page=await pages.get(id);if(!page||page.deleted_at||!page.is_public)return c.json({detail:'Page is not available for publication'},422);
                const layout=JSON.parse(page.layout_data),base={pageId:id,title:page.title??page.name,description:page.description??'',layout};
                authoredPages.push({pageId:id,layout});
                const reference=sitePageReferenceSchema.safeParse(layout.root?.siteConfiguration);
                if(reference.success)templates.push({...base,role:reference.data.role});
                else if(layout.root?.siteConfiguration!==undefined)return c.json({detail:'Invalid template reference'},422);
                else staticPages.push({...base,originalPath:page.is_homepage?'/':'/'+page.slug.replace(/^\/+|\/+$/g,'')+'/'});
            }
            const elementIssues=await publicationBindingDiagnostics(authoredPages,async path=>{
                const headers=new Headers();for(const name of ['cookie','authorization']){const value=c.req.header(name);if(value)headers.set(name,value);}
                const response=await app.fetch(new Request(new URL(path,c.req.url),{headers}));if(!response.ok)throw Error('binding_resource_unavailable');return response.json();
            });
            if(elementIssues.length)return c.json({detail:'Resolve the listed element bindings before publishing.',code:'publication_elements_incomplete',elementIssues},422);
            const layout=liveLayoutPublicationSchema.parse({schemaVersion:3,runtimeVersion:'live-layout-v1',configuration:draft.configuration,templates,staticPages,locales:parsed.data.locales});
            const id=await store.prepare(layout,now());return c.json({hash:id,mode:'live',pageCount:templates.length+staticPages.length});
        }catch{return c.json({detail:'Layout publication could not be completed. Check its bindings and configuration.'},422);}
    });
}

/** After migration, legacy captures are history only; never prepare or activate them again. */
export function registerSnapshotRetirement(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner){
    const roots=['/api/project/site-configuration/publication/','/api/project/translation-batches/homepage/'];
    for(const root of roots)app.use(root+'*',async(c,next)=>{
        if(!consoleDataAdministrator(c.get('principal')))return next();
        const action=new URL(c.req.url).pathname.slice(root.length);
        if(['state/','history/','versions/'].includes(action)&&c.req.method==='GET')return next();
        if(root.includes('site-configuration')&&action==='read/'&&c.req.method==='POST')return next();
        const active=await new LiveLayoutPublicationStore(db,c.get('tenant')).activeForServing();
        if(!active)return next();
        c.header('Cache-Control','no-store');
        if(root.includes('homepage')&&action==='workspace/'&&c.req.method==='GET')return c.json({mode:'live',locales:active.layout.locales,sourceLocale:active.layout.configuration.site.locale});
        return c.json({code:'snapshot_publication_retired',detail:'This site serves current records and translations. Publish layout changes from the builder; edit translated text on the page. Data edits do not need republishing.'},410);
    });
}
