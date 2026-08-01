/**
 * Deno resource strategy — STUB (foundation placeholder).
 * Implementation agent overwrites with discover (apps) + listEngines
 * (apps with Link-header pagination), ported from the product reference.
 */
import type { ProviderResourceStrategy } from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

export function createDenoResourceStrategy(_externalFetch: CompatFetch): ProviderResourceStrategy {
    return { provider: 'deno' };
}
