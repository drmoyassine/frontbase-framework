/**
 * Vercel resource strategy — STUB (foundation placeholder).
 * Implementation agent overwrites with discover (projects + edge-config +
 * blob) + listEngines (projects), ported from the product reference.
 */
import type { ProviderResourceStrategy } from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

export function createVercelResourceStrategy(_externalFetch: CompatFetch): ProviderResourceStrategy {
    return { provider: 'vercel' };
}
