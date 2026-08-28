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
import type { DbRunner, ServiceFetch, StorageProvider } from '@frontbase/edge-infra';
import { defaultDenyAuth, withSessionVersion, type ConsoleAuthVars } from '../mw/auth.js';
import { fastApiErrorEnvelope, opaqueErrors } from '../mw/errors.js';
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
import { registerStorageRoutes, createStorageClientResolver } from './routes/storage.js';
import { registerEdgeDatabasesRoutes } from './routes/edge-databases.js';
import { registerAuthFormsRoutes } from './routes/auth-forms.js';
import { registerWorkflowsRoutes } from './routes/workflows.js';
import { registerActionsRoutes } from './routes/actions.js';
import { registerAuthCompatUnauthRoutes, registerAuthCompatAuthedRoutes } from './routes/auth-compat.js';
import { registerEdgeEnginesRoutes } from './routes/edge-engines.js';
import { registerTenantsRoutes } from './routes/tenants.js';
import { registerAdminPlansRoutes } from './routes/admin-plans.js';
import type { SystemEdgeDescriptor, SystemResourcesDescriptor } from './routes/edge-shapes.js';
import { registerEdgeGenericRoutes } from './routes/edge-generic.js';
import { registerEdgeProvidersRoutes } from './routes/edge-providers.js';
import { registerEdgeMiscRoutes } from './routes/edge-misc.js';
import { registerSystemQueueRoutes } from './routes/system-queue.js';
import { registerAgentCompatRoutes } from './routes/agent-compat.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerDataExecuteRoute } from './routes/data-execute.js';
import { SyncStore } from './sync-store.js';
import { CommunityInviteStore, PasswordResetStore, TemplateVariableStore, KeyValueStore, ThemesStore, SecurityEventsStore } from './store.js';
import { PagesStore } from './pages-store.js';
import { Phase2Store } from '../db/phase2-store.js';
import { createSecretCipher, noopCipher } from '../db/secret-cipher.js';
import type { UserStore } from '../db/users.js';
import { TenantStore } from '../db/tenants.js';
import { guardedExternalFetch, type CompatFetch } from './external-http.js';
import { createSystemServiceResolver, type EnvServices } from './system-services.js';
import { embeddingFromEnv } from './rag/embedding.js';
import { registerRagRoutes, runRagIndex, type RagRouteDeps } from './rag/routes.js';

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
    /** Match the product deployment mode. Cloud-only signup and slug checks are
     * disabled by default because the framework worker is self-hosted. */
    cloudMode?: boolean;
    /** Guarded provider HTTP seam. Production defaults to global fetch; tests can
     * inject a deterministic provider double without replacing route logic. */
    externalFetch?: CompatFetch;
    /** Object storage executor for compat upload/move/delete/signed-url routes. */
    storageProvider?: StorageProvider;
    /** Descriptor for the system edge — the worker this deployment runs on. The
     *  host (worker entry) owns it because it knows the platform (Cloudflare now;
     *  Deno/Vercel/Netlify entries later) and the real binding (D1). Defaults to a
     *  Cloudflare/D1 descriptor. */
    systemEdge?: SystemEdgeDescriptor;
    /** Platform truth for the Edge Resources tabs (database/cache/queue/vector
     *  system cards). Host-owned like systemEdge: it knows which services are
     *  actually wired. `null`/omitted per kind → no system row → the console's
     *  honest empty state. Defaults to the Cloudflare/D1 reality of the cf-full
     *  worker (D1 bound; nothing else). */
    systemResources?: SystemResourcesDescriptor;
    /** Host-parsed service env (dual wiring, product-faithful): FRONTBASE_CACHE /
     *  QUEUE / VECTOR (+ legacy QSTASH_TOKEN, BULLMQ_REDIS_URL,
     *  FRONTBASE_CACHE_URL). Parsed host-side via parseEnvServices (Workers have
     *  no process.env) and injected as data. Registry-adopted is_default rows
     *  take precedence over these; memory/no-op is the floor. */
    envServices?: EnvServices;
    /** Google Workspace Marketplace install URL for the Sheets connect add-on, surfaced
     *  by /api/sync/datasources/sheets/connect/issue/. Empty default => the SPA renders
     *  its bundled fallback (matches the product's FRONTBASE_SHEETS_ADDON_URL semantics). */
    sheetsAddonUrl?: string;
    /** Optional: enrich page layouts served to the console (builder canvas data
     *  preview — bakes the proxy dataRequest the client hydration runtime
     *  executes). Receives the route's tenant; returns the enriched layout.
     *  Read paths only — the pages save routes strip the enrichment back off,
     *  so nothing enriched persists into stored layouts. */
    enrichPageLayout?: (tenant: string, layout: unknown) => Promise<unknown>;
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
    // The system edge is the worker itself. Default to the Cloudflare/D1 reality of
    // the cf-full worker; the host overrides for other platforms.
    const systemEdge: SystemEdgeDescriptor = deps.systemEdge
        ?? { provider: 'cloudflare', name: 'Local Edge', db: 'Cloudflare D1' };
    // Resource-tab truth stays consistent with the systemEdge default: the CF
    // worker binds D1 and nothing else, so only the database tab gets a card.
    const systemResources: SystemResourcesDescriptor = deps.systemResources
        ?? { database: { provider: 'cloudflare', name: 'Cloudflare D1', url: 'd1://system-d1' } };
    const sheetsAddonUrl: string = deps.sheetsAddonUrl ?? '';

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
    // Isolate/app boot time — the uptime source for the system-engine health
    // check (the product engine reports module-level startedAt the same way).
    const bootedAt = Date.now();
    // System-service resolution (registry default row > env > memory). The
    // edge-resource mutation hooks below bump its memo so an adoption switch
    // takes effect on the next resolve, not after the TTL backstop.
    const serviceResolver = createSystemServiceResolver({
        phase2For,
        env: deps.envServices ?? {},
        externalFetch,
        log: (msg) => console.warn(msg),
    });
    const onEdgeResourceMutation = (tenant: string): void => serviceResolver.invalidate(tenant);
    // RAG pipeline (Phase 5): embedding over the guarded fetch (HTTPS-only —
    // the API key never leaves the server), byte access through the SAME
    // storage-client factory the storage routes resolve with. Null embedding
    // (FRONTBASE_EMBEDDING absent) leaves the routes answering "not
    // configured"; a null vector at resolve time does the same per-tenant.
    const storageResolver = createStorageClientResolver({ phase2For, kvFor, storageProvider: deps.storageProvider });
    const ragFetch: ServiceFetch = (input, init) =>
        guardedExternalFetch(externalFetch, input instanceof Request ? input.url : input, init);
    const ragDeps: RagRouteDeps = {
        phase2For,
        kvFor,
        resolver: serviceResolver,
        embedding: embeddingFromEnv(deps.envServices?.embedding, ragFetch, (msg) => console.warn(msg)),
        resolveStorage: async (tenant, providerId) => {
            const resolved = await storageResolver.resolveForOp(tenant, providerId);
            return 'status' in resolved ? resolved : resolved.client;
        },
        now,
        log: (msg) => console.warn(msg),
    };
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
    app.use('*', fastApiErrorEnvelope);
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
    // 2. Client hydration data plane (product parity — public route, no systemKeyAuth)
    registerDataExecuteRoute(
        app, runner, syncStoreFor, kvFor, externalFetch, now,
        (t, accountId) => phase2For(t).getEdgeResourceConfig(accountId),
        resolvePrincipal,
    );
    // 3. Queue receive (framework-only): the queue provider's redelivery target.
    //    UNAUTHENTICATED by design — authentication is the inbound signature /
    //    callback-secret verify inside the route (401 otherwise), and the job's
    //    tenant-scoped store lookup is the isolation boundary.
    registerSystemQueueRoutes(app, {
        phase2For,
        resolver: serviceResolver,
        now,
        runRagIndex: (tenant, bucketId) => runRagIndex(ragDeps, tenant, bucketId),
    });
    // 3. UNAUTHENTICATED auth ops only (login/logout/signup/forgot/reset/invite/
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
            kvFor,
            deps.sessionSecret,
            now,
            deps.passwordResetDelivery,
            deps.cloudMode ?? false,
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
            '/api/admin/',
            '/api/database/rls/',
            '/api/storage/providers/',
            '/api/auth/security/',
            '/api/settings/invites',
            '/api/mcp-servers',
            '/api/sync/',
        ].some((prefix) => path.startsWith(prefix));
        if (!privileged) return next();
        const principal = c.get('principal');
        // Check authentication FIRST (RULE 2: default-deny)
        if (!principal?.user) {
            return c.json({ detail: 'Authentication required' }, 401);
        }
        const role = (principal.user as { role?: string } | null)?.role;
        if (!role || !['master_admin', 'owner', 'tenant_admin', 'admin'].includes(role)) {
            return c.json({ detail: 'Forbidden' }, 403);
        }
        return next();
    });
    // /api/workflows/* is deliberately NOT blanket-denied. The product guards
    // send-email with `require_tenant_context` — the same dependency every other
    // authed route uses (app/routers/workflows.py:54) — not a separate service
    // credential. Denying the whole prefix made the operation unreachable for every
    // input, valid or not, so its 400s could never be observed.
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
    // Settings routes need userExists check for invite validation (parity with product)
    const userExists = deps.userStoreFor
        ? async (email: string, tenant: string) => {
            const user = await deps.userStoreFor!(tenant).findByEmailForVerify(email);
            return user !== null;
        }
        : undefined;
    registerSettingsRoutes(app, kvFor, invites, secretCipher, externalFetch, now, userExists);
    registerThemesRoutes(app, themesFor, now);
    registerProjectRoutes(app, kvFor, now);
    registerSecurityEventsRoutes(app, secEventsFor);
    registerPagesRoutes(app, pagesFor, now, runner, deps.enrichPageLayout);
    registerDatabaseRoutes(
        app, runner, syncStoreFor, kvFor, externalFetch, now,
        (t, accountId) => phase2For(t).getEdgeResourceConfig(accountId),
    );
    registerRlsRoutes(app, kvFor, syncStoreFor, externalFetch);
    // Wave 2
    registerStorageRoutes(app, phase2For, kvFor, secretCipher, deps.storageProvider, now);
    // RAG routes are framework-only (outside the 334-op community surface) and
    // console-authed like the storage routes they sit beside.
    registerRagRoutes(app, ragDeps);
    registerEdgeDatabasesRoutes(app, phase2For, secretCipher, externalFetch, now, systemResources, systemEdge, onEdgeResourceMutation);
    registerAuthFormsRoutes(app, runner, now);
    registerWorkflowsRoutes(app, phase2For);
    // Wave 3
    registerActionsRoutes(app, phase2For, now);
    // Wave 4 — edge domain (engines + providers + caches/queues/vectors + inspector + api-keys + gpu + deploy)
    // The engine card's cache/queue binding names resolve per tenant (adopted
    // is_default row name → env label → null) — the same resolver the runtime
    // consumers use, so the card never claims a backing the worker lacks.
    registerEdgeEnginesRoutes(app, phase2For, kvFor, secretCipher, now, systemEdge,
        (tenant) => serviceResolver.resolvedNames(tenant),
        // System-engine health (product /api/health semantics, computed here —
        // the worker IS the engine). Bindings report the resolution truth the
        // runtime uses; stateDb gets a live round trip; queue health is
        // "configured" only, exactly like the product (QStash can't be pinged
        // without publishing).
        async (tenant) => {
            const defaults = await serviceResolver.resolvedDefaults(tenant).catch(() => null);
            let stateDb: Record<string, unknown>;
            try {
                await phase2For(tenant).listEdgeResources('cache');
                stateDb = { provider: systemEdge.db ?? 'sqlite', status: 'ok' };
            } catch (error) {
                stateDb = { provider: systemEdge.db ?? 'sqlite', status: 'error', error: (error as Error).message.slice(0, 120) };
            }
            const binding = (b: { provider: string | null } | null, floor: string): Record<string, unknown> =>
                b ? { provider: b.provider ?? 'unknown', status: 'ok' } : { provider: floor, status: 'not_configured' };
            return {
                status: 'ok',
                service: 'frontbase-edge',
                provider: systemEdge.provider,
                // Serverless isolates cold-start constantly — boot-time uptime is
                // noise there, so it is reported only on long-lived hosts.
                ...(systemEdge.provider === 'cloudflare' ? {} : { uptime_seconds: Math.floor((Date.now() - bootedAt) / 1000) }),
                timestamp: now(),
                bindings: {
                    stateDb,
                    cache: binding(defaults?.cache ?? null, 'memory'),
                    queue: binding(defaults?.queue ?? null, 'none'),
                    vector: binding(defaults?.vector ?? null, 'none'),
                },
            };
        });
    registerEdgeProvidersRoutes(app, phase2For, kvFor, secretCipher, externalFetch, now);
    registerEdgeGenericRoutes(app, phase2For, secretCipher, externalFetch, now, systemResources, systemEdge, onEdgeResourceMutation,
        // The adopted is_default row is the one registry row the system engine
        // actually uses — its card renders "1 engine: <Local Edge>" (product
        // linkage semantics) while every other row stays unlinked.
        async (tenant, kind) => {
            const defaults = await serviceResolver.resolvedDefaults(tenant);
            return (defaults as unknown as Record<string, { id: string | null } | undefined>)[kind]?.id ?? null;
        });
    registerEdgeMiscRoutes(app, runner, phase2For, secretCipher, now);
    // Tenant self-surface (the console's plan signal) — framework-only op set.
    registerTenantsRoutes(app, phase2For, now);
    // Master-admin plan editor (product /api/admin/plans) — the operator-facing
    // unlock for plan-gated features like engine_imports.
    registerAdminPlansRoutes(app, phase2For, now);
    // Wave 5 — workspace agent
    registerAgentCompatRoutes(app, runner, kvFor, secretCipher, externalFetch);
    // Work A — DB-Synchronizer (/api/sync/*)
    registerSyncRoutes(app, runner, syncStoreFor, kvFor, externalFetch, now, sheetsAddonUrl, (t, accountId) => phase2For(t).getEdgeResourceConfig(accountId));

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
