/**
 * SupabaseProvisioner (Phase 3 follow-ups / P3-a, F5c).
 *
 * ⚠️ PROVISIONING IS A TOKEN-VALIDATING STUB BY DESIGN. Supabase's Management API
 * has no cheap, fast, reversible operation that cleanly maps to "provision an edge
 * resource" the way CF's D1/KV/Queues do:
 *   - Creating a project is heavy (minutes) and not cheaply reversible.
 *   - Creating a database branch needs an existing project + is GA-gated.
 *   - There is no Supabase equivalent of a "throwaway KV namespace."
 *
 * So this provisioner implements the `Provisioner` contract but `create()` always
 * returns `{ provisioned: false }` after VALIDATING the access token (a read-only
 * GET /v1/projects). That gives the console a real "are these credentials good?"
 * check today, and a clean extension point when the senior picks the operation to
 * map to each kind. `validateToken()` is exposed for that future wiring + for the
 * credential-gated test.
 *
 * RULE 1: server-only — the access token never enters a browser bundle.
 * RULE 4: errors surface opaquely.
 *
 * 🚩 OPEN QUESTION (escalate before implementing create()): for each kind, what
 * Supabase Management operation should "provision" map to? e.g. database → create
 * a branch under an existing project? vector → create a pgvector-backed schema?
 * This file is the seam; the operation choice is a product decision.
 */
import type { Provisioner, ProvisionResult } from './cloudflare.js';

export interface SupabaseProvisionerOpts {
    /** Supabase Personal Access Token (Management API Bearer). */
    accessToken: string;
    /** Optional project ref to scope operations against. */
    projectRef?: string;
}

const SUPABASE_API = 'https://api.supabase.com/v1';

export function supabaseProvisioner(opts: SupabaseProvisionerOpts): Provisioner & {
    /** Validate the access token (read-only GET /v1/projects). Returns true on 200. */
    validateToken(): Promise<boolean>;
} {
    const headers = { authorization: `Bearer ${opts.accessToken}`, 'content-type': 'application/json' };

    return {
        // No cheap reversible provision op exists today (see file header). Stub —
        // create/remove are pure no-ops; token validation is EXPLICIT (validateToken),
        // not implicit on every create, so a stub doesn't fire a network call per use.
        handles: () => false,
        async create(): Promise<ProvisionResult> { return { provisioned: false }; },
        async remove(): Promise<void> { /* no-op: nothing was provisioned */ },

        async validateToken(): Promise<boolean> {
            const resp = await fetch(`${SUPABASE_API}/projects`, { method: 'GET', headers });
            return resp.ok;
        },
    };
}
