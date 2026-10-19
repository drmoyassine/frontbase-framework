import {z} from 'zod';
import type {Hono} from 'hono';
import type {DbRunner} from '@frontbase/edge-infra';
import type {ConsoleAuthVars} from '../../mw/auth.js';
import type {TranslationBatchHost} from '../translation-batches.js';
import {reviewHomepage,saveHomepageTranslations,prepareHomepageLocale,activateHomepageLocale,captureHomepage,readHomepageRelease,projectHomepageLocale} from '../translation-homepage.js';
import {publishedLiveQuery} from '../published-live-query.js';
import {addHomepageLanguageLinks} from '../translation-homepage-serving.js';
import {createEngine,directProvider,type PageLayoutData} from '@frontbase/edge-core';

async function body(request:Request){const reader=request.body?.getReader();if(!reader)throw Error();let size=0,text='';const decoder=new TextDecoder();while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>400000){await reader.cancel();throw Error();}text+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(text+decoder.decode());}
/** Registered under the existing administrator-only/no-store translation batch middleware. */
export function registerTranslationHomepageRoutes(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,host:TranslationBatchHost,now:()=>string){
    const root='/api/project/translation-batches/homepage/';
    const live=(url:string)=>publishedLiveQuery(request=>app.fetch(new Request(new URL('/api/data/execute',url),request)));
    app.get(root+'review/',async c=>{try{return c.json(await reviewHomepage(host,db,c.get('tenant'),c.req.raw,c.req.query('locale')??'',live(c.req.url)));}catch(error){const codes=new Set(['translation_storage_unavailable','homepage_source_unavailable','translation_read_unavailable']);const code=error instanceof Error&&codes.has(error.message)?error.message:'unavailable';return c.json({detail:'Published homepage translations are unavailable. Check the active reviewed homepage and translation storage.',code},422);}});
    app.post(root+'save/',async c=>{try{return c.json(await saveHomepageTranslations(host,db,c.get('tenant'),c.req.raw,await body(c.req.raw),live(c.req.url)));}catch(error){const codes=new Set(['homepage_review_unavailable','source_changed','unknown_field','revision_changed','source_sync_unavailable','source_sync_conflict','translation_write_unavailable','translation_write_refused']);const code=error instanceof Error&&codes.has(error.message)?error.message:'unavailable';return c.json({detail:'Some drafts may have saved. Reload the review before retrying; source, settings or a translation may have changed.',code},409);}});
    app.post(root+'prepare/',async c=>{try{const input=z.object({locale:z.string(),token:z.string(),approveTranslations:z.literal(true)}).strict().parse(await body(c.req.raw));return c.json(await prepareHomepageLocale(host,db,c.get('tenant'),c.req.raw,input.locale,input.token,String(c.get('principal').user!.id),now(),live(c.req.url)));}catch{return c.json({detail:'Complete and review every homepage field before preparing this language. Reload after source or translation changes.'},409);}});
    app.post(root+'publish/',async c=>{try{const input=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),expected:z.object({hash:z.string(),generation:z.number().int()}).strict().nullable(),approveTranslations:z.literal(true)}).strict().parse(await body(c.req.raw));return c.json(await activateHomepageLocale(host,db,c.get('tenant'),c.req.raw,input.hash,input.expected,now(),live(c.req.url)));}catch{return c.json({detail:'The prepared language changed or publication conflicted. Reload and prepare again.'},409);}});
    app.get(root+'preview/',async c=>{try{const tenant=c.get('tenant'),hash=z.string().regex(/^[a-f0-9]{64}$/).parse(c.req.query('hash')),release=await readHomepageRelease(db,tenant,hash);if(!release)throw Error();
        const capture=await captureHomepage(db,tenant,c.req.raw,live(c.req.url)),result=projectHomepageLocale(capture,release),path=`/${release.locale}/`;
        result.page={...result.page,layout:addHomepageLanguageLinks(result.page.layout as unknown as PageLayoutData,release.sourceLocale,[release.locale],release.locale)};
        const manifest={version:hash,pages:{[path]:result.page},queries:{}};const engine=createEngine({manifest,data:directProvider(manifest),environment:'builder',document:{...result.document,language:release.locale,direction:/^(ar|fa|he|ur)(-|$)/.test(release.locale)?'rtl':'ltr',robots:'noindex, nofollow'}});
        const rendered=await engine.fetch(new Request(new URL(path,c.req.url)));return new Response(rendered.body,{status:rendered.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
    }catch{return c.json({detail:'Prepared language preview is unavailable or outdated.'},409);}});
}
