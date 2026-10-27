import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { PageChangeStore, PageChangeConflict, pageChangeRequestSchema } from '../page-change-store.js';
import { validateDirectoryLayout } from '../directory-configuration.js';

const roles = ['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'];
/** Additive privileged draft-change controls. Legacy page endpoints remain intact. */
export function registerPageChangeRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, db: DbRunner, now: () => string): void {
    for (const path of ['/api/pages/:page_id/change-state/', '/api/pages/:page_id/changes/', '/api/pages/:page_id/changes/:operation_id/']) {
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'no-store'); c.header('X-Robots-Tag', 'noindex, nofollow');
            if (!roles.includes((c.get('principal').user as { role?: string })?.role ?? '')) return c.json({ detail: 'Draft change is unavailable' }, 403);
            if (new URL(c.req.url).search) return c.json({ detail: 'Invalid draft change request' }, 422);
            return next();
        });
    }
    app.get('/api/pages/:page_id/changes/:operation_id/', async c => {
        if (!/^[a-f0-9-]{36}$/i.test(c.req.param('operation_id'))) return c.json({ detail: 'Invalid draft change request' }, 422);
        try {
            const status = await new PageChangeStore(db, c.get('tenant')).status(c.req.param('page_id'), c.req.param('operation_id'));
            return status ? c.json(status) : c.json({ detail: 'Operation not found' }, 404);
        } catch { return c.json({ detail: 'Draft change is unavailable' }, 503); }
    });
    app.get('/api/pages/:page_id/change-state/', async c => {
        try {
            const state = await new PageChangeStore(db, c.get('tenant')).state(c.req.param('page_id'));
            return state ? c.json(state) : c.json({ detail: 'Page not found' }, 404);
        } catch { return c.json({ detail: 'Draft change is unavailable' }, 503); }
    });
    app.post('/api/pages/:page_id/changes/', async c => {
        if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
            return c.json({ detail: 'JSON draft change request required' }, 415);
        const reader = c.req.raw.body?.getReader(), decoder = new TextDecoder();
        let text = '', size = 0;
        try {
            if (reader) {
                while (true) {
                    const chunk = await reader.read(); if (chunk.done) break;
                    size += chunk.value.byteLength;
                    if (size > 1024 * 1024) { await reader.cancel(); return c.json({ detail: 'Draft change request is too large' }, 413); }
                    text += decoder.decode(chunk.value, { stream: true });
                }
                text += decoder.decode();
            }
        } catch { return c.json({ detail: 'Invalid draft change request' }, 422); }
        let raw: unknown;
        try { raw = JSON.parse(text); } catch { return c.json({ detail: 'Invalid draft change request' }, 422); }
        const parsed = pageChangeRequestSchema.safeParse(raw);
        if (!parsed.success) return c.json({ detail: 'Invalid draft change request' }, 422);
        try {
            const owner = c.get('tenant');
            const error = await validateDirectoryLayout(parsed.data.patch.layoutData, owner, db);
            if (error) return c.json(error.body, error.status);
            const store = new PageChangeStore(db, owner);
            await store.begin(c.req.param('page_id'), parsed.data, now());
            const result = await store.execute(parsed.data.operationId);
            return c.json(result, result.status === 'applied' ? 200 : 409);
        } catch (error) {
            if (error instanceof PageChangeConflict) return c.json({ detail: 'Draft or operation changed. Read state before proceeding.', code: 'page_change_conflict' }, 409);
            // Ambiguous writes remain durable applying intents; never claim no write or blindly replay them.
            return c.json({ detail: 'Draft change is unavailable. Read state before proceeding.' }, 503);
        }
    });
}
