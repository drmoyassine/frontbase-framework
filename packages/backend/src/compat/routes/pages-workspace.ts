import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { pagesWorkspace } from '../pages-workspace.js';
import {templateUrlSettings,saveTemplateUrlSettings} from '../template-policy.js';
import {templatePolicySchema} from '@frontbase/edge-core/template-policy';
import {z} from 'zod';
import {previewTemplateUrl} from '../template-policy-preview.js';

async function readSettingsBody(request:Request){
    const reader=request.body?.getReader();let text='',bytes=0;const decoder=new TextDecoder();
    if(reader)while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>180000){await reader.cancel();throw Error('too_large');}text+=decoder.decode(chunk.value,{stream:true});}
    return JSON.parse(text+decoder.decode()) as unknown;
}

export function registerPagesWorkspaceRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, runner: DbRunner): void {
    const canEdit=(role:string|undefined)=>['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(role??'');
    app.post('/api/project/template-urls/:pageId/preview/',async c=>{
        c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
        if(!canEdit(c.get('principal').user?.role))return c.json({detail:'Administrator access required'},403);
        try{
            const input=z.object({revision:z.string().regex(/^[a-f0-9]{64}$/),policy:templatePolicySchema,identity:z.string().min(1).max(200),locale:z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)}).strict().parse(await readSettingsBody(c.req.raw));
            return c.json(await previewTemplateUrl(runner,c.get('tenant'),c.req.param('pageId'),input,c.req.raw,request=>app.fetch(request)));
        }catch(error){return c.json({detail:error instanceof Error&&error.message==='template_changed'?'Template changed. Reload before previewing.':'Preview unavailable. Check bindings and source availability; saved settings are preserved.'},422);}
    });
    app.get('/api/project/template-urls/:pageId/',async c=>{
        c.header('Cache-Control','no-store');
        if(!canEdit(c.get('principal').user?.role))return c.json({detail:'Administrator access required'},403);
        try{return c.json(await templateUrlSettings(runner,c.get('tenant'),c.req.param('pageId')));}catch{return c.json({detail:'Template unavailable'},404);}
    });
    app.put('/api/project/template-urls/:pageId/',async c=>{
        c.header('Cache-Control','no-store');
        if(!canEdit(c.get('principal').user?.role))return c.json({detail:'Administrator access required'},403);
        const reader=c.req.raw.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
        if(reader)while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>180000){await reader.cancel();return c.json({detail:'Settings too large'},413);}raw+=decoder.decode(chunk.value,{stream:true});}
        raw+=decoder.decode();let value;try{value=JSON.parse(raw);}catch{return c.json({detail:'Invalid settings'},422);}
        const parsed=z.object({revision:z.string().regex(/^[a-f0-9]{64}$/),policy:templatePolicySchema}).strict().safeParse(value);
        if(!parsed.success)return c.json({detail:'Check bindings, conditions and language settings'},422);
        try{const result=await saveTemplateUrlSettings(runner,c.get('tenant'),c.req.param('pageId'),parsed.data.revision,parsed.data.policy,new Date().toISOString());
            return result?c.json(result):c.json({detail:'Template changed. Reload before saving.'},409);
        }catch{return c.json({detail:'Settings could not be saved. Reload to confirm their state.'},422);}
    });
    app.get('/api/project/pages-workspace/', async c => {
        c.header('Cache-Control', 'no-store');
        if (!['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(c.get('principal').user?.role ?? ''))
            return c.json({ detail: 'Administrator access required' }, 403);
        if (new URL(c.req.url).search || c.req.raw.body) return c.json({ detail: 'Workspace inventory does not accept input' }, 422);
        try { return c.json(await pagesWorkspace(runner, c.get('tenant'))); }
        catch { return c.json({ detail: 'Site inventory unavailable. Reload before changing organization.' }, 503); }
    });
}
