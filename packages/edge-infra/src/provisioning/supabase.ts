/**
 * SupabaseProvisioner (F5c Option A — schema-per-resource).
 *
 * Model: the operator configures ONE host Supabase project (url + serviceKey).
 * Each edge resource maps to a dedicated Postgres schema in that project:
 *   - kind 'database' → CREATE SCHEMA frontbase_<slug>
 *   - kind 'vector'   → CREATE SCHEMA frontbase_<slug> + pgvector extension +
 *                       a 768-dim vectors table (matches the CF Vectorize default
 *                       from P2-c — consistent embedding dimensions cross-provider)
 * "De-provision" = DROP SCHEMA CASCADE.
 *
 * No Management API / PAT — pure SQL over the service key, reusing `supabaseRunner`
 * (its exec() runs arbitrary SQL through the `execute_sql` RPC). RULE 1: the service
 * key is server-only; RULE 4: DDL errors surface opaquely (the route maps to
 * `provisioning_failed`).
 *
 * ⚠️ Prerequisite: the host project must have the `execute_sql` Postgres function
 * installed (see docs/guides/supabase-setup.md). Provisioning inherits it. A direct
 * PostgREST DDL path would be a follow-up; `execute_sql` is the consistent seam.
 *
 * ⚠️ Noisy-neighbor caveat: all provisioned schemas share the host project's quota
 * (DB size, connections). Fine for multi-tenant SaaS on one project; for hard
 * isolation, use separate Supabase projects (out of scope here).
 */
import { supabaseRunner } from '../providers/runners.js';
import type { DbRunner } from '../providers/types.js';
import type { Provisioner, ProvisionResult } from './cloudflare.js';

export interface SupabaseProvisionerOpts {
    /** Host Supabase project URL: https://<ref>.supabase.co */
    url: string;
    /** Service role key for the host project (runs schema DDL). */
    serviceKey: string;
    /** Schema-name prefix (default 'frontbase_'). */
    schemaPrefix?: string;
}

/** Lowercase + replace non-alphanumerics with `_`, trim leading/trailing `_`.
 *  Returns '' for a degenerate name (no alphanumerics) — the caller rejects it. */
function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function supabaseProvisioner(opts: SupabaseProvisionerOpts): Provisioner & {
    /** Runs `SELECT 1` over the runner — a "are these creds good?" check. */
    validateConnection(): Promise<boolean>;
} {
    const prefix = opts.schemaPrefix ?? 'frontbase_';
    // Lazy runner — built once at factory scope, reused across create/remove.
    let runner: DbRunner | null = null;
    const getRunner = (): DbRunner => {
        if (!runner) runner = supabaseRunner({ url: opts.url, serviceKey: opts.serviceKey });
        return runner;
    };
    const schemaName = (name: string): string => {
        const slug = slugify(name);
        if (!slug) throw new Error('invalid_resource_name'); // empty/degenerate — footgun guard
        return `${prefix}${slug}`;
    };

    return {
        handles(kind: string) {
            return kind === 'database' || kind === 'vector';
        },

        async create(kind: string, name: string): Promise<ProvisionResult> {
            const schema = schemaName(name); // throws on degenerate name
            const r = getRunner();
            // CREATE SCHEMA (both kinds). Identifier quoted to be safe.
            await r.exec(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
            if (kind === 'vector') {
                // pgvector extension + a 768-dim vectors table inside the schema.
                await r.exec(`CREATE EXTENSION IF NOT EXISTS vector`);
                await r.exec(
                    `CREATE TABLE IF NOT EXISTS "${schema}".vectors (id TEXT PRIMARY KEY, embedding vector(768), metadata JSONB)`,
                );
            }
            return { provisioned: true, remoteId: schema, info: { provider: 'supabase', kind } };
        },

        async remove(_kind: string, remoteId: string): Promise<void> {
            // remoteId IS the schema name (from create). CASCADE drops everything in it.
            await getRunner().exec(`DROP SCHEMA IF EXISTS "${remoteId}" CASCADE`);
        },

        async validateConnection(): Promise<boolean> {
            try { await getRunner().query('SELECT 1 AS one'); return true; }
            catch { return false; }
        },
    };
}
