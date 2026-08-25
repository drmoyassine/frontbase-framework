/**
 * LibSQL / Turso vector adapter — ported from the product edge
 * (LibSqlVectorAdapter). Vectors live as JSON text in a plain TEXT column;
 * remote (libsql:// Turso) orders by the server-side vector_distance(), local
 * (file:/memory) computes cosine distance in-process — the vector extension
 * does not exist in local libsql builds, so the honest split keeps self-host
 * and tests on one contract. Score = 1 − distance either way.
 *
 * Table names are validated by vectorTableName() before interpolation
 * (identifiers cannot be parameter-bound).
 */
import { createClient, type Client, type InValue } from '@libsql/client';
import { vectorTableName, type VectorAdapter, type VectorDocument, type VectorMetadata, type VectorSearchResult } from './types.js';

export interface LibsqlVectorOpts {
    url: string;
    authToken?: string;
}

/** JSON1 metadata filters as SQL conditions + bound values (product parity:
 *  json_extract equality per key). */
function metadataFilters(filters?: VectorMetadata): { clause: string; values: InValue[] } {
    if (!filters || Object.keys(filters).length === 0) return { clause: '', values: [] };
    const conditions: string[] = [];
    const values: InValue[] = [];
    for (const [key, value] of Object.entries(filters)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`invalid vector filter key: ${key}`);
        conditions.push(`json_extract(metadata, '$.${key}') = ?`);
        values.push(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null ? value : JSON.stringify(value));
    }
    return { clause: ` AND ${conditions.join(' AND ')}`, values };
}

function parseMetadata(raw: unknown): VectorMetadata {
    if (typeof raw !== 'string' || !raw) return {};
    try { return JSON.parse(raw) as VectorMetadata; } catch { return {}; }
}

/** Cosine DISTANCE (0 identical, 2 opposite) — matches vector_distance's
 *  cosine space, so 1 − distance is the similarity both paths return. */
function cosineDistance(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if (na === 0 || nb === 0) return 1;
    return 1 - dot / Math.sqrt(na * nb);
}

export function libsqlVectorAdapter(opts: LibsqlVectorOpts): VectorAdapter {
    const remote = /^(?:libsql|wss|https?):\/\//i.test(opts.url);
    // One client for the adapter's lifetime — libsql connects lazily, so a
    // file: URL that does not exist yet is only touched on first use.
    const client: Client = createClient({ url: opts.url, authToken: opts.authToken });

    return {
        async ensureTable(tableName) {
            const table = vectorTableName(tableName);
            await client.execute(
                `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, vector TEXT, text TEXT, metadata TEXT)`,
            );
        },

        async upsert(tableName, vectors) {
            if (vectors.length === 0) return;
            const table = vectorTableName(tableName);
            // One atomic write batch (product executes row-by-row; the wire
            // result is identical).
            await client.batch(vectors.map((doc: VectorDocument) => ({
                sql: `INSERT OR REPLACE INTO ${table} (id, vector, text, metadata) VALUES (?, ?, ?, ?)`,
                args: [doc.id, JSON.stringify(doc.vector), doc.text, JSON.stringify(doc.metadata ?? {})] as InValue[],
            })), 'write');
        },

        async search(tableName, queryVector, limit, filters) {
            const table = vectorTableName(tableName);
            const { clause, values } = metadataFilters(filters);
            if (remote) {
                const rows = await client.execute({
                    sql: `SELECT id, text, metadata, vector_distance(vector, ?) as distance FROM ${table} WHERE vector IS NOT NULL${clause} ORDER BY distance LIMIT ?`,
                    args: [JSON.stringify(queryVector), ...values, limit],
                });
                return rows.rows.map((row) => ({
                    id: String(row.id),
                    text: String(row.text ?? ''),
                    score: 1 - Number(row.distance ?? 0),
                    metadata: parseMetadata(row.metadata),
                }));
            }
            // Local libsql has no vector extension: fetch the filtered rows
            // and rank in-process.
            const rows = await client.execute({
                sql: `SELECT id, vector, text, metadata FROM ${table} WHERE vector IS NOT NULL${clause}`,
                args: values,
            });
            const query = queryVector.map(Number);
            return rows.rows
                .map((row) => {
                    let vec: number[] = [];
                    try { vec = JSON.parse(String(row.vector ?? '[]')) as number[]; } catch { /* skip below */ }
                    return {
                        id: String(row.id),
                        text: String(row.text ?? ''),
                        distance: cosineDistance(query, vec.map(Number)),
                        metadata: parseMetadata(row.metadata),
                    };
                })
                .sort((a, b) => a.distance - b.distance)
                .slice(0, limit)
                .map(({ id, text, distance, metadata }) => ({ id, text, score: 1 - distance, metadata }));
        },

        async delete(tableName, ids) {
            if (ids.length === 0) return;
            const table = vectorTableName(tableName);
            await client.execute({
                sql: `DELETE FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`,
                args: ids as InValue[],
            });
        },

        async ping() {
            await client.execute('SELECT 1');
        },

        async close() {
            await client.close();
        },
    };
}
