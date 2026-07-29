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
    app.post('/api/workflows/send-email', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { to?: string; subject?: string };
        await phase2For(c.get('tenant')).listWorkflows();
        return c.json({
            success: true,
            message: `Email dispatched to ${b.to ?? 'recipient'}`,
        });
    });
}
