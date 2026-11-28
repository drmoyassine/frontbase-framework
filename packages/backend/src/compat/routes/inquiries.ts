import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readInquiryFields, type Principal, type PublicFormDraft } from '@frontbase/edge-core';
import { executeWorkflow } from '@frontbase/edge-core/workflow';
import { rateLimitGuard, type DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { requireRole } from '../../auth/roles.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { CompatFetch } from '../external-http.js';
import { createD1RateLimitCache } from '../rate-limit-store.js';
import { openInquiryTicket, type InquiryContext, type PublishedInquiryIssuer } from '../inquiries.js';
import { sameAppOrigin } from './app-users.js';
import { publicationHash } from '../publication-hash.js';
import { authoringExecutors, authoringGraph, workflowVersion } from '../workflow-authoring.js';

type App = Hono<{Variables:ConsoleAuthVars}>;
type Workflow = NonNullable<NonNullable<PublicFormDraft['submission']>['workflow']>;
export type InquiryEvent = {
    type: 'inquiry.submitted'; submissionId: string; source: InquiryContext;
    fields: Record<string,string|boolean>; fieldDefinitions: PublicFormDraft['fields']; workflow?: Workflow;
};
export interface InquiryActions {
    record(owner:string, datasourceId:string, event:InquiryEvent):Promise<boolean>;
    confirm?(email:string, submissionId:string, locale:string):Promise<void>;
}
export async function deliverInquiry(store: Phase2Store, event: InquiryEvent, externalFetch: CompatFetch, actions?:InquiryActions, reconcile=false) {
    const selected = event.workflow!;
    const [workflow, version] = await Promise.all([store.getWorkflow(selected.id), workflowVersion(store, selected.id, selected.versionId)]);
    if (!workflow?.is_active || !workflow.is_published || !version) return 'needs_review';
    const graph = { id:selected.id, name:String(version.name), nodes:JSON.stringify(version.nodes), edges:JSON.stringify(version.edges) };
    const {nodes,edges} = authoringGraph(graph);
    // Visitor values can enter a workflow only through a trigger. An HTTP or agent
    // node at the root would otherwise inherit visitor parameters directly.
    const roots = nodes.filter(node => !edges.some(edge => edge.target === node.id));
    if (roots.length !== 1 || !['trigger','manual_trigger'].includes(roots[0]!.type)) return 'needs_review';
    // A submission may populate an HTTP body. Its destination and credentials
    // must come from the workflow author, including after a transform node.
    const httpNodes = new Set(nodes.filter(node=>node.type === 'http_request').map(node=>node.id));
    if (edges.some(edge=>httpNodes.has(edge.target) && edge.targetInput !== 'body')) return 'needs_review';
    const crm = nodes.filter(node=>node.type === 'inquiry_crm');
    const mail = nodes.filter(node=>node.type === 'inquiry_confirmation');
    // Only the transaction-backed preset is safe to reconcile. The existing
    // receipt prevents a second email even if the previous send was uncertain.
    if (reconcile && (nodes.length!==3 || edges.length!==2 || crm.length!==1 || mail.length!==1)) return 'needs_review';
    // The canvas also serializes unnamed single handles as output -> input.
    for(const edge of edges) {
        if(edge.sourceOutput!=='output' || edge.targetInput!=='input')continue;
        if(crm[0] && edge.source===roots[0]!.id && edge.target===crm[0].id) {
            edge.sourceOutput='payload'; edge.targetInput='inquiry';
        } else if(crm[0] && mail[0] && edge.source===crm[0].id && edge.target===mail[0].id) {
            edge.sourceOutput='receipt'; edge.targetInput='receipt';
        }
    }
    graph.edges=JSON.stringify(edges);
    // Privileged actions accept only the original recorded event. Require explicit
    // wiring and one confirmation downstream of the committed CRM transaction.
    const wired = (target:string,source:string,output:string,input:string) => {
        const incoming=edges.filter(edge=>edge.target===target);
        return incoming.length===1 && incoming[0]?.source===source && incoming[0].sourceOutput===output && incoming[0].targetInput===input;
    };
    if (crm.length>1 || mail.length>1 ||
        (crm[0] && (!actions || !wired(crm[0].id,roots[0]!.id,'payload','inquiry'))) ||
        (mail[0] && (!actions?.confirm || !crm[0] || !wired(mail[0].id,crm[0].id,'receipt','receipt')))) return 'needs_review';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const executors=authoringExecutors(async(input,init)=>{
                const response=await externalFetch(input,init);
                if (!response.ok) throw Error('inquiry_destination_failed');
                return response;
            }, controller);
        if (actions && crm[0]) {
            const node=crm[0];
            const datasource=(node.data?.inputs??node.inputs??[]).find(input=>input.name==='dataSource')?.value;
            executors.register({types:['inquiry_crm'],async execute(){
                if(typeof datasource!=='string'||!datasource)throw Error('inquiry_datasource_missing');
                const fresh=await actions.record(event.source.owner,datasource,event);
                return {receipt:fresh ? event.submissionId : null};
            }});
            executors.register({types:['inquiry_confirmation'],async execute(_node,input){
                const email=event.fields.email;
                if(input.receipt!==event.submissionId || typeof email!=='string' || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) || email.length>254 || event.fields.consent!==true)
                    throw Error('inquiry_confirmation_unavailable');
                await actions.confirm!(email,event.submissionId,event.source.locale);
                return {accepted:true};
            }});
        }
        const result = await executeWorkflow(event.submissionId, graph, { inquiry:event }, {
            tenantSlug:event.source.owner, executors,
            settings:{log_level:'none',execution_timeout_ms:21000},
        });
        return result.status === 'completed' ? 'completed' : 'needs_review';
    } finally { clearTimeout(timer); controller.abort(); }
}
export function registerInquiryRoute(app:App, db:DbRunner, cipher:SecretCipher, now:()=>string,
    ownerFor:(request:Request)=>Promise<string|undefined>, phase2For:(owner:string)=>Phase2Store, externalFetch:CompatFetch,
    renderPublished:(owner:string,request:Request,inspect:PublishedInquiryIssuer)=>Promise<Response|null>, actions?:InquiryActions) {
    const cache = createD1RateLimitCache(db,60,()=>Date.parse(now()));
    app.use('/api/public/inquiries',async(c,next)=>{
        c.header('Cache-Control','no-store'); c.header('X-Robots-Tag','noindex');
        c.header('Referrer-Policy','no-referrer'); return next();
    });
    app.post('/api/public/inquiries',bodyLimit({maxSize:48_000}),async c=>{
        if (!sameAppOrigin(c.req.raw)) return c.text('Submit from the original form.',403);
        if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') return c.text('Unsupported form encoding.',415);
        const owner = await ownerFor(c.req.raw);
        if (!owner) return c.text('Form unavailable.',404);
        if (await rateLimitGuard({limit:60,windowSeconds:60,cache},{tenant:'inquiry:'+owner,user:{id:'public'}} as Principal))
            return c.text('Please try again in a minute.',429);
        const body = new URLSearchParams(await c.req.text());
        const tokens = body.getAll('_ticket');
        const at = now();
        const ticket = tokens.length === 1 && await openInquiryTicket(cipher,tokens[0]!,owner,Date.parse(at));
        if (!ticket) return c.text('Reopen the form and try again.',409);
        body.delete('_ticket');
        const target = new URL(ticket.context.path,c.req.url);
        if (target.origin !== new URL(c.req.url).origin || target.search || target.hash) return c.text('Form unavailable.',404);
        target.search=ticket.context.search;
        let matched:PublicFormDraft | undefined;
        const expected = await publicationHash(ticket.context);
        const headers=new Headers();
        const cookie=c.req.header('Cookie');
        if (cookie) headers.set('Cookie',cookie);
        const page = await renderPublished(owner,new Request(target,{headers}),async(context,form)=>{
            if (context.formId === ticket.context.formId && await publicationHash(context) === expected && await publicationHash(form) === ticket.formHash) matched=form;
            return undefined;
        });
        if (!page?.ok || !matched?.submission) return c.text('This form has changed. Reopen it and try again.',409);
        const fields = readInquiryFields(matched,body);
        if (!fields) return c.text('Check the form fields and try again.',422);
        const event:InquiryEvent = {type:'inquiry.submitted',submissionId:ticket.id,source:ticket.context,fields,
            fieldDefinitions:matched.fields,workflow:matched.submission.workflow};
        const encrypted = await cipher.encrypt(JSON.stringify(event));
        if (!cipher.isEncrypted(encrypted)) return c.text('Form unavailable.',503);
        const digest = await publicationHash([ticket.id,fields]);
        const expires = new Date(Date.parse(at)+30*86400000).toISOString();
        await db.exec('DELETE FROM public_inquiries WHERE tenant_slug=? AND expires_at <= ?',[owner,at]);
        await db.exec(`INSERT INTO public_inquiries (tenant_slug,id,form_id,payload_hash,encrypted_payload,workflow_status,created_at,expires_at)
            VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_slug,id) DO NOTHING`,
            [owner,ticket.id,ticket.context.formId,digest,encrypted,event.workflow?'pending':'recorded',at,expires]);
        const [receipt] = await db.query('SELECT payload_hash FROM public_inquiries WHERE tenant_slug=? AND id=?',[owner,ticket.id]);
        if (receipt?.payload_hash !== digest) return c.text('This form was already submitted with different values.',409);
        // A lost response or a second concurrent request cannot dispatch a second time.
        if (event.workflow && await db.exec("UPDATE public_inquiries SET workflow_status='processing' WHERE tenant_slug=? AND id=? AND workflow_status='pending'",[owner,ticket.id]) === 1) {
            const workflow=event.workflow;
            const dispatch = async () => {
                const status = await deliverInquiry(phase2For(owner),event,externalFetch,actions).catch(()=>'needs_review');
                await db.exec('UPDATE public_inquiries SET workflow_status=? WHERE tenant_slug=? AND id=?',[status,owner,ticket.id]);
                // Terminal history cannot be replayed by the general workflow recovery runner.
                await db.exec(`INSERT INTO workflow_executions
                    (id,tenant_slug,workflow_id,status,trigger,input,result,error,started_at,ended_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`,[ticket.id,owner,workflow.id,status==='completed'?'completed':'error',
                    'inquiry.submitted',JSON.stringify({submissionId:ticket.id,versionId:workflow.versionId}),null,
                    status==='completed'?null:'inquiry_follow_up_needs_review',at,now()]).catch(()=>{
                        console.warn('[frontbase] inquiry workflow history unavailable');
                    });
            };
            // Workers extend the request lifetime. Hosts without this facility
            // finish follow-up before returning, so a serverless exit cannot drop it.
            let ctx: {waitUntil(promise:Promise<unknown>):void} | undefined;
            try { ctx=c.executionCtx; } catch { /* Node request without execution context */ }
            if (ctx?.waitUntil) ctx.waitUntil(dispatch()); else await dispatch();
        }
        return c.text(matched.submission.receiptMessage ?? 'Thank you. Your inquiry has been received.',200);
    });
}
export function registerInquiryInbox(app:App,db:DbRunner,cipher:SecretCipher,now:()=>string,
    reconcile?:(owner:string,event:InquiryEvent)=>Promise<string>) {
    const admin=requireRole('owner','admin','tenant_admin','master_admin','master_admin_root');
    if(reconcile)app.post('/api/inquiries/:id/reconcile',admin,async c=>{
        c.header('Cache-Control','no-store');
        if(!sameAppOrigin(c.req.raw))return c.json({error:'origin_required'},403);
        const owner=c.get('tenant'),id=c.req.param('id'),at=now();
        const [row]=await db.query("SELECT encrypted_payload FROM public_inquiries WHERE tenant_slug=? AND id=? AND workflow_status='needs_review' AND expires_at>?",[owner,id,at]);
        if(!row)return c.json({error:'inquiry_unavailable'},404);
        const event=JSON.parse(await cipher.decrypt(String(row.encrypted_payload))) as InquiryEvent;
        if(event.source.owner!==owner||event.submissionId!==id||!event.workflow)return c.json({error:'inquiry_unavailable'},409);
        const claimed=await db.exec("UPDATE public_inquiries SET workflow_status='processing' WHERE tenant_slug=? AND id=? AND workflow_status='needs_review' AND expires_at>?",[owner,id,at]);
        if(claimed!==1)return c.json({error:'inquiry_changed'},409);
        const status=await reconcile(owner,event).catch(()=>'needs_review');
        await db.exec('UPDATE public_inquiries SET workflow_status=? WHERE tenant_slug=? AND id=?',[status,owner,id]);
        if(status==='completed')await db.exec("UPDATE workflow_executions SET status='completed',error=null,ended_at=? WHERE tenant_slug=? AND id=? AND trigger='inquiry.submitted'",[now(),owner,id]);
        return c.json({status});
    });
    app.get('/api/inquiries',requireRole('owner','admin','tenant_admin','master_admin','master_admin_root'),async c=>{
        c.header('Cache-Control','no-store');
        const owner=c.get('tenant'), at=now();
        await db.exec('DELETE FROM public_inquiries WHERE tenant_slug=? AND expires_at<=?',[owner,at]);
        const formId=c.req.query('form');
        const rows=await db.query('SELECT id,encrypted_payload,workflow_status,created_at FROM public_inquiries WHERE tenant_slug=? AND expires_at>?'
            +(formId?' AND form_id=?':'')+' ORDER BY created_at DESC,id DESC LIMIT 50',formId?[owner,at,formId]:[owner,at]);
        return c.json({inquiries:await Promise.all(rows.map(async row=>({
            id:row.id,createdAt:row.created_at,status:row.workflow_status,inquiry:JSON.parse(await cipher.decrypt(String(row.encrypted_payload))),
        })))});
    });
}
