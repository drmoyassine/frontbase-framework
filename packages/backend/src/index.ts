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
import { sqliteRunner, createResolvePrincipal } from '@frontbase/edge-infra';
import type { QueryRegistry } from '@frontbase/compiler/manifest';
import { defaultDenyAuth, type ConsoleAuthVars } from './mw/auth.js';
import { opaqueErrors } from './mw/errors.js';
import { pagesRoutes } from './routes/pages.js';
import { healthRoutes } from './routes/health.js';
import { publishRoutes } from './routes/publish.js';
import { ConsoleStore } from './db/store.js';
import { UserStore } from './db/users.js';
import { authRoutes, meRoute } from './auth/routes.js';
import { tenantsRoutes } from './routes/tenants.js';
import { setupRoutes } from './routes/setup.js';
import { requireRole, canActOnTenant } from './auth/roles.js';

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
    /** Setup wizard token (SETUP_TOKEN env secret). Required for POST /setup; if
     *  unset, /setup and /setup/db are disabled (fail closed). */
    setupToken?: string;
    /** Role the first admin is seeded as via /setup (ADMIN_ROLE at deploy).
     *  Fixed server-side — the request body can NOT choose it (SEC CRIT-2). Default 'owner'. */
    seedRole?: string;
}

export async function createConsole(deps: CreateConsoleDeps): Promise<Hono<{ Variables: ConsoleAuthVars }>> {
    const now = deps.now ?? (() => new Date().toISOString());
    const purge = deps.purgeCache ?? (async () => {});

    // Resolve the runner factory: explicit makeRunner wins; dbUrl builds sqliteRunner.
    // createConsole is built once per isolate inside getEngine(env), so resolving the
    // runner here is fine — it's the env-bound D1 binding (or a file/:memory: URL).
    const makeRunner = deps.makeRunner ?? (async () => sqliteRunner(deps.dbUrl ?? ':memory:'));
    let sharedRunner = await makeRunner();

    // Resolve the principal resolver: explicit wins; sessionSecret builds one for
    // the fb_session JWT cookie (M-ID.1, D2); else anonymous.
    const resolvePrincipal = deps.resolvePrincipal
        ?? (deps.sessionSecret ? createResolvePrincipal({ jwtSecret: deps.sessionSecret, jwtCookie: 'fb_session' })
            : (async () => ({ user: null, tenant: undefined })));

    // Stores per tenant — built synchronously from the shared runner. RULE 6: one runner.
    const stores = new Map<string, ConsoleStore>();
    const storeFor = (tenant: string): Promise<ConsoleStore> => {
        let s = stores.get(tenant);
        if (!s) { s = new ConsoleStore(sharedRunner, tenant); stores.set(tenant, s); }
        return Promise.resolve(s);
    };
    const userStores = new Map<string, UserStore>();
    const userStoreFor = (tenant: string): UserStore => {
        let s = userStores.get(tenant);
        if (!s) { s = new UserStore(sharedRunner, tenant); userStores.set(tenant, s); }
        return s;
    };

    const app = new Hono<{ Variables: ConsoleAuthVars }>();
    app.onError(opaqueErrors);

    // /health + login/logout + setup are UNAUTHENTICATED (pre-init / you can't require a session to log in).
    app.route('/health', healthRoutes());
    // Setup wizard (M-ID.3 + DB picker) — outside default-deny (no session exists pre-init).
    // seedRole comes from deploy config (ADMIN_ROLE), NOT the request body (SEC CRIT-2).
    app.route('/', setupRoutes({ userStoreFor, setupToken: deps.setupToken, seedRole: deps.seedRole, setRunner: (r) => { sharedRunner = r; }, now }));
    if (deps.sessionSecret) {
        app.route('/', authRoutes({ userStoreFor, sessionSecret: deps.sessionSecret }));
    }
    // Everything below requires an authenticated principal (default-deny).
    app.use('*', defaultDenyAuth(resolvePrincipal));
    app.route('/', pagesRoutes(storeFor, now));
    app.route('/', publishRoutes(storeFor, deps.queries ?? {}, purge, now));
    if (deps.sessionSecret) {
        app.route('/', meRoute()); // /me — principal already resolved
        app.route('/', tenantsRoutes(() => sharedRunner, userStoreFor, now)); // /tenants — master_admin only (M-ID.2)
    }

    return app;
}

export { ConsoleStore, defaultDenyAuth, opaqueErrors };
export { UserStore, toPublic } from './db/users.js';
export type { UserRecord, PublicUser } from './db/users.js';
export { seedOwner } from './auth/seed.js';
export { authRoutes, meRoute } from './auth/routes.js';
export { requireRole, canActOnTenant } from './auth/roles.js';
export { TenantStore } from './db/tenants.js';
export type { TenantRecord } from './db/tenants.js';
export { tenantsRoutes } from './routes/tenants.js';
export { publishPage } from './publish/pipeline.js';
export { migrateUp, migrateDown, appliedVersions, schemaFingerprint, MIGRATIONS } from './db/migrations.js';
export type { Migration } from './db/migrations.js';
export * from './db/schema.js';
