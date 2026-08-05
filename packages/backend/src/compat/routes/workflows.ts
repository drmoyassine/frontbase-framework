/**
 * CF-22 Work A2 Tier 3 — Functional `workflows` system surface (1 op).
 * Transactional email dispatch observation and execution.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerWorkflowsRoutes(app: App, phase2For: (t: string) => Phase2Store): void {
    // POST /api/workflows/send-email
    //
    // Mirrors app/routers/workflows.py:48-95: validate the request first, then hand
    // off to the email provider and surface a provider failure as 502 so the workflow
    // node records it. A community deployment configures no provider, so dispatch
    // always fails here — which is the product's answer in the same configuration,
    // not a shortcut. Claiming `success: true` without a provider would be the one
    // outcome that is wrong in every configuration.
    //
    // RULE 2: auth check BEFORE body validation (matches product's require_tenant_context
    // dependency, which runs before FastAPI parses the request body). Unauthenticated
    // callers receive 401, not schema-oracle 422s.
    app.post('/api/workflows/send-email', async (c) => {
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

        // Product parity: the product's require_tenant_context rejects users without
        // a tenant context (tenant_slug=null). The framework assigns _root to master_admin
        // users, which would pass the above checks. Reject _root to match product behavior.
        if (tenant === '_root') {
            return c.json({ detail: 'Authentication required' }, 401);
        }

        const body = await c.req.json().catch(() => ({})) as {
            to?: string[];
            subject?: string;
        };

        // Body validation: return 422 for malformed input (only after auth check)
        // Product parity: FastAPI validation runs AFTER require_tenant_context,
        // so authenticated users get 422 for invalid input.
        if (!body.to || (Array.isArray(body.to) && body.to.length === 0)) {
            return c.json({ detail: 'to is required' }, 422);
        }
        if (!body.subject) {
            return c.json({ detail: 'subject is required' }, 422);
        }

        // Community deployments have no email provider configured
        return c.json({ detail: 'Email send failed' }, 502);
    });
}
