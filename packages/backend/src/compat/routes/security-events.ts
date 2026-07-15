/**
 * CF-22 P2 Wave 1 — the `security-events` tag (2 ops): list + summary (migration v8).
 * The product surfaces the audit trail; the framework stores its own (server-side
 * only). Responses are permissive (`additionalProperties: true`) — returned as-is.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { SecurityEventsStore } from '../store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerSecurityEventsRoutes(app: App, storeFor: (t: string) => SecurityEventsStore): void {
    // GET /api/security-events/
    app.get('/api/security-events/', async (c) => c.json({ events: await storeFor(c.get('tenant')).list() }));
    // GET /api/security-events/summary
    app.get('/api/security-events/summary', async (c) => c.json(await storeFor(c.get('tenant')).summary()));
}
