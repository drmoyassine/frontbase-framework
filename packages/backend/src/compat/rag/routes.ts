/**
 * RAG routes (framework-only; NOT part of the vendored 334-op product surface).
 *
 *   POST /api/rag/index   {bucketId} — console-authed. Enqueues a
 *                         {type:'rag-index'} job on the resolved queue; with no
 *                         queue (or a failed publish) the index runs inline.
 *   POST /api/rag/search  {query, table?, limit?} — embed → tenant-scoped
 *                         vector search → trimmed results (product semantics:
 *                         slice limit×2, then cut to limit).
 *
 * The SAME runner backs the queue receive endpoint (system-queue.ts calls it
 * for 'rag-index' jobs), so inline and queued indexing are one code path.
 * Config misses (no embedding / no vector / bucket absent / storage
 * unresolvable) raise RagConfigError — permanent states the queue must NOT
 * redeliver forever; transport/embed failures raise plain Errors and 503.
 */
import type { Hono } from 'hono';
import { vectorTableName, type StorageProvider } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { KeyValueStore } from '../store.js';
import type { SystemServiceResolver } from '../system-services.js';
import { indexBucket, ragTableName, type RagIndexResult } from './processor.js';
import type { Embed } from './embedding.js';

/** Permanent misconfiguration — redelivering cannot fix it. */
export class RagConfigError extends Error {}

export interface RagRouteDeps {
    phase2For: (t: string) => Phase2Store;
    kvFor: (t: string) => KeyValueStore;
    resolver: SystemServiceResolver;
    /** Null when FRONTBASE_EMBEDDING is absent/unsupported — RAG unavailable. */
    embedding: Embed | null;
    /** Storage client resolution (the storage routes' resolveForOp: bucket
     *  provider_id > env-wired provider). */
    resolveStorage: (tenant: string, providerId?: string) => Promise<StorageProvider | { status: number; message: string }>;
    now: () => string;
    log?: (msg: string) => void;
}

const LAST_INDEX_KEY = 'rag:last-index';

/** Run one bucket index (inline and queued paths share this). Throws
 *  RagConfigError for permanent misconfiguration, Error for transient
 *  failures. Records the last-run stamp on success. */
export async function runRagIndex(deps: RagRouteDeps, tenant: string, bucketId: string): Promise<RagIndexResult> {
    const log = deps.log ?? (() => {});
    if (!deps.embedding) throw new RagConfigError('rag_embedding_not_configured');
    const vector = await deps.resolver.vectorFor(tenant);
    if (!vector) throw new RagConfigError('rag_vector_not_configured');

    const store = deps.phase2For(tenant);
    const buckets = await store.listBuckets();
    const bucket = buckets.find((b) => String(b.id) === bucketId);
    if (!bucket) throw new RagConfigError(`rag_bucket_not_found`);
    // 'local' is the store-simulated surface's placeholder provider — its bytes
    // live wherever the env-wired provider points (the Docker/local host), so
    // resolve through the env fallback rather than a registry miss.
    const providerId = bucket.provider && bucket.provider !== 'local' ? String(bucket.provider) : undefined;
    const resolved = await deps.resolveStorage(tenant, providerId);
    if ('status' in resolved) {
        log(`[rag] storage unresolvable for bucket '${bucketId}': ${resolved.message}`);
        throw new RagConfigError('rag_storage_not_configured');
    }

    const result = await indexBucket({
        tenant, bucketId, store, storage: resolved, embed: deps.embedding, vector, now: deps.now, log,
    });
    await deps.kvFor(tenant).setJson(LAST_INDEX_KEY, {
        bucket_id: bucketId, at: deps.now(), ...result,
    }, deps.now());
    return result;
}

export function registerRagRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, deps: RagRouteDeps): void {
    const log = deps.log ?? (() => {});

    app.post('/api/rag/index', async (c) => {
        const tenant = c.get('tenant');
        const body = await c.req.json().catch(() => ({})) as { bucketId?: string; bucket_id?: string };
        const bucketId = body.bucketId ?? body.bucket_id ?? '';
        if (!bucketId) return c.json({ detail: 'bucketId is required' }, 400);

        // Queue first (registry default row > env > none); false/throw → inline.
        const queue = await deps.resolver.queueFor(tenant);
        if (queue) {
            const queued = await queue.publishJob({ type: 'rag-index', tenant, bucketId }).catch(() => false);
            if (queued) return c.json({ success: true, queued: true }, 202);
        }
        try {
            const result = await runRagIndex(deps, tenant, bucketId);
            return c.json({ success: true, queued: false, ...result });
        } catch (error) {
            if (error instanceof RagConfigError) {
                return c.json({ detail: `RAG unavailable: ${error.message}` }, 503);
            }
            log(`[rag] index failed for ${tenant}/${bucketId}: ${(error as Error)?.message ?? error}`);
            return c.json({ detail: `RAG index failed: ${(error as Error)?.message ?? error}` }, 500);
        }
    });

    app.post('/api/rag/search', async (c) => {
        const tenant = c.get('tenant');
        const body = await c.req.json().catch(() => ({})) as { query?: string; table?: string; limit?: number };
        const query = typeof body.query === 'string' ? body.query : '';
        if (!query.trim()) return c.json({ detail: 'query is required' }, 400);
        if (!deps.embedding) return c.json({ detail: 'RAG is not configured (FRONTBASE_EMBEDDING absent)' }, 503);
        const vector = await deps.resolver.vectorFor(tenant);
        if (!vector) return c.json({ detail: 'RAG is not configured (no vector provider)' }, 503);

        const limit = Math.max(1, Math.min(Number(body.limit ?? 10) || 10, 50));
        let table = ragTableName(tenant);
        if (body.table) {
            try {
                vectorTableName(body.table); // identifier gate — rejects injection-shaped names
                table = body.table;
            } catch {
                return c.json({ detail: 'invalid table name' }, 400);
            }
        }

        try {
            const vec = await deps.embedding(query);
            // Product semantics: over-fetch (limit×2), then trim to limit. The
            // tenant_id filter is mandatory on every RAG search — the table
            // alone is never trusted as the isolation boundary.
            const hits = await vector.search(table, vec, limit * 2, { tenant_id: tenant });
            return c.json({
                success: true,
                results: hits.slice(0, limit).map((hit) => ({
                    chunk_id: hit.id,
                    text: hit.text,
                    score: hit.score,
                    source: { bucket: hit.metadata?.bucket, path: hit.metadata?.path },
                    metadata: {
                        tenant_id: hit.metadata?.tenant_id,
                        content_type: hit.metadata?.content_type,
                        chunk_index: hit.metadata?.chunk_index,
                        total_chunks: hit.metadata?.total_chunks,
                        created_at: hit.metadata?.created_at,
                    },
                })),
            });
        } catch (error) {
            log(`[rag] search failed for ${tenant}: ${(error as Error)?.message ?? error}`);
            return c.json({ detail: `RAG search failed: ${(error as Error)?.message ?? error}` }, 500);
        }
    });
}
