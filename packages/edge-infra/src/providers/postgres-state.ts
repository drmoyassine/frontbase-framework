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
export function postgresPlaceholders(sql: string): string {
    let out = '';
    let parameter = 0;
    let i = 0;
    let state: 'code' | 'single' | 'double' | 'line-comment' | 'block-comment' | 'dollar' = 'code';
    let dollarTag = '';

    while (i < sql.length) {
        const char = sql[i]!;
        const next = sql[i + 1];

        if (state === 'single') {
            out += char;
            if (char === "'" && next === "'") { out += next; i += 2; continue; }
            if (char === "'") state = 'code';
            i += 1;
            continue;
        }
        if (state === 'double') {
            out += char;
            if (char === '"' && next === '"') { out += next; i += 2; continue; }
            if (char === '"') state = 'code';
            i += 1;
            continue;
        }
        if (state === 'line-comment') {
            out += char;
            if (char === '\n') state = 'code';
            i += 1;
            continue;
        }
        if (state === 'block-comment') {
            out += char;
            if (char === '*' && next === '/') { out += '/'; i += 2; state = 'code'; continue; }
            i += 1;
            continue;
        }
        if (state === 'dollar') {
            if (sql.startsWith(dollarTag, i)) {
                out += dollarTag;
                i += dollarTag.length;
                state = 'code';
            } else {
                out += char;
                i += 1;
            }
            continue;
        }

        if (char === "'") { out += char; state = 'single'; i += 1; continue; }
        if (char === '"') { out += char; state = 'double'; i += 1; continue; }
        if (char === '-' && next === '-') { out += '--'; state = 'line-comment'; i += 2; continue; }
        if (char === '/' && next === '*') { out += '/*'; state = 'block-comment'; i += 2; continue; }
        if (char === '$') {
            const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
            if (match) {
                dollarTag = match[0];
                out += dollarTag;
                i += dollarTag.length;
                state = 'dollar';
                continue;
            }
        }
        if (char === '?') {
            parameter += 1;
            out += `$${parameter}`;
        } else {
            out += char;
        }
        i += 1;
    }
    return out;
}

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
    return runner;
}
