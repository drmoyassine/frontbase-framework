/**
 * Datasource runner factory (Phase 3b / F7). Given a datasource record's kind +
 * decrypted config, build the right DbRunner so the Data Studio can introspect
 * tables and run queries against the external database.
 *
 * One place maps kind → runner (RULE 6: no hand-rolled drivers elsewhere). All
 * runners come from @frontbase/edge-infra (the DbRunner seam).
 */
import {
    sqliteRunner, d1RunnerFromRest, supabaseRunner, postgresRunner,
    type DbRunner,
} from '@frontbase/edge-infra';
import { resolveDatasourceConfig } from '../compat/credential-resolver.js';
import { guardedExternalFetch, type CompatFetch } from '../compat/external-http.js';

export type DatasourceKind = 'sqlite' | 'd1' | 'turso' | 'supabase' | 'postgres' | 'neon';

/** Build a DbRunner from a datasource's kind + config. Throws on unknown kind / missing fields.
 *  Applies the per-kind credential resolver first, so callers may pass a raw account config
 *  (e.g. Supabase `service_role_key` + `api_url`/`project_ref`) and it is mapped to the
 *  runner-shaped config (`url` + `serviceKey`) automatically. */
export function datasourceRunner(kind: string, config: Record<string, unknown>, externalFetch: CompatFetch = globalThis.fetch): DbRunner {
    const resolved = resolveDatasourceConfig(kind, config);
    const transport: CompatFetch = (input, init) => guardedExternalFetch(externalFetch, input, init);
    switch (kind as DatasourceKind) {
        case 'sqlite':
            return sqliteRunner(String(resolved.url ?? ':memory:'), resolved.authToken ? String(resolved.authToken) : undefined,
                /^(?:file:|:memory:$)/i.test(String(resolved.url ?? ':memory:')) ? undefined : transport);
        case 'turso':
            // Turso is libsql over the wire.
            return sqliteRunner(String(resolved.url ?? ''), resolved.authToken ? String(resolved.authToken) : undefined, transport);
        case 'd1':
            return d1RunnerFromRest({
                accountId: String(resolved.accountId ?? ''),
                databaseId: String(resolved.databaseId ?? ''),
                apiToken: String(resolved.apiToken ?? ''),
                fetchImpl: transport,
            });
        case 'supabase':
            return supabaseRunner({
                url: String(resolved.url ?? ''),
                serviceKey: String(resolved.serviceKey ?? ''),
                jwt: resolved.jwt ? String(resolved.jwt) : undefined,
                schema: resolved.schema ? String(resolved.schema) : undefined,
                fetchImpl: transport,
            });
        case 'postgres':
        case 'neon':
            // F7c: Neon HTTP client. Neon pooler URLs only — Supabase DSNs are
            // rejected by postgresRunner (wire protocol, unreachable over HTTPS;
            // Supabase flows go through the Management API / PostgREST instead).
            return postgresRunner({ connectionString: String(resolved.connectionString ?? resolved.url ?? '') });
        default:
            throw new Error('unknown_datasource_kind');
    }
}

/** Whether this kind can be introspected (has a working runner). */
export function isIntrospectable(kind: string): boolean {
    return kind === 'sqlite' || kind === 'turso' || kind === 'd1' || kind === 'supabase' || kind === 'postgres';
}

/** The SQL dialect a kind speaks — drives which introspection SQL the Data Studio
 *  runs (F7b: sqlite_master vs information_schema). */
export type Dialect = 'sqlite' | 'postgres';
export function dialectOf(kind: string): Dialect {
    return (kind === 'supabase' || kind === 'postgres') ? 'postgres' : 'sqlite';
}

