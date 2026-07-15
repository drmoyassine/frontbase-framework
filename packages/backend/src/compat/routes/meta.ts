/**
 * CF-22 P2 Wave 1 — the `Meta` tag (health/liveness). UNAUTHENTICATED (registered
 * before defaultDenyAuth) — health probes must succeed without a session. Shapes
 * match the vendored RootStatus / HealthStatus / QueueHealth schemas.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';

export function registerMetaRoutes(app: Hono<{ Variables: ConsoleAuthVars }>): void {
    // GET /health — compat health (NOT bare /, which is the eSSR engine's root).
    // The product's GET / returns the API root status; the framework's engine
    // owns the bare / path (published pages). The compat surface serves /health
    // and /api/queue/health only — these don't collide with the engine.
    app.get('/health', (c) => c.json({ status: 'healthy', message: 'API is operational', test_mode: false }));
    // GET /api/queue/health — the product inspects Celery workers; the framework
    // has no background queue in-process, so report not-configured (still "healthy").
    app.get('/api/queue/health', (c) => c.json({ status: 'healthy', active_workers: false }));
}
