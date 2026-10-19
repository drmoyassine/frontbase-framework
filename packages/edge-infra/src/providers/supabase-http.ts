/** Shared Supabase/PostgREST HTTPS client: no native database driver imports. */
import { PostgrestClient } from '@supabase/postgrest-js';
import type { ServiceFetch } from '../cache/types.js';

export interface SupabaseOpts {
    /** Supabase project URL: https://<ref>.supabase.co */
    url: string;
    /** Supabase API key (secret/publishable or legacy service_role/anon). Server-only. */
    serviceKey: string;
    /** Optional JWT bearer token for RLS (defaults to service key) */
    jwt?: string;
    /** Postgres schema to use (default: public) */
    schema?: string;
    /** Native PostgREST endpoint. Omit for the standard Supabase /rest/v1 endpoint. */
    restUrl?: string;
    /** Per-instance HTTP transport; native application-state callers are separate. */
    fetchImpl?: ServiceFetch;
}


export function supabasePostgrestHeaders(opts: SupabaseOpts): Record<string, string> {
    const headers: Record<string, string> = {
        apikey: opts.serviceKey,
    };
    // New opaque API keys authenticate only via apikey; a real user JWT still
    // belongs in Authorization so its RLS context is preserved.
    const bearer = opts.jwt ?? (opts.serviceKey.startsWith('sb_') ? undefined : opts.serviceKey);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (opts.schema) {
        headers['Accept-Profile'] = opts.schema;
        headers['Content-Profile'] = opts.schema;
    }

    return headers;
}

export function supabasePostgrestClient(opts: SupabaseOpts) {
    return new PostgrestClient(opts.restUrl ?? `${opts.url}/rest/v1`, {
        headers: supabasePostgrestHeaders(opts),
        schema: opts.schema ?? 'public',
        fetch: opts.fetchImpl,
    });
}
