/**
 * Provider credential module contracts.
 *
 * Two pure-ish seams that close the product↔framework credential parity gap:
 *
 * 1. DatasourceResolver — turns a stored account/datasource config (which may
 *    carry provider-native fields like Supabase `service_role_key` + `api_url`,
 *    Neon `connection_uri`, Turso `db_url`+`token`) into the *runner-shaped*
 *    config that `datasourceRunner(kind, …)` expects (`url`+`serviceKey`,
 *    `connectionString`, etc.). PURE — no I/O. Applied centrally inside
 *    datasourceRunner so call sites need no per-provider branching.
 *
 * 2. ProviderEnricher — at connect time, fetches the *extra* credentials the
 *    product stores beyond the bare token (Supabase api-keys + jwt_secret,
 *    Cloudflare account_id, Deno org_slug/user_id, …) and returns the merged
 *    config to persist. Async; uses guardedExternalFetch.
 *
 * Each provider lives in its own file (`./<provider>.ts`) exporting
 * `resolve<Provider>` + `enrich<Provider>`. The registry (`./index.ts`) wires
 * them; provider agents edit ONLY their own file.
 */
import type { CompatFetch } from '../external-http.js';

/** Convert a stored config into the runner-specific config shape. PURE. */
export type DatasourceResolver = (config: Record<string, unknown>) => Record<string, unknown>;

/**
 * Fetch extra credentials at connect time. Returns the MERGED config to persist
 * (caller's original fields + any enriched fields). Must be defensive: a failed
 * enrichment call returns the input unchanged (best-effort, like the product).
 */
export type ProviderEnricher = (
    config: Record<string, unknown>,
    externalFetch: CompatFetch,
) => Promise<Record<string, unknown>>;

/** Identity resolver — default when a provider has no transform. */
export const passthroughResolver: DatasourceResolver = (config) => config;

/** Identity enricher — default when a provider does no connect-time fetches. */
export const passthroughEnricher: ProviderEnricher = async (config) => config;
