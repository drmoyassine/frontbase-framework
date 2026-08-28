/**
 * Cloudflare Worker entry — the FULL CMS as ONE worker: the eSSR engine
 * (@frontbase/edge-core) + the login-gated admin console (@frontbase/backend),
 * over a Cloudflare D1 binding (@frontbase/edge-infra).
 *
 * CF-22: the community console SPA is served from console-dist/ (built and
 * staged from the in-repo @frontbase/console package by `pnpm console:build`).
 * The framework SPA is setup-only at
 * /setup, /console redirects to the product console, and the legacy
 * /api/console surface is retired except for health and first-run setup.
 * The vendored GET / operation remains owned by the eSSR engine.
 *
 * Deploy secrets (wrangler secret put — never in wrangler.toml, never in git):
 *   SESSION_SECRET  (required) HS256 key for the frontbase_session JWT cookie
 *   SETUP_TOKEN     (optional) enables the first-run /setup wizard
 *   SETUP_EXPIRES_AT (optional) ISO expiry for the deploy-generated setup link
 *   ADMIN_EMAIL     (optional) seed the first owner on first boot …
 *   ADMIN_PASSWORD  (optional) … idempotent — never reseeds, never resets
 *   ADMIN_ROLE      (optional) role for the seeded admin (default 'master_admin')
 */
import { Hono } from 'hono';
import { createEngine, directProvider, configureEngine } from '@frontbase/edge-core';
import type { PageEntry } from '@frontbase/edge-core';
import { createConsole, createCompatApp, migrateUp, seedOwner, UserStore, PagesStore, Phase2Store, SyncStore, enrichLayoutBindings, stripLayoutEnrichment, createSecretCipher, inspectTable, datasourceRunner, dialectOf, resolveDatasourceConfig, mergeAccountConfig, KeyValueStore, readProjectAsset, readProjectSettings, parseEnvServices, createSystemServiceResolver, envServiceDescriptor, ENV_CARD_LABELS, type EnrichableDatasource, type SchemaColumnSnapshot, type StoredProjectAsset, type EnvServices } from '@frontbase/backend';
import { createBuilderEngine } from '@frontbase/builder';
import { registerComponents } from '@frontbase/builder/registry';
import { d1RunnerFromBinding, s3StorageProvider, type DbRunner, type StorageProvider } from '@frontbase/edge-infra';
import { manifest } from './manifest.js';
import SW_BUNDLE from 'virtual:sw-bundle';
import CLIENT_BUNDLE from 'virtual:builder-client-bundle';
import CONSOLE_INDEX from './console-shell.js';

const SETUP_SPA_HTML = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frontbase Setup</title></head><body><div id="root"></div><script src="/frontbase-setup/spa.js"></script></body></html>';

// Host config: there is no process.env on Workers — supply edition/env explicitly.
configureEngine({ edition: 'community', nodeEnv: 'production' });

export interface CmsEnv {
    DB: D1Database;
    ASSETS: { fetch(request: Request): Promise<Response> };
    SESSION_SECRET: string;
    SETUP_TOKEN?: string;
    SETUP_EXPIRES_AT?: string;
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
    ADMIN_ROLE?: string;
    STORAGE_ACCESS_KEY_ID?: string;
    STORAGE_SECRET_ACCESS_KEY?: string;
    STORAGE_ENDPOINT?: string;
    STORAGE_REGION?: string;
    // System services (dual wiring): parsed host-side via parseEnvServices and
    // injected as data — never read from process.env in library code. Adopted
    // is_default registry rows take precedence over these.
    FRONTBASE_CACHE?: string;
    FRONTBASE_QUEUE?: string;
    FRONTBASE_VECTOR?: string;
    FRONTBASE_EMBEDDING?: string;
    QSTASH_TOKEN?: string;
    BULLMQ_REDIS_URL?: string;
    FRONTBASE_CACHE_URL?: string;
    FRONTBASE_CACHE_TOKEN?: string;
    PUBLIC_URL?: string;
    FRONTBASE_QUEUE_CALLBACK_SECRET?: string;
}

