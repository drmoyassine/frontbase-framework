import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { PagesOrganizationStore, pagesOrganizationSaveSchema, validatePagesOrganization } from '../pages-organization.js';

export function registerPagesOrganizationRoutes(app: Hono<{Variables: ConsoleAuthVars}>, runner: DbRunner, now: () => string, getEntryIds: (tenant: string) => Promise<ReadonlySet<string>>): void {
    app.get('/api/project/pages-organization/', async c => {
        c.header('Cache-Control', 'no-store');
        const role = (c.get('principal').user as {role?: string}).role;
        if (!role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(role)) return c.json({detail: 'Page organization is unavailable'}, 403);
        try {return c.json(await new PagesOrganizationStore(runner, c.get('tenant')).get());}
        catch {return c.json({detail: 'Page organization is unavailable'}, 503);}
    });
    app.put('/api/project/pages-organization/', async c => {
        c.header('Cache-Control', 'no-store');
        const role = (c.get('principal').user as {role?: string}).role;
        if (!role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(role)) return c.json({detail: 'Page organization editing is unavailable'}, 403);
        const reader = c.req.raw.body?.getReader(); let raw = '', bytes = 0; const decoder = new TextDecoder();
        if (reader) {
            while (true) { const chunk = await reader.read(); if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > 256 * 1024) { await reader.cancel(); return c.json({detail: 'Page organization is too large'}, 413); }
                raw += decoder.decode(chunk.value, {stream: true});
            }
            raw += decoder.decode();
        }
        let value: unknown; try { value = JSON.parse(raw); } catch { return c.json({detail: 'Invalid page organization'}, 422); }
        const parsed = pagesOrganizationSaveSchema.safeParse(value);
        if (!parsed.success) return c.json({detail: 'Invalid page organization'}, 422);
        try {
            const tenant = c.get('tenant'), entries = await getEntryIds(tenant);
            if (!validatePagesOrganization({ ...parsed.data, revision: parsed.data.expectedRevision }, entries)) return c.json({detail: 'Invalid page organization or unavailable entry'}, 422);
            const saved = await new PagesOrganizationStore(runner, tenant).save(parsed.data, entries, now());
            if (!saved) return c.json({detail: 'Organization changed; reload before saving', code: 'pages_organization_conflict'}, 409);
            return c.json(saved);
        } catch {return c.json({detail: 'Page organization is unavailable; reload before saving'}, 503);}
    });
}
