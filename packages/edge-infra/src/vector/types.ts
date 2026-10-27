/**
 * Vector adapter contract — ported from the product edge
 * (services/edge/src/services/rag/vector-adapter.ts), plus the ping the
 * framework's test-connection probe wants. One adapter per provider family;
 * credentials arrive already resolved (registry row config or env JSON).
 */
export interface VectorMetadata {
    [key: string]: unknown;
}

export interface VectorDocument {
    id: string;
    vector: number[];
    text: string;
    metadata?: VectorMetadata;
}

export interface VectorSearchResult {
    id: string;
    text: string;
    /** Similarity, higher = closer (libsql: 1 − vector_distance). */
    score: number;
    metadata: VectorMetadata;
}

export interface VectorAdapter {
    /** Create the backing table/index if absent (no-op where the provider
     *  creates structure lazily). */
    ensureTable(tableName: string): Promise<void>;
    /** Insert or replace documents by id. */
    upsert(tableName: string, vectors: VectorDocument[]): Promise<void>;
    /** Nearest-neighbour search; `filters` match metadata keys exactly. */
    search(tableName: string, queryVector: number[], limit: number, filters?: VectorMetadata): Promise<VectorSearchResult[]>;
    /** Remove documents by id. */
    delete(tableName: string, ids: string[]): Promise<void>;
    /** Liveness check — throws when the backing store is unreachable. */
    ping(): Promise<void>;
    /** Release held resources (libsql file handles; HTTP adapters omit it). */
    close?(): Promise<void>;
}

/** Table names are interpolated into DDL/DML (identifiers cannot be bound
 *  as SQL parameters), so every adapter validates through this first. The
 *  product interpolates raw — a framework security-gate divergence. */
export function vectorTableName(name: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`invalid vector table name: ${name}`);
    }
    return `"${name}"`;
}
