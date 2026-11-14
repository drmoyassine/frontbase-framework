import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler/manifest';
import { publicationInstitutionSchema, publicationProgramSchema, publicationCitySchema, publicationArticleSchema, publicationPageSchema } from '@frontbase/edge-core/directory/publication';
import { publicationHash } from './publication-hash.js';

export const PUBLICATION_CHUNK_BYTES = 512 * 1024;
const schemas = { institutions: publicationInstitutionSchema, programs: publicationProgramSchema,
    cities: publicationCitySchema, articles: publicationArticleSchema, pages: publicationPageSchema };
export type PublicationCollection = keyof typeof schemas;
const bytes = (value: unknown) => new TextEncoder().encode(stableStringify(value)).byteLength;
const envelope = z.object({ schemaVersion: z.literal(1), kind: z.literal('directory-record-chunk'),
    collection: z.enum(['institutions', 'programs', 'cities', 'articles', 'pages']), records: z.array(z.unknown()).min(1).max(48) }).strict();

/** Internal storage primitive, not a reviewed publication or an anonymous write contract. */
export function parsePublicationChunk(input: unknown) {
    const chunk = envelope.parse(input);
    const records = chunk.records.map(row => schemas[chunk.collection].parse(row));
    if (new Set(records.map(row => String(row.id))).size !== records.length) throw new Error('publication_chunk_duplicate_id');
    const value = { ...chunk, records };
    if (bytes(value) > PUBLICATION_CHUNK_BYTES) throw new Error('publication_chunk_too_large');
    return value;
}
export type PublicationChunk = ReturnType<typeof parsePublicationChunk>;
export const publicationChunkReferenceSchema = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/),
    collection: envelope.shape.collection, count: z.number().int().min(1).max(48),
    bytes: z.number().int().positive().max(PUBLICATION_CHUNK_BYTES) }).strict();
export type PublicationChunkReference = z.infer<typeof publicationChunkReferenceSchema>;

/** Deterministic bounded packing; cross-collection routes/parents belong to manifest admission. */
export function packPublicationChunks(collection: PublicationCollection, input: unknown[]): PublicationChunk[] {
    if (!Object.hasOwn(schemas, collection) || !Array.isArray(input) || input.length > 20000) throw new Error('publication_chunk_input_invalid');
    const records = input.map(row => schemas[collection].parse(row));
    records.sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
    if (new Set(records.map(row => String(row.id))).size !== records.length) throw new Error('publication_chunk_duplicate_id');
    const result: PublicationChunk[] = [];
    let pending: typeof records = [];
    const make = (rows: typeof records) => ({ schemaVersion: 1, kind: 'directory-record-chunk', collection, records: rows });
    // The canonical array adds one comma between records. Measure each record
    // once, including its UTF-8 encoding, to bound work on edge hosts.
    const envelopeBytes = bytes(make([]));
    let pendingBytes = envelopeBytes;
    for (const row of records) {
        const rowBytes = bytes(row);
        if (envelopeBytes + rowBytes > PUBLICATION_CHUNK_BYTES) throw new Error('publication_chunk_too_large');
        if (pending.length === 48 || pendingBytes + rowBytes + Number(pending.length > 0) > PUBLICATION_CHUNK_BYTES) {
            result.push(parsePublicationChunk(make(pending)));
            pending = [];
            pendingBytes = envelopeBytes;
        }
        pendingBytes += rowBytes + Number(pending.length > 0);
        pending.push(row);
    }
    if (pending.length) result.push(parsePublicationChunk(make(pending)));
    return result;
}

