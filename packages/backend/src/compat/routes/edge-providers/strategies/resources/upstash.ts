/**
 * Upstash resource strategy — STUB (foundation placeholder).
 * Implementation agent overwrites with discover (redis/qstash/vector/search)
 * + createResource (redis), ported from the product reference.
 */
import type { ProviderResourceStrategy } from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

export function createUpstashResourceStrategy(_externalFetch: CompatFetch): ProviderResourceStrategy {
    return { provider: 'upstash' };
}
