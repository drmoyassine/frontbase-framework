import { z } from 'zod';
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { validateEducationArtifact } from '../template-artifact.js';

/** Bounded syntax check only; creates no configuration, pages, operation or authorization token. */
export function registerTemplateArtifactRoutes(app:Hono<{Variables:ConsoleAuthVars}>):void {
    app.post('/api/project/template-artifact/check/',async c=>{
        c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
        if(!['owner','admin','tenant_admin','master_admin','master_admin_root'].includes((c.get('principal').user as {role?:string})?.role??''))return c.json({detail:'Template checks are unavailable'},403);
        if(new URL(c.req.url).search)return c.json({detail:'Invalid template request'},422);
        if(c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')return c.json({detail:'JSON required'},415);
        const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let text='',size=0;
        try{if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
            if(size>1024*1024){await reader.cancel();return c.json({detail:'Template request is too large'},413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}}
        catch{return c.json({detail:'Invalid template request'},422);}
        try{
            const request=z.object({schemaVersion:z.literal(1),artifact:z.unknown()}).strict().parse(JSON.parse(text));
            const artifact=validateEducationArtifact(request.artifact);
            return c.json({schemaVersion:1,purpose:'artifact-check',profile:'education-editable-v1',templateVersion:artifact.artifact.templateVersion,
                roles:artifact.pages.map(p=>p.role),artifactValid:true,installAvailable:false,publicationAvailable:false});
        }catch{return c.json({detail:'Template is invalid or unsupported by this import profile',code:'template_artifact_invalid'},422);}
    });
}
