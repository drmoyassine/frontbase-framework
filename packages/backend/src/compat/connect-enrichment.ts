/**
 * Connect-time enrichment — the framework port of the product's per-provider
 * connect handlers (edge_providers.py:292-368, deno.py, etc.).
 *
 * Called from the POST/PUT /api/edge-providers/ handlers after the base config is
 * built: fetches the *extra* credentials the product stores beyond the bare token
 * (Supabase api-keys + jwt_secret, Cloudflare account_id, …) and returns the
 * merged config to encrypt + persist. Best-effort: enrichers swallow fetch
 * failures and return the input unchanged, so connect still succeeds with the
 * bare token when enrichment is unavailable.
 */
import { ENRICHERS } from './providers/index.js';
import type { CompatFetch } from './external-http.js';

/** Enrich a provider config at connect time. Returns merged config to persist. */
export async function enrichProviderConfig(
    provider: string,
    config: Record<string, unknown>,
    externalFetch: CompatFetch,
): Promise<Record<string, unknown>> {
    const enrich = ENRICHERS[provider];
    return enrich ? enrich(config, externalFetch) : config;
}
