/** Server-only HTTPS bridge using Frontbase's existing Supabase/PostgREST client setup. */
import { PostgrestTranslationJobPersistence } from '@frontbase/translation/adapters/postgrest';
import { supabasePostgrestClient, type SupabaseOpts } from './providers/supabase-http.js';

/** Host supplies an authorized server credential/scope and guarded fetch. Fixed translations schema.
 * No raw SQL endpoint, pg/TCP client, Hyperdrive dependency or socket fallback.
 */
export function translationPersistenceFromSupabase(options: Omit<SupabaseOpts, 'schema'>): PostgrestTranslationJobPersistence {
    const endpoint = new URL(options.restUrl ?? options.url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
        throw Error('translation_https_required');
    }
    const client = supabasePostgrestClient({ ...options, schema: 'translations' });
    return new PostgrestTranslationJobPersistence({ async call(operation, scope, input) {
        const { data, error } = await client.rpc('translation_request', { p_operation: operation, p_scope: scope, p_input: input });
        if (error) throw Error('translation_rpc_failed');
        return data;
    } });
}
