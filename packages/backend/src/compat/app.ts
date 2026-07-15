/**
 * CF-22 P1 / D2 — the product-compatible console surface.
 *
 * `createCompatApp()` returns a Hono app serving the product's /api/* paths:
 * real handlers for IMPLEMENTED ops (P1: the `variables` tag) and 501 stubs for
 * every other vendored community op. The whole surface sits behind defaultDenyAuth
 * (RULE 2 from day one). RULE 4 (opaque errors) via onError.
 *
 * The host mounts this SEPARATELY from the existing /api/console surface (the
 * product paths /api/<domain>/... are siblings of /api/console), coexisting
 * until P3 cuts the console SPA over to it. Migrations (incl. v7
 * template_variables) must be applied on the runner by the host before use, as
 * with createConsole.
 */
import { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import { defaultDenyAuth, type ConsoleAuthVars } from '../mw/auth.js';
import { opaqueErrors } from '../mw/errors.js';
import { registerStubs } from './stubs.js';
import { IMPLEMENTED } from './registry.js';
import { registerVariablesRoutes } from './routes/variables.js';
import { registerMetaRoutes } from './routes/meta.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerThemesRoutes } from './routes/themes.js';
import { registerProjectRoutes } from './routes/project.js';
import { registerSecurityEventsRoutes } from './routes/security-events.js';
import { registerPagesRoutes } from './routes/pages.js';
import { registerDatabaseRoutes } from './routes/database.js';
import { registerRlsRoutes } from './routes/rls.js';
import { registerStorageRoutes } from './routes/storage.js';
import { registerEdgeDatabasesRoutes } from './routes/edge-databases.js';
import { registerAuthFormsRoutes } from './routes/auth-forms.js';
import { registerWorkflowsRoutes } from './routes/workflows.js';
import { registerActionsRoutes } from './routes/actions.js';
import { registerAuthCompatUnauthRoutes, registerAuthCompatAuthedRoutes } from './routes/auth-compat.js';
import { registerEdgeEnginesRoutes } from './routes/edge-engines.js';
import { registerEdgeGenericRoutes } from './routes/edge-generic.js';
import { registerEdgeProvidersRoutes } from './routes/edge-providers.js';
import { registerEdgeMiscRoutes } from './routes/edge-misc.js';
import { registerAgentCompatRoutes } from './routes/agent-compat.js';
import { TemplateVariableStore, KeyValueStore, ThemesStore, SecurityEventsStore } from './store.js';
import { PagesStore } from './pages-store.js';
import { Phase2Store } from '../db/phase2-store.js';
import { noopCipher } from '../db/secret-cipher.js';
import type { UserStore } from '../db/users.js';

export interface CreateCompatAppDeps {
    /** Build the DbRunner (env-aware). Called lazily; the app caches one runner. */
    makeRunner: () => Promise<DbRunner> | DbRunner;
    /** Resolve the calling principal (default-deny requires a real one). */
    resolvePrincipal: (req: Request) => Promise<{ user: unknown; tenant: string }>;
    /** Clock (deterministic in tests). Default: () => new Date().toISOString(). */
    now?: () => string;
    /** Optional: session secret for the auth compat surface (login/logout). When
     *  absent, auth routes stay as 501 stubs. */
    sessionSecret?: string;
    /** Optional: user store factory for login credential lookup. */
    userStoreFor?: (tenant: string) => UserStore;
}

/** Build a per-tenant store cache. */
function storeCache<T>(build: (tenant: string) => T): (tenant: string) => T {
    const cache = new Map<string, T>();
    return (tenant: string) => {
        let s = cache.get(tenant);
        if (!s) { s = build(tenant); cache.set(tenant, s); }
        return s;
    };
}

export async function createCompatApp(deps: CreateCompatAppDeps): Promise<Hono<{ Variables: ConsoleAuthVars }>> {
    const now = deps.now ?? (() => new Date().toISOString());
    const runner = await deps.makeRunner();

    // Per-tenant stores. Single-tenant in practice (community edition); the
    // tenant comes from the auth context (defaultDenyAuth).
    const varStoreFor = storeCache((t: string) => new TemplateVariableStore(runner, t));
    const kvFor = storeCache((t: string) => new KeyValueStore(runner, t));
    const themesFor = storeCache((t: string) => new ThemesStore(runner, t));
    const secEventsFor = storeCache((t: string) => new SecurityEventsStore(runner, t));
    const pagesFor = storeCache((t: string) => new PagesStore(runner, t));
    const phase2For = storeCache((t: string) => new Phase2Store(runner, t, noopCipher));

    const app = new Hono<{ Variables: ConsoleAuthVars }>();
    app.onError(opaqueErrors);

    // UNAUTHENTICATED routes — registered BEFORE default-deny:
    // 1. Meta (health/liveness)
    registerMetaRoutes(app);
    // 2. UNAUTHENTICATED auth ops only (login/logout/signup/forgot/reset/invite/
    //    accept/check-slug) — a user can't present a session to log in. The
    //    AUTHENTICATED auth ops (me + security console) are registered AFTER the
    //    guard below (they read/modify admin security state — RULE 2).
    if (deps.sessionSecret && deps.userStoreFor) {
        registerAuthCompatUnauthRoutes(app, deps.userStoreFor, deps.sessionSecret);
    }

    // Everything below requires an authenticated, tenant-scoped principal.
    app.use('*', defaultDenyAuth(deps.resolvePrincipal as (req: Request) => Promise<any>));

    // AUTHENTICATED auth ops (me + security) — behind the guard (RULE 2).
    if (deps.sessionSecret && deps.userStoreFor) {
        registerAuthCompatAuthedRoutes(app);
    }

    // Real handlers for implemented ops, registered with the exact product paths
    // on the main app (no sub-app mount — that mismatches trailing slashes).
    registerVariablesRoutes(app, varStoreFor, now);
    registerSettingsRoutes(app, kvFor, now);
    registerThemesRoutes(app, themesFor, now);
    registerProjectRoutes(app, kvFor, now);
    registerSecurityEventsRoutes(app, secEventsFor);
    registerPagesRoutes(app, pagesFor, now);
    registerDatabaseRoutes(app, kvFor, now);
    registerRlsRoutes(app, kvFor);
    // Wave 2
    registerStorageRoutes(app, phase2For, now);
    registerEdgeDatabasesRoutes(app, phase2For, now);
    registerAuthFormsRoutes(app, runner, now);
    registerWorkflowsRoutes(app);
    // Wave 3
    registerActionsRoutes(app, phase2For, now);
    // Wave 4 — edge domain (engines + providers + caches/queues/vectors + inspector + api-keys + gpu + deploy)
    registerEdgeEnginesRoutes(app, phase2For, now);
    registerEdgeProvidersRoutes(app, phase2For, now);
    registerEdgeGenericRoutes(app, phase2For, now);
    registerEdgeMiscRoutes(app, runner, phase2For, now);
    // Wave 5 — workspace agent
    registerAgentCompatRoutes(app, runner, kvFor);

    // 501 stubs for any vendored op not yet implemented (currently zero — all 284
    // are implemented. Re-sync may add new ops that need stubs until implemented.)
    registerStubs(app, IMPLEMENTED);

    return app;
}

export { IMPLEMENTED } from './registry.js';
export { buildFrameworkSpec, productOps, productSpec, productTag, opKey, toHonoPath } from './spec.js';
export { TemplateVariableStore } from './store.js';
export type { TemplateVariable } from './store.js';
