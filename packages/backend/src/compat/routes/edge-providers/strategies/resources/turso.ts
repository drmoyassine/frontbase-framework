/**
 * Turso resource strategy — STUB (foundation placeholder).
 * Implementation agent overwrites with discover (Path A: stored databases[]
 * JSON; Path B: live api.turso.tech) + createResource (turso_db).
 * NOTE R10: verify the connect handler stores databases[] in the expected
 * shape before relying on Path A.
 */
import type { ProviderResourceStrategy } from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

export function createTursoResourceStrategy(_externalFetch: CompatFetch): ProviderResourceStrategy {
    return { provider: 'turso' };
}
