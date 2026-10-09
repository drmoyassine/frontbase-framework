import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { stripLayoutEnrichment } from './enrichment.js';

const nullableText = z.string().nullable();
const stateSchema = z.object({
    id: z.string(), name: z.string(), slug: z.string(), title: nullableText, description: nullableText,
    keywords: nullableText, is_public: z.number(), is_homepage: z.number(), is_published: z.number(),
    layout_data: z.string(), seo_data: nullableText, deleted_at: nullableText, content_hash: nullableText,
    created_at: z.string(), updated_at: z.string(), primary_auth_form: nullableText,
    last_write_operation: nullableText,
}).strict();
const fields = Object.keys(stateSchema.shape);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const pageChangeRequestSchema = z.object({
    operationId: z.string().uuid(), expectedStateHash: hashSchema,
    patch: z.object({
        name: z.string().min(1).max(200).optional(), title: z.string().max(500).nullable().optional(),
        description: z.string().max(4000).nullable().optional(), keywords: z.string().max(2000).nullable().optional(),
        layoutData: z.object({ root: z.record(z.unknown()), content: z.array(z.unknown()).max(3000) }).strict().optional(),
    }).strict().refine(value => Object.keys(value).length > 0),
}).strict();
const operationSchema = z.object({
    version: z.literal(1), operationId: z.string().uuid(), pageId: z.string(), planHash: hashSchema,
    expectedStateHash: hashSchema, resultStateHash: hashSchema, before: stateSchema, after: stateSchema,
    phase: z.enum(['prepared', 'applying', 'applied', 'conflict']), createdAt: z.string(),
}).strict();
type State = z.infer<typeof stateSchema>;
type Operation = z.infer<typeof operationSchema>;
type Request = z.infer<typeof pageChangeRequestSchema>;
const SLOT = 'page_change:active:v1';
const archiveKey = (id: string) => `page_change:receipt:v1:${id}`;
const canonical = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
};
async function digest(value: unknown): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
    return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export class PageChangeConflict extends Error {}

