/**
 * @frontbase/backend — the in-worker console API. A Hono sub-router the host
 * mounts via createEngine({ console }) at /api/console. SERVER-ONLY.
 *
 *   createConsole({ resolvePrincipal, dbUrl, queries, purgeCache }) → Hono
 *
 * Default-DENY auth (RULE 2) on every route except /health. Drizzle schema is
 * the single persistence source of truth (A-13). Opaque errors (RULE 4). The
 * publish pipeline emits the execute-stripped browser projection (RULE 1).
 */
import { Hono } from 'hono';
import type { Principal } from '@frontbase/edge-core';
import type { QueryRegistry } from '@frontbase/compiler';
import { defaultDenyAuth, type ConsoleAuthVars } from './mw/auth.js';
import { opaqueErrors } from './mw/errors.js';
import { pagesRoutes } from './routes/pages.js';
import { healthRoutes } from './routes/health.js';
import { publishRoutes } from './routes/publish.js';
import { ConsoleStore } from './db/store.js';

export interface CreateConsoleDeps {
    resolvePrincipal: (req: Request) => Promise<Principal>;
    /** libsql URL (`:memory:` for tests). */
    dbUrl: string;
    /** Registered queries (for the publish pipeline's manifest). */
    queries?: QueryRegistry;
    /** Cache purge callback (publish invalidation). Default: no-op. */
    purgeCache?: (keys: string[]) => Promise<void>;
    /** Clock (deterministic in tests). Default: () => new Date().toISOString(). */
    now?: () => string;
}

export function createConsole(deps: CreateConsoleDeps): Hono<{ Variables: ConsoleAuthVars }> {
    const now = deps.now ?? (() => new Date().toISOString());
    const purge = deps.purgeCache ?? (async () => {});
    // One store per tenant (promise-cached); each is tenant-scoped at construction.
    const stores = new Map<string, Promise<ConsoleStore>>();
    const storeFor = (tenant: string): Promise<ConsoleStore> => {
        let p = stores.get(tenant);
        if (!p) { p = ConsoleStore.create(deps.dbUrl, tenant); stores.set(tenant, p); }
        return p;
    };

    const app = new Hono<{ Variables: ConsoleAuthVars }>();
    app.onError(opaqueErrors);

    // /health is unauthenticated (liveness); everything else is default-deny.
    app.route('/health', healthRoutes());
    app.use('*', defaultDenyAuth(deps.resolvePrincipal));
    app.route('/', pagesRoutes(storeFor, now));
    app.route('/', publishRoutes(storeFor, deps.queries ?? {}, purge, now));

    return app;
}

export { ConsoleStore, defaultDenyAuth, opaqueErrors };
export { publishPage } from './publish/pipeline.js';
export { migrateUp, migrateDown, appliedVersions, schemaFingerprint, MIGRATIONS } from './db/migrations.js';
export type { Migration } from './db/migrations.js';
export * from './db/schema.js';
