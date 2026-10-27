/**
 * Cloudflare Vectorize adapter — ported from the product edge
 * (VectorizeAdapter, v1 REST paths). One index per adapter; the tableName
 * argument is accepted (contract symmetry) and ignored, as in the product.
 * All HTTP goes through the injected fetch so hosts keep their SSRF guard
 * over the endpoint. RULE 1: the API token never enters a browser bundle.
 */
import type { VectorAdapter, VectorDocument, VectorMetadata, VectorSearchResult } from './types.js';
import type { ServiceFetch } from '../cache/types.js';

export interface VectorizeOpts {
    accountId: string;
    apiToken: string;
    indexName: string;
    fetchImpl: ServiceFetch;
}

export function vectorizeAdapter(opts: VectorizeOpts): VectorAdapter {
    const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(opts.accountId)}/vectorize/indexes/${encodeURIComponent(opts.indexName)}`;
    const call = async (path: string, op: string, body?: unknown): Promise<Record<string, unknown>> => {
        const response = await opts.fetchImpl(path.startsWith('http') ? path : `${base}/${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
                Authorization: `Bearer ${opts.apiToken}`,
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error(`Vectorize ${op} failed: ${response.status}`);
        return await response.json().catch(() => ({})) as Record<string, unknown>;
    };

    return {
        async ensureTable() {
            // Indexes are created out-of-band (console/CLI); no-op, as in the
            // product. ping() below is the real existence check.
        },

        async upsert(_tableName, vectors) {
            if (vectors.length === 0) return;
            await call('upsert', 'upsert', {
                vectors: vectors.map((v: VectorDocument) => ({
                    id: v.id,
                    vector: v.vector,
                    metadata: { text: v.text, ...v.metadata },
                })),
            });
        },

        async search(_tableName, queryVector, limit, filters) {
            const data = await call('query', 'query', {
                vector: queryVector,
                topK: limit,
                filter: filters && Object.keys(filters).length > 0 ? filters : undefined,
                returnValues: false,
                returnMetadata: true,
            });
            const result = data.result as { matches?: Array<{ id?: string; score?: number; metadata?: VectorMetadata }> } | undefined;
            return (result?.matches ?? []).map((match) => {
                const metadata = match.metadata ?? {};
                const { text, ...rest } = metadata as { text?: string } & VectorMetadata;
                return {
                    id: String(match.id ?? ''),
                    text: String(text ?? ''),
                    score: Number(match.score ?? 0),
                    metadata: rest,
                } satisfies VectorSearchResult;
            });
        },

        async delete(_tableName, ids) {
            if (ids.length === 0) return;
            await call('delete_by_ids', 'delete', { ids });
        },

        async ping() {
            // Index describe — proves account, token, and index name at once.
            // The API answers 404 for a missing index, which call() turns into
            // a thrown error, exactly what a liveness probe wants.
            await call('', 'describe');
        },
    };
}
