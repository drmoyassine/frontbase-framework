/**
 * Netlify resource strategy — STUB (foundation placeholder).
 * Implementation agent overwrites with discover (sites — emit type:'netlify_site'
 * to satisfy the SPA storage filter, a principled divergence from the product
 * which omits `type`) + listEngines (sites), ported from the product reference.
 */
import type { ProviderResourceStrategy } from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

export function createNetlifyResourceStrategy(_externalFetch: CompatFetch): ProviderResourceStrategy {
    return { provider: 'netlify' };
}
