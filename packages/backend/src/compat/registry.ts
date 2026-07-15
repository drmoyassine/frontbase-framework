/**
 * CF-22 P1 — the IMPLEMENTED registry: which vendored community ops have real
 * framework handlers (vs. 501 stubs). Drives `x-implemented` in the emitted spec
 * and the burn-down count in the drift gate.
 *
 * P1 ships exactly one fully-implemented tag — `variables` (6 ops) — as the
 * end-to-end proof. P2 grows this set tag-by-tag until it equals productOps().
 */
import { opKey } from './spec.js';

/** Op keys implemented by real handlers in P1 (the `variables` proof tag). */
export const IMPLEMENTED: Set<string> = new Set([
    opKey('GET', '/api/variables/'),
    opKey('POST', '/api/variables/'),
    opKey('GET', '/api/variables/registry/'),
    opKey('GET', '/api/variables/{variable_id}'),
    opKey('PUT', '/api/variables/{variable_id}/'),
    opKey('DELETE', '/api/variables/{variable_id}/'),
]);
