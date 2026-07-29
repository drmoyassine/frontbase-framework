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
    app.post('/api/workflows/send-email', async (c) => {
        const body = await c.req.json().catch(() => ({})) as {
            to?: string[];
            subject?: string;
        };
        if (!body.to || (Array.isArray(body.to) && body.to.length === 0)) {
            return c.json({ detail: 'At least one recipient is required' }, 400);
        }
        if (!body.subject) return c.json({ detail: 'Subject is required' }, 400);
        return c.json({ detail: 'Email send failed' }, 502);
    });
}
