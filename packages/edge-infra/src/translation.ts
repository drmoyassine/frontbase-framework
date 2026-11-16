/** Server-only HTTPS bridge using Frontbase's existing Supabase/PostgREST client setup. */
import { PostgrestTranslationJobPersistence } from '@frontbase/translation/adapters/postgrest';
import { PostgrestTranslationAccountingPersistence } from '@frontbase/translation/adapters/postgrest-accounting';
import { supabasePostgrestClient, type SupabaseOpts } from './providers/supabase-http.js';

/** Host supplies an authorized server credential/scope and guarded fetch. Fixed translations schema.
 * No raw SQL endpoint, pg/TCP client, Hyperdrive dependency or socket fallback.
 */
export function translationPersistenceFromSupabase(options: Omit<SupabaseOpts, 'schema'>): PostgrestTranslationJobPersistence {
    return new PostgrestTranslationJobPersistence(translationTransports(options).jobs);
}
/** Requires explicit accounting negotiation on initialize; never installs or upgrades SQL. */
export function translationAccountingFromSupabase(options: Omit<SupabaseOpts, 'schema'>): PostgrestTranslationAccountingPersistence {
    const transport = translationTransports(options);
    return new PostgrestTranslationAccountingPersistence(transport.jobs, transport.accounting);
}
function translationTransports(options: Omit<SupabaseOpts, 'schema'>) {
    const endpoint = new URL(options.restUrl ?? options.url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
        throw Error('translation_https_required');
    }
    const client = supabasePostgrestClient({ ...options, schema: 'translations' });
    const call = async (rpc: 'translation_request' | 'translation_read_batch' | 'translation_accounting_request', operation: string, scope: { tenantId: string; projectId: string }, input: Record<string, unknown>) => {
        const { data, error } = await client.rpc(rpc, { p_operation: operation, p_scope: scope, p_input: input });
        if (error) throw Error('translation_rpc_failed');
        return data;
    };
    return {
        jobs: {
            readCurrent: async (scope: {tenantId:string;projectId:string}, input: {unitIds:string[];locale:string}) => {
                const {data, error} = await client.rpc('translation_read_batch', {p_operation:'read-current-many', p_scope:scope, p_input:input});
                // Only the legacy function's explicit unsupported-operation reply permits fallback.
                if (error?.code === '22023' && error.message === 'invalid_translation_operation') return undefined;
                if (error) throw Error('translation_rpc_failed');
                return data;
            },
            resolveByResources: async (scope: {tenantId:string;projectId:string}, input: {resources:unknown[]}) => {
                const {data, error} = await client.rpc('translation_read_batch', {p_operation:'read-unit-ids-by-resource', p_scope:scope, p_input:input});
                // Legacy SQL and out-of-domain refusals share the same unsupported-operation
                // reply; both permit the adapter to fall back to client-side identity.
                if (error?.code === '22023' && error.message === 'invalid_translation_operation') return undefined;
                if (error) throw Error('translation_rpc_failed');
                return data;
            },
            call: (operation: string, scope: { tenantId: string; projectId: string }, input: Record<string, unknown>) => call(operation==='read-many'||operation==='read-revisions'?'translation_read_batch':'translation_request', operation, scope, input) },
        accounting: { call: (operation: string, scope: { tenantId: string; projectId: string }, input: Record<string, unknown>) => call('translation_accounting_request', operation, scope, input) },
    };
}
