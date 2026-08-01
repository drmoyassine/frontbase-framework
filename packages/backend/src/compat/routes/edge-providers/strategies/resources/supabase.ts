/**
 * Supabase resource strategy — STUB (foundation placeholder).
 * Implementation agent overwrites with discover (projects + pooler db_url)
 * + listEngines (project functions), ported from the product reference.
 */
import type { ProviderResourceStrategy } from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

export function createSupabaseResourceStrategy(_externalFetch: CompatFetch): ProviderResourceStrategy {
    return { provider: 'supabase' };
}
