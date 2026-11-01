import { Client, type ClientBase } from 'pg';
import type { DbRunner } from './types.js';

export interface PostgresStateOptions {
    /** Hyperdrive's connectionString, or a direct PostgreSQL URL on Node. */
    connectionString: string;
    /** Kept deliberately small for edge isolates; Hyperdrive owns global pooling. */
    maxConnections?: number;
    /** Dedicated application schema. Must be a plain PostgreSQL identifier. */
    schema?: string;
}

/**
 * Convert Frontbase's portable qmark parameters to PostgreSQL's numbered form.
 * Question marks inside strings, quoted identifiers, dollar-quoted bodies, and
 * SQL comments remain literal.
 */
export {postgresPlaceholders} from './postgres-parameters.js';
import {postgresPlaceholders} from './postgres-parameters.js';

function clientRunner(client: Pick<ClientBase, 'query'>): DbRunner {
    return {
        dialect: 'postgres',
        async query(sql, params = []) {
            const result = await client.query(postgresPlaceholders(sql), params);
            return result.rows as Record<string, unknown>[];
        },
        async exec(sql, params = []) {
            const result = await client.query(postgresPlaceholders(sql), params);
            return result.rowCount ?? 0;
        },
    };
}

/** Application-state runner for PostgreSQL/Supabase, including atomic migrations. */
export function postgresStateRunner(options: PostgresStateOptions): DbRunner {
    if (options.schema && !/^[a-z_][a-z0-9_]*$/.test(options.schema)) {
        throw new Error('invalid_postgres_state_schema');
    }
    // Hyperdrive owns global pooling. A Worker-local Pool adds another queue
    // and can time out while a shared isolate serves another request. Follow
    // Cloudflare's pg pattern instead: connect a short-lived Client per query
    // or transaction and let Hyperdrive retain the expensive origin sockets.
    let schemaReady = !options.schema;
    async function withClient<T>(work: (client: ClientBase) => Promise<T>): Promise<T> {
        const client = new Client({ connectionString: options.connectionString });
        try {
            await client.connect();
            if (options.schema) {
                if (!schemaReady) {
                    await client.query(`CREATE SCHEMA IF NOT EXISTS "${options.schema}"`);
                    schemaReady = true;
                }
                // Hyperdrive does not reliably forward startup `options`, so
                // select the dedicated schema on this connection before work.
                await client.query('SELECT set_config($1, $2, false)', ['search_path', options.schema]);
            }
            return await work(client);
        } finally {
            await client.end().catch(() => undefined);
        }
    }
    const runner: DbRunner = {
        dialect: 'postgres',
        async query(sql, params = []) {
            return withClient(async (client) => {
                const result = await client.query(postgresPlaceholders(sql), params);
                return result.rows as Record<string, unknown>[];
            });
        },
        async exec(sql, params = []) {
            return withClient(async (client) => {
                const result = await client.query(postgresPlaceholders(sql), params);
                return result.rowCount ?? 0;
            });
        },
        async transaction(work) {
            return withClient(async (client) => {
                await client.query('BEGIN');
                let committed = false;
                try {
                    const value = await work(clientRunner(client));
                    await client.query('COMMIT');
                    committed = true;
                    return value;
                } finally {
                    if (!committed) await client.query('ROLLBACK').catch(() => undefined);
                }
            });
        },
    };
    runner.atomicWrite=async statements=>{await runner.transaction!(async transaction=>{for(const statement of statements)await transaction.exec(statement.sql,statement.params);});};
    return runner;
}