export class SitePublicationChunkStore {
    constructor(private db: DbRunner, private tenant: string) {
        if (!tenant.trim()) throw new Error('publication_owner_required');
    }
    async get(input: PublicationChunkReference): Promise<PublicationChunk | null> {
        const reference = publicationChunkReferenceSchema.parse(input);
        const rows = await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',
            [this.tenant, `site_publication:chunk:v1:${reference.hash}`]);
        if (!rows.length) return null;
        return this.parseStored(reference, String(rows[0]!.value));
    }
    private async parseStored(reference: PublicationChunkReference, raw: string) {
        try {
            if (new TextEncoder().encode(raw).byteLength > PUBLICATION_CHUNK_BYTES) throw new Error();
            // Integrity metrics are measured on the STORED content, not on parsePublicationChunk's
            // return value: the record schemas evolve (e.g. nullable defaults added), and a
            // re-parse under a newer schema transforms an old chunk into a different
            // serialization, which would fail the bytes/hash comparison forever after. put()
            // hashed exactly the serialization it stored, and stableStringify(JSON.parse(s)) === s
            // for any stableStringify output, so the raw value reproduces the put-time reference
            // on every engine version. parsePublicationChunk still gates the shape; any tampered
            // byte changes the parsed raw value and fails the hash.
            const stored = JSON.parse(raw);
            const chunk = parsePublicationChunk(stored);
            if (chunk.collection !== reference.collection || chunk.records.length !== reference.count
                || bytes(stored) !== reference.bytes || await publicationHash(stored) !== reference.hash) throw new Error();
            return chunk;
        } catch { throw new Error('publication_chunk_unavailable'); }
    }
    async readBatch(references: PublicationChunkReference[]): Promise<PublicationChunk[]> {
        const chunks: PublicationChunk[] = [];
        for (const batch of this.batches(references)) {
            const keys = batch.map(reference => `site_publication:chunk:v1:${reference.hash}`);
            const rows = await this.db.query(`SELECT key, value FROM settings WHERE tenant_slug = ? AND key IN (${keys.map(() => '?').join(',')})`, [this.tenant, ...keys]);
            const values = new Map(rows.map(row => [String(row.key), String(row.value)]));
            if (values.size !== rows.length || rows.some(row => !keys.includes(String(row.key)))) throw new Error('publication_chunk_unavailable');
            for (const reference of batch) {
                const raw = values.get(`site_publication:chunk:v1:${reference.hash}`);
                if (raw === undefined) throw new Error('publication_manifest_chunk_missing');
                chunks.push(await this.parseStored(reference, raw));
            }
        }
        return chunks;
    }
    private *batches<T extends {bytes:number}>(entries: T[]) {
        let batch: T[] = [], size = 0;
        for (const entry of entries) {
            if (batch.length === 16 || size + entry.bytes > 2 * PUBLICATION_CHUNK_BYTES) {
                yield batch;
                batch = [];
                size = 0;
            }
            batch.push(entry);
            size += entry.bytes;
        }
        if (batch.length) yield batch;
    }
    async insertBatch(chunks: PublicationChunk[], references: PublicationChunkReference[], now: string) {
        const entries = chunks.map((chunk, index) => ({...references[index]!, value: stableStringify(chunk)}));
        for (const batch of this.batches(entries)) {
            const rows = batch.map(() => '(?,?,?,?)').join(',');
            const params = batch.flatMap(entry => [this.tenant, `site_publication:chunk:v1:${entry.hash}`, entry.value, now]);
            const changed = await this.db.exec(`INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES ${rows} ON CONFLICT(tenant_slug, key) DO NOTHING`, params);
            if (!Number.isInteger(changed) || changed < 0 || changed > batch.length) throw new Error('publication_write_result_invalid');
        }
    }
    async put(input: PublicationChunk, now: string): Promise<PublicationChunkReference> {
        const chunk = parsePublicationChunk(input);
        const reference = publicationChunkReferenceSchema.parse({ hash: await publicationHash(chunk),
            collection: chunk.collection, count: chunk.records.length, bytes: bytes(chunk) });
        const changed = await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',
            [this.tenant, `site_publication:chunk:v1:${reference.hash}`, stableStringify(chunk), now]);
        if (changed !== 0 && changed !== 1) throw new Error('publication_write_result_invalid');
        if (!await this.get(reference)) throw new Error('publication_chunk_unavailable');
        return reference;
    }
}
