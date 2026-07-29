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
    app.get('/api/security-events/', async (c) => {
        const events = await storeFor(c.get('tenant')).list();
        return c.json({ events, total: events.length, limit: 100, offset: 0 });
    });
    // GET /api/security-events/summary
    app.get('/api/security-events/summary', async (c) => {
        const summary = await storeFor(c.get('tenant')).summary() as {
            total?: number;
            by_severity?: Record<string, number>;
        };
        return c.json({
            total: summary.total ?? 0,
            by_severity: {
                low: summary.by_severity?.low ?? 0,
                medium: summary.by_severity?.medium ?? 0,
                high: summary.by_severity?.high ?? 0,
                critical: summary.by_severity?.critical ?? 0,
            },
        });
    });
}
