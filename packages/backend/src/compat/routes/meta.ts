/**
 * CF-22 P2 Wave 1 — the `Meta` tag (health/liveness). UNAUTHENTICATED (registered
 * before defaultDenyAuth) — health probes must succeed without a session. Shapes
 * match the vendored RootStatus / HealthStatus / QueueHealth schemas.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';

export function registerMetaRoutes(
    app: Hono<{ Variables: ConsoleAuthVars }>,
    includeProductRoot = false,
): void {
    // Standalone/spec mode owns GET /. The combined CMS worker handles the same
    // JSON contract at its outer boundary via content negotiation so browser
    // traffic can continue to the eSSR page.
    if (includeProductRoot) {
        app.get('/', (c) => c.json({ message: 'Frontbase API is operational', test_mode: false }));
    }
    app.get('/health', (c) => c.json({ status: 'healthy', message: 'API is operational', test_mode: false }));
    // GET /api/queue/health — the product inspects Celery workers; the framework
    // has no background queue in-process, so report not-configured (still "healthy").
    app.get('/api/queue/health', (c) => c.json({ status: 'healthy', active_workers: false }));
}