export interface CmsEngineOptions {
    runner: DbRunner;
    sessionSecret: string;
    setupToken?: string;
    setupExpiresAt?: string;
    admin?: { email?: string; password?: string; role?: string };
    now?: () => string;
    /** F3b: background dispatcher. */
    dispatcher?: (work: () => Promise<void>) => void;
    /** Wrangler Static Assets binding. Omitted by the in-process smoke. */
    assets?: { fetch(request: Request): Promise<Response> };
    storageProvider?: StorageProvider;
    /** Identity of the host this engine runs on (edge-engines system card).
     *  Defaults to the Cloudflare worker; the Node entry passes its own. */
    systemEdge?: { provider: string; name?: string; db?: string | null; cache?: string | null; queue?: string | null };
    /** Platform truth for the Edge Resources tabs (database/cache/queue/vector
     *  system cards). Defaults to the Cloudflare worker's reality: only D1 is
     *  bound — async execution is waitUntil + the D1 executions ledger, so the
     *  cache/queue/vector tabs render their honest empty states. The Node entry
     *  overrides with its local SQLite truth. */
    systemResources?: {
        database?: { provider: string; name: string; url?: string | null } | null;
        cache?: { provider: string; name: string; url?: string | null } | null;
        queue?: { provider: string; name: string; url?: string | null } | null;
        vector?: { provider: string; name: string; url?: string | null } | null;
    };
    /** Host-parsed service env (FRONTBASE_* JSON + legacy vars → parseEnvServices).
     *  Drives the enrich-caches resolver and the env-derived system cards; a
     *  tenant's adopted is_default row still wins at resolve time. */
    envServices?: EnvServices;
    /** Provider HTTP seam for the compat surface (guarded where tenant-controlled).
     *  Production hosts use the platform default (globalThis.fetch); the smoke
     *  injects a deterministic double — the documented escape hatch on
     *  guardedExternalFetch, which still validates every URL it wraps. */
    externalFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * Assemble the full CMS engine. The routing order is:
 *   1. /api/auth/login, /api/auth/logout, /api/auth/signup, etc. (UNAUTHENTICATED compat)
 *   2. /api/* — the 334-operation product-compatible surface
 *      → behind defaultDenyAuth (except documented unauth auth/callback routes)
 *   3. /frontbase-admin assets + shell (Static Assets binding in production;
 *      validated inline fallback in the Node smoke)
 *   4. /console → 301 to /frontbase-admin (continuity redirect)
 *   5. /setup — first-run setup-only SPA
 *   6. Engine catch-all (published pages, /sw.js)
 */
export async function createCmsEngine(opts: CmsEngineOptions): Promise<Hono> {
    const now = opts.now ?? (() => new Date().toISOString());
    await migrateUp(opts.runner, now);
    // Fresh-deploy homepage template: a real, editable page that is live at '/'
    // (is_homepage=1, is_published=1). Idempotent — only seeds when no homepage
    // exists, so the user can edit/delete/replace it freely.
    await new PagesStore(opts.runner, '_root').ensureHomepage(now());
    if (opts.admin?.email && opts.admin?.password) {
        const role = opts.admin.role ?? 'master_admin';
        const tenantSlug = role === 'master_admin' ? '_root' : '_default';
        await seedOwner(new UserStore(opts.runner, tenantSlug), {
            email: opts.admin.email,
            password: opts.admin.password,
            now: now(),
            role,
            tenantSlug,
        });
    }
    const needsSetup = async () =>
        (await new UserStore(opts.runner, '_default').countUsers()) === 0
        && (await new UserStore(opts.runner, '_root').countUsers()) === 0;

    // CF-22 Work C: retain health + first-run setup, explicitly retire every
    // other /api/console/* route with 410 Gone.
    const consoleApp = await createConsole({
        makeRunner: () => opts.runner,
        sessionSecret: opts.sessionSecret,
        setupToken: opts.setupToken,
        setupExpiresAt: opts.setupExpiresAt,
        seedRole: opts.admin?.role ?? 'master_admin',
        now,
        dispatcher: opts.dispatcher,
        retireLegacyApi: true,
        storageProvider: opts.storageProvider,
    });

    // Binding enrichment (the public.py → convert_component port) — shared by
    // three surfaces: the eSSR published-page serve path (engine enrichLayout),
    // the compat /api/pages reads (admin SPA data preview), and the builder
    // canvas loadPage. Datasource lists are TTL-cached (5s per tenant): the
    // enrich path runs on every page view / canvas load, and the pages-list
    // route enriches N layouts per request — without the cache each call
    // re-queries the datasource table.
    const enrichCipher = await createSecretCipher(opts.sessionSecret);
    // The worker's OWN system-service resolver for these caches (separate from
    // the compat app's instance — the multi-store idiom this file already
    // uses). Resolves adopted is_default row > env > memory per tenant; memory
    // fallback keeps the 5s/30s caches working with zero configuration.
    const enrichPhase2Stores = new Map<string, Phase2Store>();
    const enrichPhase2For = (t: string): Phase2Store => {
        let s = enrichPhase2Stores.get(t);
        if (!s) { s = new Phase2Store(opts.runner, t, enrichCipher); enrichPhase2Stores.set(t, s); }
        return s;
    };
    const enrichResolver = createSystemServiceResolver({
        phase2For: enrichPhase2For,
        env: opts.envServices ?? {},
        externalFetch: (input, init) => globalThis.fetch(input, init),
        log: (msg) => console.warn(msg),
    });
    const datasourcesFor = async (tenant: string): Promise<EnrichableDatasource[]> => {
        const cache = await enrichResolver.cacheFor(tenant);
        const hit = await cache.get('enrich:datasources');
        if (Array.isArray(hit)) return hit;
        let list: EnrichableDatasource[] = [];
        // Caller's tenant first; community single-tenant fallbacks preserve
        // the original engine behavior ('_root' then '_default').
        const order = tenant === '_root' ? [tenant, '_default'] : [tenant, '_root', '_default'];
        for (const t of order) {
            try {
                list = await new SyncStore(opts.runner, t, enrichCipher).listDatasources();
            } catch { list = []; }
            if (list.length > 0) break;
        }
        await cache.setex('enrich:datasources', 5, JSON.stringify(list));
        return list;
    };
    // Schema snapshots for the Form/InfoList `binding.columns` bake. Their edge
    // hooks have no schema endpoint to call — empty columns render "No schema
    // available for '<table>'. Try re-publishing" — so serve-time enrichment
    // bakes the column list alongside the dataRequest. Cached 30s per
    // datasource+table, wrapped `{ok:true, snapshot}` so a cached failed lookup
    // (null snapshot) is distinguishable from a miss (don't retry every request).
    const schemaSnapshotsFor = async (
        tenant: string,
        layout: unknown,
        datasources: EnrichableDatasource[],
    ): Promise<Map<string, SchemaColumnSnapshot[]> | undefined> => {
        // Collect (dataSourceId, tableName) pairs from Form/InfoList bindings
        // that don't already carry a columns snapshot.
        const needed = new Set<string>();
        const scan = (node: unknown): void => {
            if (Array.isArray(node)) { node.forEach(scan); return; }
            if (!node || typeof node !== 'object') return;
            const comp = node as Record<string, unknown>;
            if (comp.type === 'Form' || comp.type === 'InfoList') {
                const props = comp.props as Record<string, unknown> | undefined;
                const b = (comp.binding ?? props?.binding) as Record<string, unknown> | undefined;
                if (b && typeof b === 'object') {
                    const dsId = [b.dataSourceId, b.datasourceId, b.datasource_id].find((v) => typeof v === 'string' && v) as string | undefined;
                    const table = [b.tableName, b.table_name].find((v) => typeof v === 'string' && v) as string | undefined;
                    const hasColumns = Array.isArray(b.columns) && b.columns.length > 0;
                    if (dsId && table && !hasColumns) needed.add(`${dsId}::${table}`);
                }
            }
            for (const value of Object.values(comp)) {
                if (value && typeof value === 'object') scan(value);
            }
        };
        scan(layout);
        if (needed.size === 0) return undefined;
        const cache = await enrichResolver.cacheFor(tenant);
        const out = new Map<string, SchemaColumnSnapshot[]>();
        const byId = new Map(datasources.map((d) => [d.id, d]));
        for (const key of needed) {
            const cacheKey = `enrich:schema:${key}`;
            const wrapped = await cache.get(cacheKey) as { ok?: boolean; snapshot?: SchemaColumnSnapshot[] | null } | null | undefined;
            if (wrapped && wrapped.ok === true) {
                if (wrapped.snapshot) out.set(key, wrapped.snapshot);
                continue;
            }
            const [dsId, table] = key.split('::');
            const ds = byId.get(dsId);
            let snapshot: SchemaColumnSnapshot[] | null = null;
            if (ds) {
                try {
                    // Same credential hydration the compat data routes use:
                    // account-backed datasources keep their secrets on the edge
                    // resource (connected account) row — merge them back via
                    // getEdgeResourceConfig, exactly like app.ts's
                    // accountConfigFor for registerDataExecuteRoute.
                    const merged = await mergeAccountConfig(
                        (t, accountId) => enrichPhase2For(t).getEdgeResourceConfig(accountId),
                        (input, init) => globalThis.fetch(input, init),
                        tenant, ds.kind, ds.config ?? {},
                    ).catch(() => ds.config ?? {});
                    const runner = datasourceRunner(ds.kind, resolveDatasourceConfig(ds.kind, merged));
                    snapshot = (await inspectTable(runner, dialectOf(ds.kind), table)).columns;
                } catch { snapshot = null; }
            }
            await cache.setex(cacheKey, 30, JSON.stringify({ ok: true, snapshot }));
            if (snapshot) out.set(key, snapshot);
        }
        return out;
    };
    const enrichWithDatasources = async (tenant: string, layout: unknown): Promise<unknown> => {
        try {
            const datasources = await datasourcesFor(tenant);
            return enrichLayoutBindings(layout, datasources, await schemaSnapshotsFor(tenant, layout, datasources));
        } catch {
            return layout; // best-effort — serve un-enriched
        }
    };
    // Canvas render path: normalize (strip any baked enrichment — the console's
    // client state may carry a dataRequest for a table the user has since
    // changed) then re-enrich from the CURRENT binding. This is what makes a
    // freshly dropped component on an unsaved page fetch data: its binding has
    // never been through storage, so enrichment happens here, at render time.
    const enrichForCanvas = async (layout: any): Promise<any> =>
        await enrichWithDatasources('_root', stripLayoutEnrichment(layout)) as any;

    // CF-22 P3: the compat /api/* surface (the eSSR engine owns vendored GET /).
    // Sits BEFORE the engine catch-all so /api/auth/login, /api/pages/, etc.
    // are served by the framework, not shadowed by the eSSR proxy.
    const compatApp = await createCompatApp({
        makeRunner: () => opts.runner,
        resolvePrincipal: (await import('@frontbase/edge-infra')).createResolvePrincipal({
            jwtSecret: opts.sessionSecret,
            jwtCookie: 'frontbase_session',
        }) as (req: Request) => Promise<any>,
        sessionSecret: opts.sessionSecret,
        userStoreFor: (t: string) => new UserStore(opts.runner, t),
        now,
        storageProvider: opts.storageProvider,
        // The system edge is THIS process. The default describes the Cloudflare
        // worker (bound D1); the Node/Docker entry overrides via opts.systemEdge
        // so self-hosts don't report "Cloudflare D1" they don't have.
        systemEdge: opts.systemEdge ?? { provider: 'cloudflare', name: 'Local Edge', db: 'Cloudflare D1' },
        // Resource-tab truth for the same reason: this worker binds only D1 —
        // no KV/Queues/Vectorize — so the database tab gets a system card and
        // the other three render env-derived cards when FRONTBASE_* wiring
        // declares them (absent → null → honest empty state).
        systemResources: opts.systemResources ?? {
            database: { provider: 'cloudflare', name: 'Cloudflare D1', url: 'd1://system-d1' },
            cache: envServiceDescriptor(opts.envServices?.cache, ENV_CARD_LABELS.cache),
            queue: envServiceDescriptor(opts.envServices?.queue, ENV_CARD_LABELS.queue),
            vector: envServiceDescriptor(opts.envServices?.vector, ENV_CARD_LABELS.vector),
        },
        // Dual wiring: the parsed service env. Adopted is_default registry rows
        // still take precedence at resolve time; this is the deploy-time floor.
        envServices: opts.envServices,
        // Host fetch seam — the smoke routes its local embedding mock through
        // here; production omits it and gets globalThis.fetch.
        externalFetch: opts.externalFetch,
        // Enrich console page reads so the admin SPA / builder surfaces hold a
        // dataRequest the hydration runtime can execute (canvas data preview).
        // Save paths strip it in PagesStore before persisting.
        enrichPageLayout: (tenant, layout) => enrichWithDatasources(tenant, layout),
    });

    // Phase 1: Wire the framework eSSR BuilderEngine as the real builder canvas.
    // The builder uses PagesStore for persistence and is mounted behind auth.
    const pagesStore = new PagesStore(opts.runner, '_root');
    await registerComponents(); // Populate the component registry
    const resolvePrincipal = (await import('@frontbase/edge-infra')).createResolvePrincipal({
        jwtSecret: opts.sessionSecret,
        jwtCookie: 'frontbase_session',
    });
    // Wire the visitor session resolver into the eSSR engine so private-page
    // gating decides the SAME way the compat /api surface and the builder gate
    // do: a valid frontbase_session JWT → authenticated user; otherwise anonymous (and
    // a private page is served behind the auth overlay). configureEngine RESETS
    // to defaults on each call (its documented contract), so the edition/env
    // values are re-stated here alongside resolvePrincipal in ONE call — this
    // replaces the module-load `configureEngine({ edition, nodeEnv })`.
    // Branding seam: resolveFaviconUrl feeds the published-page <link rel=icon>
    // and the Navbar project-logo injection (navbarFavicon.ts). It reads the
    // console's project settings — faviconUrl set via POST /api/project/assets/upload/
    // — falling back to the framework icon. Same single-tenant fallback order as
    // datasource enrichment: the product serves branding globally (disk), so
    // '_root' then '_default' approximates one namespace across the KV's rows.
    const engineOverrides = {
        edition: 'community' as const,
        nodeEnv: 'production',
        resolvePrincipal,
        resolveFaviconUrl: async (): Promise<string> => {
            let settings: Record<string, unknown> = {};
            for (const tenant of ['_root', '_default']) {
                settings = await readProjectSettings(opts.runner, tenant);
                if (Object.keys(settings).length) break;
            }
            const url = settings.faviconUrl;
            return typeof url === 'string' && url ? url : '/static/icon.png';
        },
    };
    configureEngine(engineOverrides);
    // Auth gate for every builder route: no session → 302 to /frontbase-admin
    // (with a return URL). Passed INTO createBuilderEngine via `authMiddleware` so
    // it is registered as the FIRST handler — Hono dispatches in registration
    // order, so a gate added after the routes (or via a parent app.use that
    // doesn't cascade onto mounted sub-apps) never runs before them.
    const builderAuthGate = async (c: any, next: any) => {
        const principal = await resolvePrincipal(c.req.raw);
        // resolvePrincipal returns { user: null } (a truthy OBJECT) when there is
        // no credential — NOT null. Checking `!principal` therefore never redirects
        // (the builder was unprotected from d78b292 until this fix; the routing 404
        // masked it). Check the USER: no authenticated user → 302 to login.
        if (!principal?.user) {
            const returnUrl = encodeURIComponent(c.req.url);
            return c.redirect(`/frontbase-admin?returnUrl=${returnUrl}`, 302);
        }
        return next();
    };
    const builderApp = createBuilderEngine({
        loadPage: async (pageId: string) => {
            const row = await pagesStore.get(pageId);
            if (!row) return null;
            let layout: unknown;
            try { layout = JSON.parse(row.layout_data); } catch { layout = { content: [], root: {} }; }
            // Raw authored layout — the render sites enrich via enrichLayout
            // below (covers freshly dropped, never-saved components too).
            return { id: row.id, layout: layout as any };
        },
        savePage: async (pageId: string, layoutData) => {
            await pagesStore.update(pageId, { layoutData }, now());
        },
        autoSave: false, // No auto-save for now
        authMiddleware: builderAuthGate,
        // Canvas shows real data (deliberate divergence from the product's
        // "No data available" canvas). Applied at every render site, including
        // reRender — the console's live-edit path for UNSAVED layouts. Enriched
        // layouts saved through savePage are stripped by PagesStore first, so
        // nothing baked ever lands in storage.
        enrichLayout: enrichForCanvas,
        // Point the canvas template at the inlined editing client (built by
        // build.mjs as virtual:builder-client-bundle), served below at
        // /builder/client.js. Without this, the template's <script> 404s, the
        // editing client never runs, and the tree/property panels never build.
        clientBundle: '/builder/client.js',
    });
    // Serve the editing client IIFE. Same-origin <script src> from the authed
    // /builder/edit page carries the session cookie, so builderAuthGate passes.
    builderApp.get('/client.js', () =>
        new Response(CLIENT_BUNDLE, {
            status: 200,
            headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' },
        }),
    );

    const engine = createEngine({
        manifest,
        data: directProvider(manifest),
        environment: 'edge',
        swBundle: SW_BUNDLE,
        console: consoleApp,
        // Serve published Builder pages (dynamic-first — they override the baked
        // demo). '/' → the homepage (is_homepage=1); '/<slug>' → by slug. Only
        // published, non-deleted pages. Community single-tenant: read across tenants.
        resolvePublishedPage: async (path) => {
            const rows = path === '/'
                ? await opts.runner.query('SELECT name, slug, description, layout_data, is_public, primary_auth_form FROM compat_pages WHERE is_homepage = 1 AND is_published = 1 AND deleted_at IS NULL LIMIT 1')
                : await opts.runner.query('SELECT name, slug, description, layout_data, is_public, primary_auth_form FROM compat_pages WHERE slug = ? AND is_published = 1 AND deleted_at IS NULL LIMIT 1', [decodeURIComponent(path).replace(/^\/+|\/+$/g, '')]);
            const row = rows[0];
            if (!row) return null;
            let layout;
            try { layout = JSON.parse(String(row.layout_data)); } catch { layout = { content: [], root: {} }; }
            // Surface the page's visibility flag so the eSSR engine can gate
            // private pages. is_public is INTEGER (0/1) in compat_pages; coerce
            // to a boolean, defaulting to public when absent (NULL → public),
            // matching the product's `isPublic` semantics.
            const isPublic = row.is_public == null ? undefined : Number(row.is_public) !== 0;
            // primary_auth_form is the project's primary auth-form config baked at
            // publish (migration v19) — a TEXT column holding a JSON AuthFormConfig.
            // The engine threads page._primaryAuthForm into generateGatedPageDocument
            // so a private page's overlay skins from real config. NULL/invalid →
            // undefined → the overlay falls back to its built-in defaults.
            let primaryAuthForm: PageEntry['_primaryAuthForm'];
            if (row.primary_auth_form != null && String(row.primary_auth_form) !== '') {
                try {
                    const parsed = JSON.parse(String(row.primary_auth_form));
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        primaryAuthForm = parsed as PageEntry['_primaryAuthForm'];
                    }
                } catch { /* malformed JSON → fall back to overlay defaults */ }
            }
            return {
                title: String(row.name ?? row.slug ?? 'Page'),
                slug: String(row.slug ?? ''),
                description: row.description ? String(row.description) : undefined,
                layout,
                ...(isPublic !== undefined ? { isPublic } : {}),
                ...(primaryAuthForm ? { _primaryAuthForm: primaryAuthForm } : {}),
            };
        },
        // Serve-time binding enrichment (product parity: FastAPI public.py →
        // convert_component bakes binding.dataRequest so client hydration has a
        // request to execute). Attaches proxy-strategy dataRequests — only
        // datasourceId is baked into the page; credentials resolve server-side
        // at /api/data/execute. Shared helper (TTL-cached datasource list),
        // same '_root'-then-'_default' fallback as before.
        enrichLayout: (layout) => enrichWithDatasources('_root', layout),
    });

