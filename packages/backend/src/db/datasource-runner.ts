/**
 * Datasource runner factory (Phase 3b / F7). Given a datasource record's kind +
 * decrypted config, build the right DbRunner so the Data Studio can introspect
 * tables and run queries against the external database.
 *
 * One place maps kind → runner (RULE 6: no hand-rolled drivers elsewhere). All
 * runners come from @frontbase/edge-infra (the DbRunner seam).
 */
import {
    sqliteRunner, d1RunnerFromRest, supabaseRunner,
    type DbRunner,
} from '@frontbase/edge-infra';

export type DatasourceKind = 'sqlite' | 'd1' | 'turso' | 'supabase' | 'postgres';

/** Build a DbRunner from a datasource's kind + config. Throws on unknown kind / missing fields. */
export function datasourceRunner(kind: string, config: Record<string, unknown>): DbRunner {
    switch (kind as DatasourceKind) {
        case 'sqlite':
            return sqliteRunner(String(config.url ?? ':memory:'), config.authToken ? String(config.authToken) : undefined);
        case 'turso':
            // Turso is libsql over the wire.
            return sqliteRunner(String(config.url ?? ''), config.authToken ? String(config.authToken) : undefined);
        case 'd1':
            return d1RunnerFromRest({
                accountId: String(config.accountId ?? ''),
                databaseId: String(config.databaseId ?? ''),
                apiToken: String(config.apiToken ?? ''),
            });
        case 'supabase':
            return supabaseRunner({
                url: String(config.url ?? ''),
                serviceKey: String(config.serviceKey ?? ''),
                jwt: config.jwt ? String(config.jwt) : undefined,
                schema: config.schema ? String(config.schema) : undefined,
            });
        case 'postgres':
            // Postgres/Hyperdrive: not yet wired to a runner factory (CF-21 edge audit).
            // Datasources of this kind can be stored but not introspected until a
            // postgresRunner ships.
            throw new Error('postgres_runner_not_implemented');
        default:
            throw new Error('unknown_datasource_kind');
    }
}

/** Whether this kind can be introspected (has a working runner). */
export function isIntrospectable(kind: string): boolean {
    return kind === 'sqlite' || kind === 'turso' || kind === 'd1' || kind === 'supabase';
}
