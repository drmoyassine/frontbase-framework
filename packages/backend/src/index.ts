/**
 * @frontbase/backend — the in-worker console API. A Hono sub-router the host
 * mounts via createEngine({ console }) at /api/console. SERVER-ONLY.
 *
 *   createConsole({ makeRunner, resolvePrincipal?, sessionSecret?, queries?, ... }) → Hono
 *
 * `makeRunner` (Decision A-19/B1) returns a `DbRunner` — so the console speaks
 * SQLite / D1 / Turso / Postgres through one seam. `dbUrl` stays as a convenience
 * (builds a sqliteRunner) so Docker/tests are unchanged. Default-DENY auth
 * (RULE 2); Drizzle is the single source of truth (A-13); opaque errors (RULE 4).
 *
 * `sessionSecret` (BLOCKER-2) is the identity seam: when `resolvePrincipal` is
 * omitted but `sessionSecret` is given, one is built for the `fb_session` JWT
 * cookie (wired in M-ID.1).
 */
import { Hono } from 'hono';
import type { Principal } from '@frontbase/edge-core';
import type { DbRunner } from '@frontbase/edge-infra';
import { sqliteRunner } from '@frontbase/edge-infra';
import type { QueryRegistry } from '@frontbase/compiler';
import { defaultDenyAuth, type ConsoleAuthVars } from './mw/auth.js';
import { opaqueErrors } from './mw/errors.js';
import { pagesRoutes } from './routes/pages.js';
import { healthRoutes } from './routes/health.js';
import { publishRoutes } from './routes/publish.js';
import { ConsoleStore } from './db/store.js';

export interface CreateConsoleDeps {
    /** Build the DbRunner for the console DB (env-aware; e.g. from env.DB on CF).
     *  Called lazily per tenant. */
    makeRunner: () => Promise<DbRunner> | DbRunner;
    /** Resolve the calling principal. If omitted but sessionSecret is given, one is
     *  built for the fb_session JWT cookie (M-ID.1). Default: anonymous. */
    resolvePrincipal?: (req: Request) => Promise<Principal>;
    /** HS256 secret for the session JWT (identity seam — M-ID.1). */
    sessionSecret?: string;
    /** libsql URL convenience (Docker/tests) — builds sqliteRunner when makeRunner
     *  is not provided. */
    dbUrl?: string;
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

    // Resolve the runner factory: explicit makeRunner wins; dbUrl builds sqliteRunner.
    const makeRunner = deps.makeRunner ?? (async () => sqliteRunner(deps.dbUrl ?? ':memory:'));

    // Resolve the principal resolver: explicit wins; sessionSecret builds one (M-ID.1);
    // else anonymous (tenant/user-scoped queries 401 by design).
    const resolvePrincipal = deps.resolvePrincipal ?? (async () => ({ user: null, tenant: undefined }));

    // One store per tenant (promise-cached); each is tenant-scoped at construction.
    const stores = new Map<string, Promise<ConsoleStore>>();
    const storeFor = (tenant: string): Promise<ConsoleStore> => {
        let p = stores.get(tenant);
        if (!p) { p = (async () => new ConsoleStore(await makeRunner(), tenant))(); stores.set(tenant, p); }
        return p;
    };

    const app = new Hono<{ Variables: ConsoleAuthVars }>();
    app.onError(opaqueErrors);

    // /health is unauthenticated (liveness); everything else is default-deny.
    app.route('/health', healthRoutes());
    app.use('*', defaultDenyAuth(resolvePrincipal));
    app.route('/', pagesRoutes(storeFor, now));
    app.route('/', publishRoutes(storeFor, deps.queries ?? {}, purge, now));

    return app;
}

export { ConsoleStore, defaultDenyAuth, opaqueErrors };
export { publishPage } from './publish/pipeline.js';
export { migrateUp, migrateDown, appliedVersions, schemaFingerprint, MIGRATIONS } from './db/migrations.js';
export type { Migration } from './db/migrations.js';
export * from './db/schema.js';
