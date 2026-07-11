/**
 * Publish route — POST /publish/:slug. Validates the draft, assembles the
 * SiteManifest (compiler), emits the execute-stripped browser projection, bumps
 * the version, and purges the cache.
 */
import { Hono } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import type { ConsoleStore } from '../db/store.js';
import type { QueryRegistry } from '@frontbase/compiler/manifest';
import { publishPage } from '../publish/pipeline.js';

export function publishRoutes(
    storeFor: (tenant: string) => Promise<ConsoleStore>,
    queries: QueryRegistry,
    purgeCache: (keys: string[]) => Promise<void>,
    now: () => string,
): Hono<{ Variables: ConsoleAuthVars }> {
    const app = new Hono<{ Variables: ConsoleAuthVars }>();

    app.post('/publish/:slug', async (c) => {
        const store = await storeFor(c.get('tenant'));
        const slug = c.req.param('slug');
        const body = await c.req.json().catch(() => ({})) as { title?: string; description?: string; cssBundle?: string };
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
