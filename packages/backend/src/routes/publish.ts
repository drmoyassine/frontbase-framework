/**
 * Publish route — POST /publish/:slug. Validates the draft, assembles the
 * SiteManifest (compiler), emits the execute-stripped browser projection, bumps
 * the version, and purges the cache.
 */
import { Hono } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import type { ConsoleStore } from '../db/store.js';
import type { Phase2Store } from '../db/phase2-store.js';
import type { QueryRegistry } from '@frontbase/compiler/manifest';
import { publishPage } from '../publish/pipeline.js';

export function publishRoutes(
    storeFor: (tenant: string) => Promise<ConsoleStore>,
    queries: QueryRegistry,
    purgeCache: (keys: string[]) => Promise<void>,
    now: () => string,
    /** Optional Phase2 store for plan-limit enforcement (F8c). */
    phase2StoreFor?: (tenant: string) => Phase2Store,
): Hono<{ Variables: ConsoleAuthVars }> {
    const app = new Hono<{ Variables: ConsoleAuthVars }>();

    app.post('/publish/:slug', async (c) => {
        const store = await storeFor(c.get('tenant'));
        const slug = c.req.param('slug');
        const body = await c.req.json().catch(() => ({})) as { title?: string; description?: string; cssBundle?: string };

        // F8c: enforce the tenant's `pages` limit on NEW publishes only (re-publishing
        // an existing page doesn't consume a new slot). Throws limit_exceeded → 402.
        if (phase2StoreFor) {
            const p2 = phase2StoreFor(c.get('tenant'));
            const existing = await store.getPage(slug);
            if (!existing) {
                const pages = await store.listPages();
                try { await p2.enforceLimit('pages', pages.length); }
                catch { return c.json({ error: 'limit_exceeded', limit: 'pages' }, 402); }
            }
        }

        const result = await publishPage(
            store,
            { slug, title: body.title ?? slug, description: body.description, queries, cssBundle: body.cssBundle },
            now(),
            purgeCache,
        );
        return c.json(result);
    });

    return app;
}