/** Draft-only CAS plus durable recovery intent. Not a multi-page installer transaction. */
export class PageChangeStore {
    constructor(private db: DbRunner, private tenant: string) {}
    private async page(id: string): Promise<State | null> {
        const rows = await this.db.query(`SELECT ${fields.join(',')} FROM compat_pages WHERE tenant_slug=? AND id=?`, [this.tenant, id]);
        return rows.length ? stateSchema.parse(rows[0]) : null;
    }
    private hash(page: State): Promise<string> { return digest({ owner: this.tenant, page }); }
    async state(id: string): Promise<{ hash: string; draft: boolean } | null> {
        const page = await this.page(id);
        return page ? { hash: await this.hash(page), draft: page.deleted_at === null && page.is_published === 0 } : null;
    }
    private async record(key: string): Promise<{ raw: string; value: Operation } | null> {
        const rows = await this.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?', [this.tenant, key]);
        if (!rows.length) return null;
        const raw = String(rows[0]!.value);
        if (new TextEncoder().encode(raw).length > 2 * 1024 * 1024) throw new Error('page_change_unavailable');
        const value = operationSchema.parse(JSON.parse(raw));
        if (value.pageId !== value.before.id || value.pageId !== value.after.id ||
            value.expectedStateHash !== await this.hash(value.before) || value.resultStateHash !== await this.hash(value.after) ||
            value.after.last_write_operation !== value.operationId || value.before.deleted_at !== null ||
            value.after.deleted_at !== null || value.before.is_published !== 0 || value.after.is_published !== 0)
            throw new Error('page_change_unavailable');
        return { raw, value };
    }
    private async swap(prior: string, operation: Operation): Promise<boolean> {
        return await this.db.exec('UPDATE settings SET value=?, updated_at=? WHERE tenant_slug=? AND key=? AND value=?',
            [JSON.stringify(operation), operation.createdAt, this.tenant, SLOT, prior]) === 1;
    }
    /** Read-only status: never resumes prepared work or finalizes a journal. */
    async status(pageId: string, id: string): Promise<{ operationId: string; pageId: string; status: 'prepared' | 'applied' | 'conflict' | 'uncertain'; resultStateHash: string } | null> {
        const active = await this.record(SLOT);
        const record = active?.value.operationId === id ? active : await this.record(archiveKey(id));
        if (!record || record.value.pageId !== pageId) return null;
        const operation = record.value;
        const page = await this.page(pageId);
        const matches = page?.last_write_operation === id && await this.hash(page) === operation.resultStateHash;
        const status = operation.phase === 'prepared' ? 'prepared' : operation.phase === 'conflict' ? 'conflict' : matches ? 'applied' : 'uncertain';
        return { operationId: id, pageId, status, resultStateHash: operation.resultStateHash };
    }
    async begin(pageId: string, input: Request, now: string): Promise<Operation> {
        const request = pageChangeRequestSchema.parse(input);
        const planHash = await digest({ owner: this.tenant, pageId, request });
        const archived = await this.record(archiveKey(request.operationId));
        const current = await this.record(SLOT);
        const known = archived ?? (current?.value.operationId === request.operationId ? current : null);
        if (known) {
            if (known.value.planHash !== planHash || known.value.pageId !== pageId) throw new PageChangeConflict('operation_changed');
            return known.value;
        }
        if (current && !['applied', 'conflict'].includes(current.value.phase)) throw new PageChangeConflict('operation_in_progress');
        const before = await this.page(pageId);
        if (!before || before.deleted_at !== null || before.is_published !== 0 || await this.hash(before) !== request.expectedStateHash)
            throw new PageChangeConflict('page_changed');
        const after: State = { ...before, updated_at: now, last_write_operation: request.operationId };
        for (const key of ['name', 'title', 'description', 'keywords'] as const)
            if (request.patch[key] !== undefined) Object.assign(after, { [key]: request.patch[key] });
        if (request.patch.layoutData !== undefined) {
            after.layout_data = JSON.stringify(stripLayoutEnrichment(request.patch.layoutData));
            after.content_hash = await digestLayout(after.layout_data);
        }
        const operation = operationSchema.parse({ version: 1, operationId: request.operationId, pageId, planHash,
            expectedStateHash: request.expectedStateHash, resultStateHash: await this.hash(after), before, after,
            phase: 'prepared', createdAt: now });
        const raw = JSON.stringify(operation);
        if (new TextEncoder().encode(raw).length > 2 * 1024 * 1024) throw new Error('page_change_unavailable');
        // Archive the terminal receipt before replacing the one-owner slot. Never expire a running writer.
        if (current) {
            await this.db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',
                [this.tenant, archiveKey(current.value.operationId), current.raw, now]);
            const saved = await this.record(archiveKey(current.value.operationId));
            if (!saved || saved.raw !== current.raw) throw new Error('page_change_unavailable');
        }
        const changed = current ? await this.swap(current.raw, operation)
            : await this.db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',
                [this.tenant, SLOT, raw, now]) === 1;
        if (!changed) throw new PageChangeConflict('operation_in_progress');
        return operation;
    }
    async execute(id: string): Promise<{ operationId: string; pageId: string; status: 'applied' | 'conflict' | 'uncertain'; resultStateHash: string }> {
        let record = await this.record(SLOT);
        if (!record || record.value.operationId !== id) record = await this.record(archiveKey(id));
        if (!record) throw new PageChangeConflict('operation_missing');
        let operation = record.value;
        const response = (status: 'applied' | 'conflict' | 'uncertain') => ({ operationId: id, pageId: operation.pageId, status, resultStateHash: operation.resultStateHash });
        if (operation.phase === 'conflict') return response('conflict');
        if (operation.phase === 'prepared') {
            const intent: Operation = { ...operation, phase: 'applying' };
            if (!await this.swap(record.raw, intent)) return response('uncertain');
            operation = intent;
            // Full-row predicate catches metadata/layout/privacy/publication/deletion edits, even with the same timestamp/hash.
            const predicates = fields.map(field => `(${field}=? OR (${field} IS NULL AND ?=1))`).join(' AND ');
            const expected = fields.flatMap(field => { const value = operation.before[field as keyof State]; return [value, value === null ? 1 : 0]; });
            const changed = await this.db.exec(
                `UPDATE compat_pages SET name=?, title=?, description=?, keywords=?, layout_data=?, content_hash=?, updated_at=?, last_write_operation=? WHERE tenant_slug=? AND id=? AND deleted_at IS NULL AND is_published=0 AND ${predicates}`,
                [operation.after.name, operation.after.title, operation.after.description, operation.after.keywords,
                    operation.after.layout_data, operation.after.content_hash, operation.after.updated_at, id, this.tenant, operation.pageId, ...expected]);
            if (changed !== 1) {
                await this.swap(JSON.stringify(operation), { ...operation, phase: 'conflict' });
                return response('conflict');
            }
        }
        const page = await this.page(operation.pageId);
        // The receipt marker is written by the same SQL as the page; equal content alone proves no ownership.
        if (!page || page.last_write_operation !== id || await this.hash(page) !== operation.resultStateHash) return response('uncertain');
        if (operation.phase !== 'applied') await this.swap(JSON.stringify(operation), { ...operation, phase: 'applied' });
        return response('applied');
    }
}
async function digestLayout(layout: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(layout));
    return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
