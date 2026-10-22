/**
 * CF-22 Work A2 Tier 3 — Functional `workflows` system surface (1 op).
 * Transactional email dispatch observation and execution.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import {requireRole} from '../../auth/roles.js';
import {guardedExternalFetch,type CompatFetch} from '../external-http.js';
import {sendResendMessage} from '../email/resend.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerWorkflowsRoutes(app: App, phase2For: (t: string) => Phase2Store,externalFetch:CompatFetch=fetch): void {
    // POST /api/workflows/send-email
    //
    // Explicitly select an owned Resend Connected Account and its verified sender.
    // Missing capability is refused; provider acceptance is not a delivery receipt.
    //
    // RULE 2: auth check BEFORE body validation (matches product's require_tenant_context
    // dependency, which runs before FastAPI parses the request body). Unauthenticated
    // callers receive 401, not schema-oracle 422s.
    app.post('/api/workflows/send-email',requireRole('owner','admin','tenant_admin','master_admin','master_admin_root'), async (c) => {
        // Auth check first (matches require_tenant_context at workflows.py:54).
        // The principal/tenant are set by defaultDenyAuth middleware in app.ts.
        // RULE 2: Fail-closed - reject if principal or tenant is missing/invalid.
        const principal = c.get('principal');
        const tenant = c.get('tenant');
        const user = principal?.user as { id?: string; email?: string } | null;

        // Explicit null checks - never default to allowing access
        if (principal === null || principal === undefined) {
            return c.json({ detail: 'Authentication required' }, 401);
        }
        if (user === null || user === undefined) {
            return c.json({ detail: 'Authentication required' }, 401);
        }
        if (!tenant) {
            return c.json({ detail: 'Authentication required' }, 401);
        }
        // Ensure we have at least one user identifier
        if (!user.id && !user.email) {
            return c.json({ detail: 'Authentication required' }, 401);
        }

        const body = await c.req.json().catch(() => ({})) as {
            to?: string[];
            subject?: string;
            html?:unknown;provider_account_id?:unknown;reply_to?:unknown;
        };

        // Body validation: return 422 for malformed input (only after auth check)
        // Product parity: FastAPI validation runs AFTER require_tenant_context,
        // so authenticated users get 422 for invalid input.
        if (!body.to || !Array.isArray(body.to) || body.to.length === 0) {
            return c.json({ detail: 'to is required' }, 422);
        }
        if (!body.subject) {
            return c.json({ detail: 'subject is required' }, 422);
        }

        const email=(value:unknown)=>typeof value==='string'&&value.length<=320&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
        if(body.to.length>10||!body.to.every(email)||typeof body.subject!=='string'||body.subject.length>200||typeof body.html!=='string'||!body.html||body.html.length>64000||body.reply_to!=null&&!email(body.reply_to))return c.json({detail:'Invalid email request'},422);
        if(typeof body.provider_account_id!=='string')return c.json({detail:'Select an owned Resend connection; no message was sent',code:'workflow_mail_not_configured'},501);
        const store=phase2For(tenant),account=await store.getEdgeResource(body.provider_account_id);
        if(!account||account.kind!=='provider'||account.provider!=='resend')return c.json({detail:'Email connection not found'},404);
        try{const config=await store.getEdgeResourceConfig(body.provider_account_id),key=config?.api_key??config?.token??config?.apiKey,from=config?.from;
            if(typeof key!=='string'||!key||typeof from!=='string'||!email(from))return c.json({detail:'Configure a verified sender on the selected Resend connection',code:'workflow_mail_not_configured'},501);
            const id=await sendResendMessage({apiKey:key,fetchImpl:(input,init)=>guardedExternalFetch(externalFetch,input,init)},{from,to:body.to,subject:body.subject,html:body.html,...(body.reply_to?{reply_to:String(body.reply_to)}:{})});
            return c.json({success:true,message_id:id,delivery:'accepted_by_provider'});
        }catch{return c.json({detail:'Email dispatch could not be confirmed; do not automatically retry',code:'workflow_mail_not_confirmed'},502);}
    });
}
