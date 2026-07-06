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
}

const defaults: EngineConfig = {
    edition: 'community',
    nodeEnv: 'development',
    resolveFaviconUrl: async () => '',
    resolveUser: async () => null,
};

let current: EngineConfig = { ...defaults };

/** Merge host-provided config over the defaults. Call once at host boot. */
export function configureEngine(overrides: Partial<EngineConfig>): void {
    current = { ...defaults, ...overrides };
}

export function engineConfig(): EngineConfig {
    return current;
}
