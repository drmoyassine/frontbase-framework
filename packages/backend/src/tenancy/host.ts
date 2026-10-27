/**
 * Cloud tenancy — host → tenant resolution (A-25, Phase 4).
 *
 * Product reference: services/edge/src/middleware/tenant.ts (`extractTenantSlug`)
 * + fastapi-backend/app/auth/tenant_provisioning.py (`validate_slug`,
 * RESERVED_SLUGS). The product's edge worker resolves the tenant from the Host
 * header prefix ALONE — no control-plane lookup ("edge self-sufficiency") — and
 * the framework keeps that model: pure functions, injectable base domain, no
 * engine/config globals, so RULE 8 can mutate them.
 *
 * DELIBERATE DIVERGENCE from the product (security fix): the product serves ANY
 * `{slug}.base-domain` host whose prefix parses, even when no tenant row exists.
 * Here the host-parsing stays pure, but the WORKER (`tenantHostState` in
 * serving.ts) 404s slugs that are not registered+active tenants. Unregistered
 * subdomains are never served.
 */

/** Product regex: lowercase alphanumeric with interior hyphens (tenant_provisioning.py:173). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export const SLUG_MIN = 3;
export const SLUG_MAX = 50;

/** The product's 31 signup-reserved slugs (tenant_provisioning.py:165-171), verbatim. */
export const PRODUCT_RESERVED_SLUGS: ReadonlySet<string> = new Set([
    'app', 'api', 'www', 'admin', 'auth', 'login', 'signup',
    'dashboard', 'test', 'demo', 'staging', 'dev', 'mail',
    'smtp', 'ftp', 'ns1', 'ns2', 'cdn', 'static', 'assets',
    'docs', 'help', 'support', 'status', 'blog', 'community',
    'account', 'billing', 'payments', 'checkout', 'webhook',
]);

/**
 * Framework additions: the engine's internal tenant scopes (never registrable —
 * `_default`/`_root`/`_global` are infrastructure rows) and the apex brand label.
 */
export const FRAMEWORK_RESERVED_SLUGS: ReadonlySet<string> = new Set([
    '_default', '_root', '_global', 'frontbase',
]);

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
    ...PRODUCT_RESERVED_SLUGS,
    ...FRAMEWORK_RESERVED_SLUGS,
]);

export type HostKind = 'tenant' | 'app' | 'reserved' | 'apex' | 'foreign';

export interface HostResolution {
    kind: HostKind;
    /** The subdomain label for tenant/reserved kinds; undefined otherwise. */
    slug?: string;
    host: string;
}

/** Strip a trailing :port, lowercase, trim. Returns '' when the header is absent/empty. */
export function normalizeHost(raw: string | null | undefined): string {
    if (!raw) return '';
    let host = raw.trim().toLowerCase();
    if (host.startsWith('[')) {
        // Bracketed IPv6 ([::1]:8080): keep the bracketed literal, drop the port.
        const end = host.indexOf(']');
        if (end !== -1 && host[end + 1] === ':') host = host.slice(0, end + 1);
        return host;
    }
    // Unbracketed: the first colon is a port separator (host:port). A bare IPv6
    // literal (::1) also contains colons but can never equal a base domain, so
    // truncating it is harmless — it resolves `foreign` either way.
    const colon = host.indexOf(':');
    if (colon !== -1) host = host.slice(0, colon);
    return host;
}

/** True when `host` is the base domain itself. */
function isApex(host: string, baseDomain: string): boolean {
    return host === baseDomain;
}

/** True when `host` is exactly `<single-label>.<baseDomain>`. Returns the label. */
function singleLabelSubdomain(host: string, baseDomain: string): string | null {
    if (!host.endsWith('.' + baseDomain)) return null;
    const prefix = host.slice(0, host.length - baseDomain.length - 1);
    // Multi-label subdomains (a.b.frontbase.dev) are NOT tenant hosts — the
    // product treats them the same way (foreign/unknown), so a nested host can
    // never shadow a tenant slug.
    if (prefix.includes('.')) return null;
    if (prefix.length === 0) return null;
    return prefix;
}

/**
 * Resolve a Host header against the cloud base domain.
 *
 * - `app`      — the console/application host (`app.<base>`, configurable label)
 * - `tenant`   — `<registered-or-not>.<base>`, single label, not reserved
 * - `reserved` — a reserved label under the base (404 at the worker, never a site)
 * - `apex`     — the bare base domain (302 → app host `/admin` at the worker)
 * - `foreign`  — everything else: other domains, ports that defeat parsing,
 *                IPv6 literals, missing Host headers. Workers on foreign hosts
 *                behave exactly like self-host (no tenancy applied).
 */
export function extractTenantSlug(
    rawHost: string | null | undefined,
    baseDomain: string,
    appLabel = 'app',
): HostResolution {
    const host = normalizeHost(rawHost);
    if (!host) return { kind: 'foreign', host: '' };
    const base = baseDomain.trim().toLowerCase();
    if (!base) return { kind: 'foreign', host };
    if (isApex(host, base)) return { kind: 'apex', host };
    const label = singleLabelSubdomain(host, base);
    if (label == null) return { kind: 'foreign', host };
    if (label === appLabel) return { kind: 'app', slug: label, host };
    if (RESERVED_SLUGS.has(label)) return { kind: 'reserved', slug: label, host };
    return { kind: 'tenant', slug: label, host };
}

/**
 * Product validate_slug verbatim (tenant_provisioning.py:176-187): returns the
 * error message, or null when the slug is registrable.
 */
export function slugError(slug: string): string | null {
    const trimmed = slug.trim();
    if (trimmed.length < SLUG_MIN) return 'Slug must be at least 3 characters';
    if (trimmed.length > SLUG_MAX) return 'Slug must be at most 50 characters';
    // Grammar checks the RAW casing — 'Newco' must fail with the lowercase
    // message, not silently normalize to a pass (the signup route lowercases
    // its input BEFORE calling this, so 'NEWCO' still reaches a lowercase
    // verdict there; direct callers get the honest rejection).
    if (!SLUG_RE.test(trimmed)) {
        return 'Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen';
    }
    if (RESERVED_SLUGS.has(trimmed.toLowerCase())) return `'${trimmed.toLowerCase()}' is a reserved name`;
    return null;
}

/** Registrable slug check (valid = no error). */
export function slugValid(slug: string): boolean {
    return slugError(slug) === null;
}

/** Read the Host header off a fetch Request and resolve it. */
export function resolveTenantFromHost(
    req: { headers: { get(name: string): string | null } },
    baseDomain: string,
    appLabel = 'app',
): HostResolution {
    return extractTenantSlug(req.headers.get('host'), baseDomain, appLabel);
}
