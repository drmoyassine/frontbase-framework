/**
 * CF-22 Work A2 Tier 3 — Functional `meta` tag (health/liveness).
 * UNAUTHENTICATED — health probes execute DB observation check and return operational status.
 */
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';

export function registerMetaRoutes(
    app: Hono<{ Variables: ConsoleAuthVars }>,
    runner: DbRunner,
    includeProductRoot = false,
): void {
    if (includeProductRoot) {
        app.get('/', async (c) => {
            await runner.query('SELECT 1');
            return c.json({ message: 'Frontbase-DBSync API is running', test_mode: true });
        });
    }
    app.get('/health', async (c) => {
        await runner.query('SELECT 1');
        return c.json({ status: 'healthy', message: 'API is operational', test_mode: true });
    });
    app.get('/api/queue/health', async (c) => {
        await runner.query('SELECT 1');
        // Framework has no task queue workers; include active_workers (null) and error (null) to match product shape
        return c.json({ status: 'healthy', active_workers: null, active: null, registered: null, error: null });
    });
}
