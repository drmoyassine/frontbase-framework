/**
 * Pages + drafts routes — tenant-scoped CRUD. Every handler reads `tenant` from
 * the auth context (set by defaultDenyAuth), never from the request body.
 */
import { Hono } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import type { ConsoleStore } from '../db/store.js';

export function pagesRoutes(storeFor: (tenant: string) => Promise<ConsoleStore>, now: () => string): Hono<{ Variables: ConsoleAuthVars }> {
    const app = new Hono<{ Variables: ConsoleAuthVars }>();

    app.get('/pages', async (c) => {
        const store = await storeFor(c.get('tenant'));
        return c.json({ pages: await store.listPages() });
    });

    app.get('/pages/:slug', async (c) => {
        const store = await storeFor(c.get('tenant'));
        const page = await store.getPage(c.req.param('slug'));
        if (!page) throw new Error('not_found');
        return c.json({ page });
    });

    app.put('/drafts/:slug', async (c) => {
        const store = await storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => null) as { layoutData?: string } | null;
        if (!body?.layoutData) throw new Error('validation_failed:layoutData');
        await store.upsertDraft(c.req.param('slug'), body.layoutData, now());
        return c.json({ ok: true });
    });

    app.get('/drafts/:slug', async (c) => {
        const store = await storeFor(c.get('tenant'));
        const draft = await store.getDraft(c.req.param('slug'));
        if (!draft) throw new Error('not_found');
        return c.json({ draft });
    });

    app.delete('/pages/:slug', async (c) => {
        const store = await storeFor(c.get('tenant'));
        const ok = await store.deletePage(c.req.param('slug'));
        return c.json({ ok });
    });

    return app;
}
