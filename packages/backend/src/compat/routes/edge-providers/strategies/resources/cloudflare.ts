/**
 * Cloudflare resource strategy — STUB (foundation placeholder).
 * The per-provider implementation agent overwrites this with real
 * discover (d1/kv/r2/queue/vectorize) + createResource (d1/kv/queue)
 * + listEngines (Workers scripts), ported from the product reference.
 */
import type { ProviderResourceStrategy } from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

export function createCloudflareResourceStrategy(_externalFetch: CompatFetch): ProviderResourceStrategy {
    return { provider: 'cloudflare' };
}
