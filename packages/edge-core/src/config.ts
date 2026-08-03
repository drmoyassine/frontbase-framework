/**
 * Engine configuration — Phase 1 input #1 (PHASE0-DECISION-MEMO §Phase 1 inputs).
 *
 * The engine reads NOTHING from `process.env` and owns no storage/auth
 * implementations. Every host (Node edge, CF Worker, browser service worker,
 * builder canvas) injects what it has via `configureEngine()`.
 *
 * Defaults reproduce the golden-corpus generation environment exactly
 * (community edition, no license, empty favicon, no user) — the byte-parity
 * suite renders with these defaults.
 */
import type { UserContext } from './ssr/lib/IAuthProvider.js';

/**
 * The authenticated caller of a request, resolved by the host. `null` user =
 * anonymous. `tenant` scopes data access (multi-tenant isolation). Hosts wire
 * this to @frontbase/edge-infra auth gates; the default is anonymous/no-tenant.
 */
export interface Principal {
    user: UserContext | null;
    tenant?: string;
}

export interface EngineConfig {
    /** Edition gate for the community badge. Default: 'community'. */
    edition: string;
    /** License key; presence suppresses the community badge. */
    licenseKey?: string;
    /** Runtime label surfaced in the system template context. */
    nodeEnv: string;
    /** Favicon lookup (was the storage-layer coupling — the only render-path impurity). */
    resolveFaviconUrl: () => Promise<string>;
    /** Session→user resolution (was the auth-provider coupling). Hosts wire edge-infra here. */
    resolveUser: (request: Request, tenantSlug?: string) => Promise<UserContext | null>;
    /**
     * Resolve the calling principal (user + tenant) for a request. Used by the
     * Edge Data Proxy to enforce query `scope` and to tenant-scope executors.
     * Default: anonymous, no tenant. Hosts MUST override this to serve
     * `tenant`/`user`-scoped queries — otherwise those queries are denied.
     */
    resolvePrincipal: (request: Request) => Promise<Principal>;
}

const defaults: EngineConfig = {
    edition: 'community',
    nodeEnv: 'development',
    resolveFaviconUrl: async () => '',
    resolveUser: async () => null,
    resolvePrincipal: async () => ({ user: null, tenant: undefined }),
};

let current: EngineConfig = { ...defaults };

/** Merge host-provided config over the defaults. Call once at host boot.
 *  NOTE: each call RESETS to defaults then applies overrides — `configureEngine({})`
 *  is the documented "reset to anonymous/no-tenant" idiom (used by the test suites).
 *  Hosts that need to layer several overrides must therefore pass them in a single
 *  call rather than calling repeatedly (later calls would wipe earlier overrides). */
export function configureEngine(overrides: Partial<EngineConfig>): void {
    current = { ...defaults, ...overrides };
}

export function engineConfig(): EngineConfig {
    return current;
}
