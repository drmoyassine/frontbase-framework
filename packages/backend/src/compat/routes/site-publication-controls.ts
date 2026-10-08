import { z } from 'zod';
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { sitePublicationPointerSchema } from '@frontbase/edge-core/directory/publication';
import { SitePublicationStore } from '../site-publication-store.js';
import { SitePublicationReviewStore } from '../site-publication-review-store.js';

const activationRequest = z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),expected:sitePublicationPointerSchema.nullable()}).strict();
const roles = ['owner','admin','tenant_admin','master_admin','master_admin_root'];
/** Trusted-owner controls. Actual capture review and pointer replacement remain separate actions. */
export function registerSitePublicationControls(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,now:()=>string):void {
    app.get('/api/project/site-configuration/publication/state/',async c=>{
        c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
        const user=c.get('principal').user as {role?:string};
        if(!user?.role || !roles.includes(user.role))return c.json({detail:'Publication is unavailable'},403);
        if(new URL(c.req.url).search)return c.json({detail:'Invalid publication request'},422);
        try {
            const owner=c.get('tenant'),active=await new SitePublicationStore(db,owner).active();
            if(!active)return c.json({pointer:null,capture:null});
            const review=await new SitePublicationReviewStore(db,owner).get(active.pointer.hash);
            if(!review)throw new Error('publication_review_required');
            const {artifact}=active;
            const paths=[...artifact.records.institutions,...artifact.records.programs,...artifact.records.articles].map(row=>row.originalPath);
            if(artifact.templates.some(template=>template.role==='directory'))paths.unshift(artifact.configuration.routes.directory);
            if(artifact.templates.some(template=>template.role==='article-index'))paths.unshift(artifact.configuration.routes.blog);
            return c.json({pointer:active.pointer,capture:{configurationRevision:artifact.configurationRevision,reviewedAt:review.reviewedAt,
                paths,counts:{institutions:artifact.records.institutions.length,programs:artifact.records.programs.length,articles:artifact.records.articles.length}}});
        }catch{return c.json({detail:'Publication is unavailable'},503);}
    });
    app.post('/api/project/site-configuration/publication/activate/',async c=>{
        c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
        const user=c.get('principal').user as {role?:string};
        if(!user?.role || !roles.includes(user.role))return c.json({detail:'Publication is unavailable'},403);
        if(new URL(c.req.url).search)return c.json({detail:'Invalid publication request'},422);
        if(c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')return c.json({detail:'JSON publication request required'},415);
        const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let text='',size=0;
        try {
            if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
                if(size>4096){await reader.cancel();return c.json({detail:'Publication request is too large'},413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
        }catch{return c.json({detail:'Invalid publication request'},422);}
        let input:unknown;try{input=JSON.parse(text);}catch{return c.json({detail:'Invalid publication request'},422);}
        const request=activationRequest.safeParse(input);
        if(!request.success)return c.json({detail:'Invalid publication request'},422);
        try {
            const owner=c.get('tenant'),store=new SitePublicationStore(db,owner),reviews=new SitePublicationReviewStore(db,owner);
            const active=await store.active(),current=active?.pointer??null;
            if(active && !await reviews.get(active.pointer.hash))throw new Error('publication_review_required');
            if(JSON.stringify(current)!==JSON.stringify(request.data.expected))return c.json({detail:'Live version changed. Read it again before publishing.',code:'publication_conflict'},409);
            if(!await reviews.get(request.data.hash))throw new Error('publication_review_required');
            // Deliberate same-target submission is a no-op; stale retries are refused above.
            if(current?.hash===request.data.hash)return c.json({pointer:current,changed:false});
            const pointer=await reviews.activate(request.data.hash,request.data.expected,now());
            if(!pointer)return c.json({detail:'Live version changed. Read it again before publishing.',code:'publication_conflict'},409);
            return c.json({pointer,changed:true});
        }catch{return c.json({detail:'Publication is unavailable'},503);}
    });
}