    const app = new Hono();

    // engineConfig() state is MODULE-GLOBAL, and edge-core render paths read it
    // at request time. A process hosting more than one engine — production is
    // one engine per isolate, but the in-process smoke builds several — would
    // otherwise have the LAST-created engine's resolvers answer every earlier
    // engine's renders (a fresh engine's empty DB silently shadowing this one).
    // Re-asserting per request keeps each engine self-consistent. Registered
    // before any route, so it composes first for every handler below.
    app.use('*', async (_c, next) => {
        configureEngine(engineOverrides);
        await next();
    });

    const assetResponse = async (request: Request, cacheControl: string): Promise<Response | null> => {
        if (!opts.assets) return null;
        const response = await opts.assets.fetch(request);
        // 304 is a HIT, not a miss: both the Static Assets binding and the Node
        // disk shim answer a matching If-None-Match with 304. Treating it as a
        // miss (`!response.ok`) 404s the very revalidation the no-cache policy
        // on /static/react/hydrate.js asks browsers to make — the browser has
        // the bytes cached and gets a 404 instead of "still valid".
        if (response.status !== 200 && response.status !== 304) return null;
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', cacheControl);
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    };

    // ── Client hydration assets (product parity) ─────────────────────────────
    // These are bundled from the product's built hydrate.js (vendor:console-dist).
    // In production, the ASSETS binding serves them from public/react/*; in dev
    // (no binding), we return a clear 404 rather than serving a broken file.
    // The framework's htmlDocument.ts unconditionally loads these at
    // /static/react/hydrate.js?v=<version> and /static/icon.png — the bundle
    // MUST exist for DataTable/Form/etc. client hydration.
    app.get('/static/react/hydrate.js', async (c) => {
        const url = new URL(c.req.url);
        url.pathname = '/react/hydrate.js';
        // NOT immutable: this bundle is patched locally (scripts/patch-hydrate.mjs)
        // while the version query stays pinned by the vendored console/SW html —
        // revalidate via ETag so patched bytes reach browsers that already cached
        // the URL (a conditional GET 304s when unchanged, so the cost is one
        // round trip per canvas load).
        const asset = await assetResponse(new Request(url, c.req.raw), 'no-cache, must-revalidate');
        if (asset) {
            const headers = new Headers(asset.headers);
            headers.set('Content-Type', 'application/javascript; charset=utf-8');
            return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
        }
        return c.text('not_found', 404);
    });
    app.get('/static/react/:cssFile{entry-.+\\.css}', async (c) => {
        const cssFile = c.req.param('cssFile');
        const url = new URL(c.req.url);
        url.pathname = `/react/${cssFile}`;
        const asset = await assetResponse(new Request(url, c.req.raw), 'public, max-age=31536000, immutable');
        if (asset) {
            const headers = new Headers(asset.headers);
            headers.set('Content-Type', 'text/css; charset=utf-8');
            return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
        }
        return c.text('not_found', 404);
    });
    app.get('/static/icon.png', async (c) => {
        const url = new URL(c.req.url);
        url.pathname = '/icon.png';
        const asset = await assetResponse(new Request(url, c.req.raw), 'public, max-age=86400');
        if (asset) {
            const headers = new Headers(asset.headers);
            headers.set('Content-Type', 'image/png');
            return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
        }
        return c.text('not_found', 404);
    });
    // Branding assets uploaded from the console (POST /api/project/assets/upload/)
    // live in the settings KV — deliberately independent of any configured
    // storage provider (product parity: branding survives broken provider
    // credentials and works in both admin and SSR contexts). Served publicly and
    // immutably: filenames carry 8 hex of randomness, so an address never
    // changes bytes. The strict shape check IS the injection guard — the KV key
    // is derived from this path segment.
    app.get('/static/assets/:filename', async (c) => {
        const filename = c.req.param('filename');
        if (!/^(favicon|logo)-[0-9a-f]{8}\.(png|ico|svg|jpe?g)$/.test(filename)) return c.text('not_found', 404);
        let asset: StoredProjectAsset | null = null;
        for (const tenant of ['_root', '_default']) {
            asset = await readProjectAsset(new KeyValueStore(opts.runner, tenant), filename);
            if (asset) break;
        }
        if (!asset) return c.text('not_found', 404);
        const headers: Record<string, string> = {
            'Content-Type': asset.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
        };
        // SVG is the one uploadable format that can embed scripts — neutralize
        // them when the file is navigated to directly. <img>/favicon embedding
        // is unaffected by the SVG document's own CSP.
        if (asset.contentType === 'image/svg+xml') {
            headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
        }
        return new Response(asset.bytes, { status: 200, headers });
    });
    const consoleShell = async (c: any) => {
        if (await needsSetup()) return c.redirect('/setup', 302);
        const url = new URL(c.req.url);
        url.pathname = '/frontbase-admin/index.html';
        const asset = await assetResponse(new Request(url, c.req.raw), 'no-cache');
        return asset ?? c.html(CONSOLE_INDEX, 200, { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    };

    // 1. /frontbase-admin exact files + shell fallback. Worker-first routing
    // preserves API/eSSR ownership while the binding serves real assets.
    app.get('/frontbase-admin', consoleShell);
    app.get('/frontbase-admin/*', async (c) => {
        const path = new URL(c.req.url).pathname;
        if (path.includes('/assets/') || /\.[a-z0-9]+$/i.test(path)) {
            const cache = path.includes('/assets/')
                ? 'public, max-age=31536000, immutable'
                : 'public, max-age=3600';
            const asset = await assetResponse(c.req.raw, cache);
            if (asset) return asset;
        }
        return consoleShell(c);
    });

    // 2. /console → 301 redirect to /frontbase-admin (continuity).
    app.get('/console', (c) => c.redirect('/frontbase-admin', 301));

    // WordPress-style first-run setup surface. It is setup-only: after the first
    // admin exists the server leaves /setup before any retired SPA hash can load.
    app.get('/setup', async (c) => {
        if (!await needsSetup()) return c.redirect('/frontbase-admin/dashboard', 302);
        return c.html(SETUP_SPA_HTML, 200, { 'Cache-Control': 'no-store' });
    });
    app.get('/frontbase-setup/spa.js', async (c) =>
        (await assetResponse(c.req.raw, 'no-cache')) ?? c.text('not_found', 404));

    // Mount the builder sub-app at '/builder'. BuilderEngine's routes are RELATIVE
    // ('/edit/:pageId', '/api/components', …); the '/builder' mount prefix supplies
    // the namespace → '/builder/edit/:pageId' etc. Auth is enforced by the gate
    // mounted on builderApp itself (above), NOT a parent app.use — a parent
    // '/builder/*' gate does not cascade onto merged sub-app routes in this Hono
    // version, and routes that carried the '/builder' prefix doubled the path to
    // '/builder/builder/...' → 404. Mounted before compat/engine so /builder/*
    // matches the builder first.
    app.route('/builder', builderApp);

    // 3. Engine (published pages, /sw.js, retained console health/setup, and
    //    explicit 410 responses for every other /api/console/* path).
    //    Mounted BEFORE compat so the engine's specific routes (/, /sw.js,
    //    /api/console/*) take precedence. The engine's page catch-all /* also
    //    catches unknown paths — compat routes under /api/* that the engine
    //    doesn't own will fall through to compat because Hono tries the next
    //    mounted app when the engine's catch-all returns a 404 or unmatched.
    //    NO — actually Hono doesn't cascade between app.route() mounts.
    //    The correct approach: mount compat FIRST (its routes are all specific
    //    paths — no catch-all that would shadow the engine), then engine.
    //    Compat's defaultDenyAuth catches unknown /api/* paths with 401, but
    //    /, /sw.js, and /frontbase-admin/* are NOT /api/* paths — compat's
    //    own routes don't register for them, so Hono falls through to engine.

    // 4. Compat /api/* surface.
    // The product contract also defines a JSON API status at GET /. Preserve the
    // eSSR homepage for normal browser navigation and serve the API form only to
    // clients that explicitly request JSON.
    app.get('/', async (c, next) => {
        const accepts = c.req.header('accept') ?? '';
        if (accepts.toLowerCase().includes('application/json')) {
            return c.json({ message: 'Frontbase API is operational', test_mode: false });
        }
        return next();
    });
    app.route('/', compatApp);

    // 5. Engine.
    app.route('/', engine);

    return app;
}

let enginePromise: Promise<Hono> | null = null;
let currentCtx: ExecutionContext | null = null;

export default {
    async fetch(req: Request, env: CmsEnv, ctx: ExecutionContext): Promise<Response> {
        try {
            if (!env.SESSION_SECRET) {
                return new Response('SESSION_SECRET is not configured — run: wrangler secret put SESSION_SECRET', { status: 500 });
            }
            if (!env.DB) {
                return new Response('D1 binding "DB" is not configured — check wrangler.toml [[d1_databases]] binding="DB" and a REAL database_id (not the placeholder)', { status: 500 });
            }
            currentCtx = ctx;
            if (!enginePromise) {
                enginePromise = createCmsEngine({
                    runner: d1RunnerFromBinding(env.DB),
                    sessionSecret: env.SESSION_SECRET,
                    setupToken: env.SETUP_TOKEN,
                    setupExpiresAt: env.SETUP_EXPIRES_AT,
                    admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, role: env.ADMIN_ROLE },
                    assets: env.ASSETS,
                    // Host-side env parse (Workers have no process.env). Memoized
                    // on the raw strings — only actual secret changes recompute.
                    envServices: parseEnvServices(env as unknown as Record<string, string | undefined>),
                    dispatcher: (work) => { if (currentCtx) currentCtx.waitUntil(work()); else void work(); },
                    storageProvider: env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
                        ? s3StorageProvider({
                            accessKeyId: env.STORAGE_ACCESS_KEY_ID,
                            secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
                            endpoint: env.STORAGE_ENDPOINT,
                            region: env.STORAGE_REGION,
                        })
                        : undefined,
                }).catch((e) => { enginePromise = null; throw e; });
            }
            const engine = await enginePromise;
            return engine.fetch(req, env, ctx);
        } catch (e) {
            console.error('[cf-full] worker fetch failed:', (e as Error)?.stack ?? e);
            return new Response('internal_error', { status: 500 });
        }
    },
};
