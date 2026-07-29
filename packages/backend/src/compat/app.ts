/**
 * CF-22 P1 / D2 — the product-compatible console surface.
 *
 * `createCompatApp()` returns a Hono app serving the product's /api/* paths:
 * real handlers for the ops the framework implements, and 501 stubs for
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
import type { DbRunner, StorageProvider } from '@frontbase/edge-infra';
import { defaultDenyAuth, withSessionVersion, type ConsoleAuthVars } from '../mw/auth.js';
import { opaqueErrors } from '../mw/errors.js';
import { registerStubs } from './stubs.js';
import { contractRequestValidation } from './request-validation.js';
import { routedOps, attachImplementedOps, canonicalSlashVariant } from './spec.js';
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
import { registerSyncRoutes } from './routes/sync.js';
import { SyncStore } from './sync-store.js';
import { CommunityInviteStore, PasswordResetStore, TemplateVariableStore, KeyValueStore, ThemesStore, SecurityEventsStore } from './store.js';
import { PagesStore } from './pages-store.js';
import { Phase2Store } from '../db/phase2-store.js';
import { createSecretCipher, noopCipher } from '../db/secret-cipher.js';
import type { UserStore } from '../db/users.js';
import { TenantStore } from '../db/tenants.js';
import type { CompatFetch } from './external-http.js';

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
    /** Standalone/spec mode: register the product's JSON GET /. The combined CMS
     * worker owns this at its outer boundary to preserve eSSR browser routing. */
    includeProductRoot?: boolean;
    /** Deliver a raw reset capability out-of-band. The public response remains
     * identical for existing and unknown email addresses. */
    passwordResetDelivery?: (email: string, token: string) => Promise<void>;
    /** Guarded provider HTTP seam. Production defaults to global fetch; tests can
     * inject a deterministic provider double without replacing route logic. */
    externalFetch?: CompatFetch;
    /** Object storage executor for compat upload/move/delete/signed-url routes. */
    storageProvider?: StorageProvider;
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
    const externalFetch: CompatFetch = deps.externalFetch ?? ((input, init) => globalThis.fetch(input, init));

    // Per-tenant stores. Single-tenant in practice (community edition); the
    // tenant comes from the auth context (defaultDenyAuth).
    const varStoreFor = storeCache((t: string) => new TemplateVariableStore(runner, t));
    const kvFor = storeCache((t: string) => new KeyValueStore(runner, t));
    const themesFor = storeCache((t: string) => new ThemesStore(runner, t));
    const secEventsFor = storeCache((t: string) => new SecurityEventsStore(runner, t));
    const pagesFor = storeCache((t: string) => new PagesStore(runner, t));
    const secretCipher = deps.sessionSecret
        ? await createSecretCipher(deps.sessionSecret)
        : noopCipher;
    const phase2For = storeCache((t: string) => new Phase2Store(runner, t, secretCipher));
    const syncStoreFor = storeCache((t: string) => new SyncStore(runner, t, secretCipher));
    const invites = new CommunityInviteStore(runner);
    const passwordResets = new PasswordResetStore(runner);
    const tenants = new TenantStore(runner);
    const resolvePrincipal = deps.userStoreFor
        ? withSessionVersion(
            deps.resolvePrincipal as (req: Request) => Promise<any>,
            (tenant, userId) => deps.userStoreFor!(tenant).getSessionVersion(userId),
        )
        : deps.resolvePrincipal;

    const app = new Hono<{ Variables: ConsoleAuthVars }>();
    app.onError(opaqueErrors);
    const isConsolePath = (path: string) =>
        path === '/api/console' || path.startsWith('/api/console/');

    // Trailing-slash reconciliation (Gate 4). The product console calls some
    // endpoints without the slash the contract declares; FastAPI 307s those to the
    // canonical form, so they work against the product and 404'd here. Runs
    // post-hoc on 404 only — see canonicalSlashVariant() for why it cannot loop.
    // Decided BEFORE routing, deliberately. The first version did this post-hoc —
    // `await next()`, then replace `c.res` on a 404 — which crashed the workerd
    // isolate ("Your worker restarted mid-request"): the handler chain had already
    // run against a POST whose body was never consumed. GET hid it, because workerd
    // auto-retries GETs after a restart; POST is not retried, so only a real
    // browser POST exposed it. Deciding up front means no handler runs and no
    // request state is left half-consumed.
    app.use('*', async (c, next) => {
        const url = new URL(c.req.url);
        if (url.pathname.startsWith('/api/') && !isConsolePath(url.pathname)) {
            // Returns null when the path is already canonical, so valid requests
            // fall straight through.
            const variant = canonicalSlashVariant(url.pathname);
            if (variant) {
                url.pathname = variant;
                // Drain the body before responding. Redirecting a POST without
                // consuming its stream tears down the workerd isolate, so the
                // client's replayed request lands on a dying isolate and gets 503
                // ("Your worker restarted mid-request"). GET masked this — workerd
                // auto-retries GETs — so only a browser POST exposed it.
                if (c.req.raw.body) {
                    try { await c.req.raw.arrayBuffer(); } catch { /* already consumed */ }
                }
                // 307 preserves method and body — a POST/PUT is not downgraded to GET.
                return c.redirect(url.toString(), 307);
            }
        }
        return next();
    });

    // UNAUTHENTICATED routes — registered BEFORE default-deny:
    // 1. Meta (health/liveness)
    registerMetaRoutes(app, runner, deps.includeProductRoot);
    // 2. UNAUTHENTICATED auth ops only (login/logout/signup/forgot/reset/invite/
    //    accept/check-slug) — a user can't present a session to log in. The
    //    AUTHENTICATED auth ops (me + security console) are registered AFTER the
    //    guard below (they read/modify admin security state — RULE 2).
    if (deps.sessionSecret && deps.userStoreFor) {
        registerAuthCompatUnauthRoutes(
            app,
            deps.userStoreFor,
            tenants,
            invites,
            passwordResets,
            deps.sessionSecret,
            now,
            deps.passwordResetDelivery,
        );
    }

    // Everything below requires an authenticated, tenant-scoped principal.
    // SCOPED to /api/* (but NOT /api/console/* which is the engine's existing
    // console surface). This prevents the compat guard from shadowing the
    // engine's public routes (/, /sw.js, /frontbase-admin/*) and its own
    // /api/console/* sub-router.
    app.use('*', async (c, next) => {
        const path = new URL(c.req.url).pathname;
        if (!path.startsWith('/api/') || isConsolePath(path)) {
            return next(); // Not a compat path — let the next mounted app handle it
        }
        // The Sheets add-on has no browser session. A short-lived, hashed,
        // single-use capability authorizes this one callback.
        if (path === '/api/sync/datasources/sheets/connect/callback/') return next();
        return defaultDenyAuth(resolvePrincipal as (req: Request) => Promise<any>)(c, next);
    });
    // Provider credentials, infrastructure lifecycle, security administration,
    // and RLS policy management are privileged tenant-admin surfaces. Default
    // authentication alone is not sufficient: ordinary members must not be able
    // to enumerate secret metadata or mutate external infrastructure.
    app.use('*', async (c, next) => {
        const path = new URL(c.req.url).pathname;
        if (path === '/api/sync/datasources/sheets/connect/callback/') return next();
        const privileged = [
            '/api/edge-',
            '/api/cloudflare/',
            '/api/deno/',
            '/api/database/rls/',
            '/api/storage/providers/',
            '/api/auth/security/',
            '/api/settings/invites',
            '/api/mcp-servers',
            '/api/sync/',
        ].some((prefix) => path.startsWith(prefix));
        if (!privileged) return next();
        const principal = c.get('principal');
        const role = (principal.user as { role?: string } | null)?.role;
        if (!role || !['master_admin', 'owner', 'tenant_admin', 'admin'].includes(role)) {
            return c.json({ detail: 'Forbidden' }, 403);
        }
        return next();
    });
    // Validate protected requests only after authentication, preserving default-
    // deny semantics (anonymous callers receive 401, not schema-oracle 422s).
    app.use('*', contractRequestValidation());

    // AUTHENTICATED auth ops (me + security) — behind the guard (RULE 2).
    if (deps.sessionSecret && deps.userStoreFor) {
        registerAuthCompatAuthedRoutes(app, kvFor, secretCipher, now);
    }

    // Real handlers for implemented ops, registered with the exact product paths
    // on the main app (no sub-app mount — that mismatches trailing slashes).
    registerVariablesRoutes(app, varStoreFor, now);
    registerSettingsRoutes(app, kvFor, invites, secretCipher, externalFetch, now);
    registerThemesRoutes(app, themesFor, now);
    registerProjectRoutes(app, kvFor, now);
    registerSecurityEventsRoutes(app, secEventsFor);
    registerPagesRoutes(app, pagesFor, now);
    registerDatabaseRoutes(app, runner, syncStoreFor, kvFor, externalFetch, now);
    registerRlsRoutes(app, kvFor, syncStoreFor, externalFetch);
    // Wave 2
    registerStorageRoutes(app, phase2For, kvFor, secretCipher, deps.storageProvider, now);
    registerEdgeDatabasesRoutes(app, phase2For, secretCipher, externalFetch, now);
    registerAuthFormsRoutes(app, runner, now);
    registerWorkflowsRoutes(app, phase2For);
    // Wave 3
    registerActionsRoutes(app, phase2For, now);
    // Wave 4 — edge domain (engines + providers + caches/queues/vectors + inspector + api-keys + gpu + deploy)
    registerEdgeEnginesRoutes(app, phase2For, kvFor, secretCipher, now);
    registerEdgeProvidersRoutes(app, phase2For, kvFor, secretCipher, externalFetch, now);
    registerEdgeGenericRoutes(app, phase2For, secretCipher, externalFetch, now);
    registerEdgeMiscRoutes(app, runner, phase2For, secretCipher, now);
    // Wave 5 — workspace agent
    registerAgentCompatRoutes(app, runner, kvFor, secretCipher, externalFetch);
    // Work A — DB-Synchronizer (/api/sync/*)
    registerSyncRoutes(app, runner, syncStoreFor, kvFor, externalFetch, now);

    // Derive what is implemented from the routes just registered, rather than
    // from a parallel hand-maintained list. Everything else in the contract gets a
    // 501 stub. In the combined worker GET / is implemented at the outer routing
    // boundary; standalone/spec builds opt into the equivalent route above.
    // Captured BEFORE stubs: a 501 stub is a Hono route too, so deriving after
    // this point would report the entire contract as implemented.
    const implemented = routedOps(app);
    attachImplementedOps(app, implemented);
    registerStubs(app, implemented);

    return app;
}

export { buildFrameworkSpec, productOps, productSpec, productTag, opKey, toHonoPath, routedOps, implementedOps } from './spec.js';
export { TemplateVariableStore } from './store.js';
export type { TemplateVariable } from './store.js';
