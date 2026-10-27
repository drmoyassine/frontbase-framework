/**
 * Cache-duration tiers for React Query.
 *
 * Use these named constants instead of ad-hoc `staleTime` literals so caching
 * behaviour stays consistent across the app.
 *
 * The root QueryClient (src/App.tsx) already sets the globals —
 * `gcTime: 24h`, `refetchOnWindowFocus: false`, `retry: 1` — so do NOT
 * re-declare those per-query (it's noise; the global wins anyway). Set only
 * `staleTime` here, plus any *intentional* divergence (e.g. `retry: 0`/`false`
 * for cheap queries, or `refetchInterval` for live polling).
 */
export const STALE = {
    /** Live table data / RPC results — needs to feel real-time. */
    REALTIME: 5_000,
    /** Lists, drafts, team/plan data — fresh-ish without hammering. */
    DEFAULT: 30_000,
    /** Settings, edge infra, themes, storage — changes rarely. */
    STANDARD: 5 * 60_000,
    /** Schema / metadata — changes almost never. */
    SCHEMA: 60 * 60_000,
    /** Immutable registries, historical execution detail. */
    IMMUTABLE: Infinity,
} as const;
