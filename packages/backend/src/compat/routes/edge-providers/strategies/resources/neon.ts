/**
 * Neon resource strategy — STUB (foundation placeholder).
 * Implementation agent overwrites with discover (orgs + projects +
 * connection_uri), ported from the product reference.
 */
import type { ProviderResourceStrategy } from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

export function createNeonResourceStrategy(_externalFetch: CompatFetch): ProviderResourceStrategy {
    return { provider: 'neon' };
}
