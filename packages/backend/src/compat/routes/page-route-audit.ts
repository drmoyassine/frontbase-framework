import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { auditRouteNamespace } from '../route-namespace-audit.js';
import { captureRouteInventory } from '../capture-route-inventory.js';

/** Stored pages plus validated active capture. No caller-selected owner or paths. */
export function registerPageRouteAudit(app: Hono<{ Variables: ConsoleAuthVars }>, runner: DbRunner): void {
    app.get('/api/project/page-route-audit/', async c => {
        c.header('Cache-Control', 'no-store'); c.header('X-Robots-Tag', 'noindex, nofollow');
        if (!['owner', 'admin', 'tenant_admin', 'master_admin', 'root'].includes((c.get('principal').user as { role?: string })?.role ?? ''))
            return c.json({ detail: 'Page URL checks require administrator access' }, 403);
        if (new URL(c.req.url).search || c.req.raw.body || Number(c.req.header('content-length') ?? 0) !== 0)
            return c.json({ detail: 'Page URL checks do not accept input' }, 422);
        // Inspect retained framework rows even if this host retired their API. This
        // does not imply that every stored record is currently publicly served.
        try {
            const capture = await captureRouteInventory(runner, c.get('tenant'));
            const result = await auditRouteNamespace(runner, c.get('tenant'), { includeFramework: true, publicPaths: capture.paths });
            const after = await captureRouteInventory(runner, c.get('tenant'));
            if (JSON.stringify(capture.identity) !== JSON.stringify(after.identity))
                return c.json({ schemaVersion: 1, coverage: 'stored-pages', publicRecordsChecked: false, status: 'unavailable', code: 'namespace_changed', installAvailable: false }, 503);
            return c.json({ schemaVersion: 1, coverage: capture.identity ? 'stored-pages-and-active-capture' : 'stored-pages', publicRecordsChecked: !!capture.identity,
                ...(capture.identity ? { capture: capture.identity } : {}), ...result }, result.status === 'unavailable' ? 503 : 200);
        } catch {
            return c.json({ schemaVersion: 1, coverage: 'stored-pages', publicRecordsChecked: false, status: 'unavailable', code: 'namespace_unavailable', installAvailable: false }, 503);
        }
    });
}
