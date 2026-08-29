/**
 * Cloud tenancy — serving-plane queries (A-25, Phase 4).
 *
 * Ports the cf-full worker's cross-tenant page SELECT (worker.ts resolvePublishedPage)
 * into a tenant-scoped pure module so the cloud worker and RULE 8's mutation
 * harness both share one implementation. The self-host path keeps today's
 * cross-tenant behavior via `opts.crossTenantFallback`.
 *
 * Product reference: services/edge/src/middleware/tenant.ts (registered-tenant
 * gating) — with our DELIBERATE fix: the product serves unknown subdomains;
 * `tenantHostState` + the worker's middleware 404 them instead.
 */
import type { DbRunner } from '@frontbase/edge-infra';

export interface PublishedPageRow {
    title: string;
    slug: string;
    description?: string;
    layout: unknown;
    isPublic?: boolean;
    primaryAuthForm?: Record<string, unknown>;
}

export interface ResolvePublishedPageOptions {
    /**
     * SELF-HOST ONLY: when the host tenant has no matching page, fall back to
     * reading across tenants (today's community single-tenant behavior, LIMIT 1).
     * NEVER true in cloud mode — a tenant host must only ever serve that
     * tenant's own rows.
     */
    crossTenantFallback?: boolean;
}

interface RawPageRow {
    name: unknown;
    slug: unknown;
    description: unknown;
    layout_data: unknown;
    is_public: unknown;
    primary_auth_form: unknown;
}

function mapRow(row: RawPageRow): PublishedPageRow {
    let layout: unknown;
    try { layout = JSON.parse(String(row.layout_data)); } catch { layout = { content: [], root: {} }; }
    const isPublic = row.is_public == null ? undefined : Number(row.is_public) !== 0;
    let primaryAuthForm: Record<string, unknown> | undefined;
    if (row.primary_auth_form != null && String(row.primary_auth_form) !== '') {
        try {
            const parsed = JSON.parse(String(row.primary_auth_form));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                primaryAuthForm = parsed as Record<string, unknown>;
            }
        } catch { /* malformed JSON → overlay defaults */ }
    }
    return {
        title: String(row.name ?? row.slug ?? 'Page'),
        slug: String(row.slug ?? ''),
        description: row.description ? String(row.description) : undefined,
        layout,
        ...(isPublic !== undefined ? { isPublic } : {}),
        ...(primaryAuthForm ? { primaryAuthForm } : {}),
    };
}

const PAGE_COLUMNS = 'name, slug, description, layout_data, is_public, primary_auth_form';

/**
 * Resolve a published page for ONE tenant. `path === '/'` → that tenant's
 * homepage (is_homepage=1); otherwise by slug. Cloud mode passes NO fallback —
 * the `tenant_slug` predicate is the isolation boundary (mutation-proven).
 */
export async function resolvePublishedPageForTenant(
    runner: DbRunner,
    tenant: string,
    path: string,
    opts: ResolvePublishedPageOptions = {},
): Promise<PublishedPageRow | null> {
    const rows = path === '/'
        ? await runner.query(
            `SELECT ${PAGE_COLUMNS} FROM compat_pages WHERE tenant_slug = ? AND is_homepage = 1 AND is_published = 1 AND deleted_at IS NULL LIMIT 1`,
            [tenant],
        )
        : await runner.query(
            `SELECT ${PAGE_COLUMNS} FROM compat_pages WHERE tenant_slug = ? AND slug = ? AND is_published = 1 AND deleted_at IS NULL LIMIT 1`,
            [tenant, decodeURIComponent(path).replace(/^\/+|\/+$/g, '')],
        );
    if (rows[0]) return mapRow(rows[0] as unknown as RawPageRow);
    if (opts.crossTenantFallback) {
        // Self-host compatibility: community single-tenant reads across tenants
        // (today's worker behavior for BOTH the homepage and slug paths).
        const fallback = path === '/'
            ? await runner.query(
                `SELECT ${PAGE_COLUMNS} FROM compat_pages WHERE is_homepage = 1 AND is_published = 1 AND deleted_at IS NULL LIMIT 1`,
            )
            : await runner.query(
                `SELECT ${PAGE_COLUMNS} FROM compat_pages WHERE slug = ? AND is_published = 1 AND deleted_at IS NULL LIMIT 1`,
                [decodeURIComponent(path).replace(/^\/+|\/+$/g, '')],
            );
        if (fallback[0]) return mapRow(fallback[0] as unknown as RawPageRow);
    }
    return null;
}

export interface TenantHostState {
    /** A tenants row with this slug exists. */
    found: boolean;
    /** The row's status column ('active' for serving); undefined when absent. */
    status?: string;
    name?: string;
}

/**
 * The serving-plane gate for a host slug: is this a REGISTERED tenant, and is
 * it active? Negatives (found=false) MUST NOT be cached by callers — a signup
 * can create the tenant milliseconds after a 404.
 */
export async function tenantHostState(runner: DbRunner, slug: string): Promise<TenantHostState> {
    const rows = await runner.query('SELECT slug, name, status FROM tenants WHERE slug = ? LIMIT 1', [slug]);
    const row = rows[0];
    if (!row) return { found: false };
    return {
        found: true,
        status: row.status == null ? undefined : String(row.status),
        name: row.name == null ? undefined : String(row.name),
    };
}

/**
 * Scope a resolved principal to the host's tenant (correction 2 — the private-
 * page cross-tenant hole): a principal whose tenant differs from the host
 * tenant is stripped of its user identity. Login is a cross-tenant email scan,
 * so a member of tenant A authenticates fine on tenant B's host — without this
 * wrapper their cookie would satisfy tenant B's private-page gate
 * (edge-core gates on `principal.user` truthiness) and thread their tenant
 * into data queries.
 */
export function scopePrincipalToHost<T extends { user: unknown; tenant?: string }>(
    principal: T,
    hostTenant: string | undefined,
): T {
    if (!hostTenant) return principal; // self-host / foreign host: unchanged
    if (principal.tenant === hostTenant) return principal;
    return { ...principal, user: null, tenant: undefined } as T;
}
