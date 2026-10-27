/**
 * A-25 Phase 4 — the cloud serving-plane middleware (cf-full worker).
 *
 * Registered FIRST (right after the configureEngine re-assert), it maps every
 * request to one of five host kinds (see @frontbase/backend tenancy/host) and
 * confines the worker to what that kind may serve:
 *
 *   foreign   — not our zone (localhost dev, *.workers.dev canonical origin,
 *               other domains): NO tenancy. Behaves exactly like self-host so
 *               the canonical workers.dev origin keeps working in cloud mode.
 *   apex      — the bare base domain: 302 → app-host /admin (Phase 5: marketing).
 *   reserved  — a reserved label under the zone (api./www./…): 404, never a site.
 *   app       — the console host: `/` 302s to /admin; everything else passes.
 *   tenant    — `<slug>.<zone>`: admin surfaces + the compat /api surface are
 *               CONFINED (404); a small public allowlist passes; then the
 *               REGISTERED-TENANT gate (15s positive-only cache — negatives are
 *               never cached so a signup goes live immediately) — miss or
 *               non-active → the workspace-not-found 404 page.
 *
 * SECURITY FIX vs the product: the product SERVES any parseable subdomain.
 * Here only registered + active tenants render, and a tenant host never sees
 * the admin/console surfaces at all.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { extractTenantSlug, type HostKind } from '@frontbase/backend';

export type { HostKind };

export interface TenancyOptions {
    baseDomain: string;
    /** Console host label. Default 'app' (app.frontbase.dev). */
    appLabel?: string;
    /** Registered + active check for a slug (tenantHostState + cache, worker-side). */
    tenantState: (slug: string) => Promise<{ found: boolean; status?: string }>;
}

/** Paths a TENANT host may serve besides its pages. Everything else under
 *  /api/* is confined to the app host. Login/logout/me/forgot/reset feed the
 *  private-page overlay and session restore on published sites; signup/slug
 *  checks/invites are APP-HOST-ONLY surfaces. */
const TENANT_API_ALLOWLIST = new Set([
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/me',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
]);

/** Admin surfaces that must never render on a tenant host — including /admin
 *  itself (A-25): the cloud console's login form on someone else's domain is a
 *  phishing surface, so a tenant page at /admin is unreachable by design (same
 *  class as /console). */
const ADMIN_SURFACE_RE = /^\/(?:frontbase-admin|admin|console|setup|frontbase-setup|builder)(?:\/|$)/;

export function workspaceNotFoundPage(slug: string, baseDomain: string): Response {
    const safe = slug.replace(/[^a-z0-9-]/g, '');
    return new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Workspace not found</title>` +
        `<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0d10;color:#e7ebf0;` +
        `display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}` +
        `.card{max-width:32rem;padding:2rem 2.5rem;text-align:center}` +
        `h1{font-size:1.4rem;margin:0 0 .75rem}p{color:#9aa4b2;margin:0 0 1.5rem;line-height:1.5}` +
        `a{color:#7fb4ff;text-decoration:none;border:1px solid #2c3644;border-radius:8px;padding:.6rem 1.1rem;display:inline-block}` +
        `</style></head><body><div class="card"><h1>Workspace not found</h1>` +
        `<p>No site lives at <strong>${safe}</strong> — the address is available.` +
        ` Claim it on <a href="https://app.${baseDomain}/admin#/signup">the Free plan</a>.</p>` +
        `</div></body></html>`,
        { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    );
}

/**
 * The host→tenant label for a request, ONLY when it is a tenant host. This is
 * the single tenancy fact every request-scoped resolver below the middleware
 * consumes (page resolution, enrichment, favicon, principal scoping).
 */
export function hostTenantOf(req: Request, baseDomain: string, appLabel = 'app'): string | undefined {
    const resolved = extractTenantSlug(req.headers.get('host'), baseDomain, appLabel);
    return resolved.kind === 'tenant' ? resolved.slug : undefined;
}

/** The full host kind for a request (tenant|app|reserved|apex|foreign). */
export function hostKindOf(req: Request, baseDomain: string, appLabel = 'app'): HostKind {
    return extractTenantSlug(req.headers.get('host'), baseDomain, appLabel).kind;
}

/** Positive-only 15s in-isolate cache. A negative lookup is NEVER cached — a
 *  tenant created milliseconds after a 404 must serve on the next request. */
export function cachedTenantState(
    state: (slug: string) => Promise<{ found: boolean; status?: string }>,
    ttlMs = 15_000,
): (slug: string) => Promise<{ found: boolean; status?: string }> {
    const cache = new Map<string, { state: { found: boolean; status?: string }; expires: number }>();
    return async (slug: string) => {
        const hit = cache.get(slug);
        const t = Date.now();
        if (hit && hit.expires > t) return hit.state;
        const fresh = await state(slug);
        if (fresh.found) cache.set(slug, { state: fresh, expires: t + ttlMs });
        else cache.delete(slug);
        return fresh;
    };
}

export function tenantMiddleware(o: TenancyOptions): MiddlewareHandler {
    const appLabel = o.appLabel ?? 'app';
    const tenantState = cachedTenantState(o.tenantState);
    return async (c: Context, next: () => Promise<void>) => {
        const resolved = extractTenantSlug(c.req.header('host'), o.baseDomain, appLabel);
        const path = new URL(c.req.url).pathname;
        switch (resolved.kind) {
            case 'foreign':
                return next(); // canonical origin / dev hosts: self-host behavior
            case 'apex':
                return c.redirect(`https://${appLabel}.${o.baseDomain}/admin`, 302);
            case 'reserved':
                return workspaceNotFoundPage(resolved.slug ?? '', o.baseDomain);
            case 'app': {
                if (path === '/' && !(c.req.header('accept') ?? '').toLowerCase().includes('application/json')) {
                    return c.redirect('/admin', 302);
                }
                return next();
            }
            case 'tenant': {
                const slug = resolved.slug as string;
                // 1. Admin surfaces never render on a tenant host.
                if (ADMIN_SURFACE_RE.test(path)) return workspaceNotFoundPage(slug, o.baseDomain);
                // 2. /api/* is confined to the app host (public overlay feeds excepted).
                if (path.startsWith('/api/') && !TENANT_API_ALLOWLIST.has(path)) {
                    return workspaceNotFoundPage(slug, o.baseDomain);
                }
                // 3. Shared public assets pass without the tenant gate.
                if (path.startsWith('/static/') || path === '/sw.js' || path === '/health' || path === '/favicon.ico') {
                    return next();
                }
                // 4. REGISTERED-TENANT gate (the product-served-anything fix).
                const state = await tenantState(slug);
                if (!state.found || state.status !== 'active') return workspaceNotFoundPage(slug, o.baseDomain);
                return next();
            }
        }
    };
}
