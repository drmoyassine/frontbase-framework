/**
 * Cloudflare Vectorize adapter — ported from the product edge
 * (VectorizeAdapter). Current and legacy REST indexes share the contract. One index per adapter; the tableName
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
    type Version='v1'|'v2';
    const base = (version:Version) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(opts.accountId)}/vectorize/${version==='v2'?'v2/':''}indexes/${encodeURIComponent(opts.indexName)}`;
    const headers={Authorization:`Bearer ${opts.apiToken}`};
    let version:Promise<Version>|undefined;
    const selectVersion=(op:string):Promise<Version>=>version??=(async()=>{
        const current=await opts.fetchImpl(base('v2'),{method:'GET',headers});
        if(current.ok)return 'v2';
        // Only a definite not-found permits a read-only legacy lookup. Permission,
        // rate-limit and transport failures never trigger a different API or write.
        if(current.status===404){const legacy=await opts.fetchImpl(base('v1'),{method:'GET',headers});if(legacy.ok)return 'v1';throw Error(`Vectorize ${op} failed: ${legacy.status}`);}
        throw Error(`Vectorize ${op} failed: ${current.status}`);
    })().catch(error=>{version=undefined;throw error;});
    const call = async (path: string, op: string, body?: unknown, ndjson=false): Promise<Record<string, unknown>> => {
        const selected=await selectVersion(op);
        const response = await opts.fetchImpl(base(selected)+(path?'/'+path:''), {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
                ...headers,
                ...(body === undefined ? {} : { 'content-type': ndjson?'application/x-ndjson':'application/json' }),
            },
            ...(body === undefined ? {} : { body: ndjson?String(body):JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error(`Vectorize ${op} failed: ${response.status}`);
        const data=await response.json() as Record<string,unknown>;
        if(data.success===false)throw Error(`Vectorize ${op} failed: provider refused operation`);
        return data;
    };

    return {
        async ensureTable() {
            // Indexes are created out-of-band (console/CLI); no-op, as in the
            // product. ping() below is the real existence check.
        },

        async upsert(_tableName, vectors) {
            if (vectors.length === 0) return;
            const selected=await selectVersion('upsert');
            if(selected==='v2'){
                await call('upsert','upsert',vectors.map(v=>JSON.stringify({id:v.id,values:v.vector,metadata:{text:v.text,...v.metadata}})).join('\n')+'\n',true);
                return;
            }
            await call('upsert', 'upsert', {
                vectors: vectors.map((v: VectorDocument) => ({
                    id: v.id,
                    vector: v.vector,
                    metadata: { text: v.text, ...v.metadata },
                })),
            });
        },

        async search(_tableName, queryVector, limit, filters) {
            const selected=await selectVersion('query');
            const data = await call('query', 'query', {
                vector: queryVector,
                topK: limit,
                filter: filters && Object.keys(filters).length > 0 ? filters : undefined,
                returnValues: false,
                returnMetadata: selected==='v2'?'all':true,
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
