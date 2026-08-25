/**
 * RAG document processor — ported from the product edge
 * (services/edge/src/services/rag/processor.ts + document-processor.ts):
 * list a bucket's files → filter text-like → download → chunk (1000/200,
 * sentence-boundary breaks) → embed → upsert into the tenant's vector table.
 *
 * Divergences from the product (documented, docs/system-services.md):
 *  - no OCR: images/PDFs are skipped (and counted), not sent through an OCR
 *    service — text-like files only in v1;
 *  - per-tenant vector table (rag_{tenant}) is the primary isolation boundary,
 *    and EVERY search additionally filters metadata tenant_id;
 *  - the file inventory comes from the framework's own storage_files rows
 *    (tenant-scoped SQL — the store is the source of truth for what a bucket
 *    holds), with bytes fetched from the resolved StorageProvider.
 */
import type { StorageProvider, VectorAdapter } from '@frontbase/edge-infra';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { Embed } from './embedding.js';

export const RAG_CHUNK_SIZE = 1000;
export const RAG_CHUNK_OVERLAP = 200;

/** The tenant's vector table. `rag_` prefix guarantees the identifier-valid
 *  start vectorTableName() requires. Tenant slugs that sanitize identically
 *  (a-b vs a_b) share a table — the mandatory tenant_id metadata filter keeps
 *  their rows disjoint regardless. */
export function ragTableName(tenant: string): string {
    return `rag_${tenant.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/**
 * Split text into overlapping chunks (product algorithm, verbatim semantics:
 * break at the last sentence period or newline past the chunk's midpoint,
 * advance by chunkSize minus the overlap).
 */
export function chunkText(text: string, chunkSize = RAG_CHUNK_SIZE, overlap = RAG_CHUNK_OVERLAP): string[] {
    if (text.length <= chunkSize) return [text];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        let end = start + chunkSize;

        // Try to break at a sentence boundary.
        if (end < text.length) {
            const lastPeriod = text.lastIndexOf('.', end);
            const lastNewline = text.lastIndexOf('\n', end);
            const breakPoint = Math.max(lastPeriod, lastNewline);

            if (breakPoint > start + chunkSize / 2) {
                end = breakPoint + 1;
            }
        }

        chunks.push(text.slice(start, end).trim());
        start = end - overlap;

        // Avoid an infinite loop on very short chunks.
        if (start <= 0 && chunks.length > 1) break;
    }

    return chunks.filter((c) => c.length > 0);
}

const TEXT_EXTENSIONS = /\.(txt|md|markdown|json|jsonc|csv|tsv|ya?ml|toml|ini|env|xml|html?|css|jsx?|tsx?|mjs|cjs|py|rb|go|rs|java|kt|php|sh|sql|log|srt|vtt)$/i;

/**
 * Text-like check (product TextExtractor's direct-decode branch): text/*,
 * json/xml/html payloads, or — when the upload carried no usable MIME type —
 * a known text extension. Images/PDFs/binary are NOT text-like here: the
 * framework ships no OCR, so they are skipped and counted instead.
 */
export function isTextLike(mime: string | null | undefined, path: string): boolean {
    const type = (mime ?? '').toLowerCase();
    if (type === 'application/x-directory' || path.endsWith('/')) return false; // folder marker
    if (type.startsWith('text/')) return true;
    if (type.includes('json') || type.includes('xml') || type.includes('html') || type.includes('javascript') || type === 'application/x-yaml' || type === 'application/yaml') return true;
    if (!type || type === 'application/octet-stream' || type === 'application/binary') return TEXT_EXTENSIONS.test(path);
    return false;
}

/** Stable chunk id (product algorithm): re-indexing the same path REPLACES its
 *  chunks (INSERT OR REPLACE) instead of duplicating them. */
const chunkId = (path: string, index: number): string =>
    `${path.replace(/[^a-zA-Z0-9]/g, '_')}_chunk_${index}`;

export interface RagIndexResult {
    files_seen: number;
    files_indexed: number;
    files_skipped: number;
    /** Files whose download or embed failed (logged, never fatal to the run). */
    files_failed: number;
    chunks_indexed: number;
}

export interface IndexBucketOpts {
    tenant: string;
    bucketId: string;
    /** Tenant-scoped store — listFiles is the isolation boundary (RULE 2). */
    store: Phase2Store;
    /** Resolved storage client; the provider bucket is the bucketId (upload parity). */
    storage: StorageProvider;
    embed: Embed;
    vector: VectorAdapter;
    now: () => string;
    log?: (msg: string) => void;
}

/**
 * Index every text-like file in one bucket into the tenant's RAG table.
 * Per-file failures are counted and logged, never thrown — one unreadable
 * file must not lose the rest of the bucket (product parity).
 */
export async function indexBucket(opts: IndexBucketOpts): Promise<RagIndexResult> {
    const log = opts.log ?? (() => {});
    const table = ragTableName(opts.tenant);
    await opts.vector.ensureTable(table);

    const rows = await opts.store.listFiles(opts.bucketId);
    const result: RagIndexResult = { files_seen: rows.length, files_indexed: 0, files_skipped: 0, files_failed: 0, chunks_indexed: 0 };

    for (const row of rows) {
        const path = String(row.path ?? '');
        const mime = row.mime_type == null ? undefined : String(row.mime_type);
        try {
            if (!path || !isTextLike(mime, path)) {
                result.files_skipped++;
                continue;
            }
            const { bytes, contentType } = await opts.storage.get(opts.bucketId, path);
            const text = new TextDecoder().decode(bytes);
            if (!text.trim()) {
                result.files_skipped++;
                continue;
            }
            const chunks = chunkText(text);
            const createdAt = opts.now();
            const documents = [];
            for (let index = 0; index < chunks.length; index++) {
                documents.push({
                    id: chunkId(path, index),
                    vector: await opts.embed(chunks[index]!),
                    text: chunks[index]!,
                    metadata: {
                        tenant_id: opts.tenant,
                        bucket: opts.bucketId,
                        path,
                        content_type: contentType ?? mime ?? 'application/octet-stream',
                        chunk_index: index,
                        total_chunks: chunks.length,
                        created_at: createdAt,
                    },
                });
            }
            await opts.vector.upsert(table, documents);
            result.files_indexed++;
            result.chunks_indexed += chunks.length;
        } catch (error) {
            result.files_failed++;
            log(`[rag] failed to index ${opts.bucketId}/${path}: ${(error as Error)?.message ?? error}`);
        }
    }
    return result;
}
