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
        const rows = await storeFor(c.get('tenant')).list();
        // Map framework schema (kind, detail) to product schema (event_type, details)
        // Add missing fields (tenant_id, project_id, user_id, source_ip) as NULL
        const events = rows.map((r: Record<string, unknown>) => ({
            id: String(r.id),
            event_type: String(r.kind), // framework uses 'kind', product uses 'event_type'
            severity: String(r.severity),
            tenant_id: null, // framework uses tenant_slug, product uses tenant_id
            project_id: null, // not tracked in framework
            user_id: null, // not tracked in framework
            source_ip: null, // not tracked in framework
            details: r.detail, // framework uses 'detail', product uses 'details'
            created_at: String(r.created_at),
        }));
        // Product parity: field order is events, limit, offset, total
        return c.json({ events, limit: 100, offset: 0, total: events.length });
    });
    // GET /api/security-events/summary
    app.get('/api/security-events/summary', async (c) => {
        const summary = await storeFor(c.get('tenant')).summary() as {
            total?: number;
            by_severity?: Record<string, number>;
        };
        // Product parity: field order is by_severity, total
        return c.json({
            by_severity: {
                low: summary.by_severity?.low ?? 0,
                medium: summary.by_severity?.medium ?? 0,
                high: summary.by_severity?.high ?? 0,
                critical: summary.by_severity?.critical ?? 0,
            },
            total: summary.total ?? 0,
        });
    });
}
