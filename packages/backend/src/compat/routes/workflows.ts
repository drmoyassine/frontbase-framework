/**
 * CF-22 P2 Wave 2 — the `workflows` tag, system side (1 op). The product's
 * /api/workflows/send-email fires a transactional email; the community worker has
 * no email provider wired, so it returns the product's graceful "no provider"
 * ack (the same shape FastAPI returns when SMTP/email-service isn't configured —
 * verified against the vendored spec, not invented).
 *
 * Route registered with the EXACT product path.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerWorkflowsRoutes(app: App): void {
    // POST /api/workflows/send-email
    app.post('/api/workflows/send-email', (c) => c.json({ success: false, message: 'No email provider configured' }));
}
