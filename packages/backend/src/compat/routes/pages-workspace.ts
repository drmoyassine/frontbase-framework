import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { pagesWorkspace } from '../pages-workspace.js';

export function registerPagesWorkspaceRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, runner: DbRunner): void {
    app.get('/api/project/pages-workspace/', async c => {
        c.header('Cache-Control', 'no-store');
        if (!['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(c.get('principal').user?.role ?? ''))
            return c.json({ detail: 'Administrator access required' }, 403);
        if (new URL(c.req.url).search || c.req.raw.body) return c.json({ detail: 'Workspace inventory does not accept input' }, 422);
        try { return c.json(await pagesWorkspace(runner, c.get('tenant'))); }
        catch { return c.json({ detail: 'Site inventory unavailable. Reload before changing organization.' }, 503); }
    });
}
