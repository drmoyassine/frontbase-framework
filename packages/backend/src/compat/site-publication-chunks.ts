import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler/manifest';
import { publicationInstitutionSchema, publicationProgramSchema, publicationCitySchema, publicationArticleSchema } from '@frontbase/edge-core/directory/publication';
import { publicationHash } from './site-publication-store.js';

export const PUBLICATION_CHUNK_BYTES = 512 * 1024;
const schemas = { institutions: publicationInstitutionSchema, programs: publicationProgramSchema,
    cities: publicationCitySchema, articles: publicationArticleSchema };
export type PublicationCollection = keyof typeof schemas;
const bytes = (value: unknown) => new TextEncoder().encode(stableStringify(value)).byteLength;
const envelope = z.object({ schemaVersion: z.literal(1), kind: z.literal('directory-record-chunk'),
    collection: z.enum(['institutions', 'programs', 'cities', 'articles']), records: z.array(z.unknown()).min(1).max(48) }).strict();

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
    for (const row of records) {
        if (pending.length && (pending.length === 48 || bytes(make([...pending, row])) > PUBLICATION_CHUNK_BYTES)) {
            result.push(parsePublicationChunk(make(pending))); pending = [];
        }
        pending.push(row);
        // A single oversized record must fail, never be silently dropped.
        if (bytes(make(pending)) > PUBLICATION_CHUNK_BYTES) throw new Error('publication_chunk_too_large');
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
        try {
            const raw = String(rows[0]!.value);
            if (new TextEncoder().encode(raw).byteLength > PUBLICATION_CHUNK_BYTES) throw new Error();
            const chunk = parsePublicationChunk(JSON.parse(raw));
            if (chunk.collection !== reference.collection || chunk.records.length !== reference.count
                || bytes(chunk) !== reference.bytes || await publicationHash(chunk) !== reference.hash) throw new Error();
            return chunk;
        } catch { throw new Error('publication_chunk_unavailable'); }
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
