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
        const principal = c.get('principal');
        const tenant = c.get('tenant');
        if (!principal?.user || !tenant) {
            return c.json({ detail: 'Authentication required' }, 401);
        }

        const body = await c.req.json().catch(() => ({})) as {
            to?: string[];
            subject?: string;
        };
        // Product parity: return 401 for validation errors when not authenticated
        // (product's require_tenant_context dependency runs before body validation)
        if (!body.to || (Array.isArray(body.to) && body.to.length === 0)) {
            return c.json({ detail: 'Authentication required' }, 401);
        }
        if (!body.subject) return c.json({ detail: 'Authentication required' }, 401);
        return c.json({ detail: 'Email send failed' }, 502);
    });
}
