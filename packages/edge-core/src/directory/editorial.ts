import { z } from 'zod';
import type { PageComponent } from '../ssr/types.js';

const safeLink = z.string().max(2048).refine(value => {
    try { const decoded = decodeURIComponent(value), url = new URL(value);
        return !/[{}"'<>\\\x00-\x20]/.test(decoded) && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
});
const run = z.object({ text: z.string().max(60000).refine(v => !v.includes('\0')), href: safeLink.optional() }).strict();
const block = z.object({ kind: z.enum(['paragraph', 'heading', 'list_item', 'quote']), level: z.number().int().min(1).max(6).optional(), runs: z.array(run).min(1).max(500) }).strict()
    .refine(b => b.kind === 'heading' ? b.level !== undefined : b.level === undefined);
export const editorialBodySchema = z.array(block).min(1).max(1000).refine(v => JSON.stringify(v).length <= 200000 && v.reduce((n,b) => n + b.runs.length, 0) <= 2000);
const plain = (max: number) => z.string().max(max).refine(v => !v.includes('\0'));
/** Permanent public raster URL; signed/private URLs are not durable content. */
export const editorialCoverUrlSchema = z.string().max(2048).refine(value => {
    try { const decoded = decodeURIComponent(value), url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
            && !/[{}"'<>\\\x00-\x20]/.test(decoded) && /\.(?:png|jpe?g|webp|gif|avif)$/i.test(url.pathname);
    } catch { return false; }
});
export const editorialEditSchema = z.object({
    title: z.string().trim().min(1).max(500).refine(v => !v.includes('\0')), excerpt: plain(10000), body: editorialBodySchema,
    language: z.string().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/).nullable(),
    byline: plain(500).nullable(), coverUrl: editorialCoverUrlSchema.nullable(), coverAlt: plain(500), reviewState: z.enum(['draft', 'requested']), reviewNote: plain(4000),
}).strict().refine(v => v.reviewState !== 'requested' || (v.language !== null && v.reviewNote.trim().length > 0));
export const editorialReadRequestSchema = z.object({ expectedConfigurationRevision: z.number().int().positive(), id: z.string().uuid() }).strict();
export const editorialSaveRequestSchema = editorialReadRequestSchema.extend({ expectedDocumentRevision: z.number().int().positive().max(2147483646), content: editorialEditSchema }).strict();
export const editorialDocumentSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive(), originalPath: z.string().min(1).max(400),
    title: z.string().min(1).max(500).refine(v => !v.includes('\0')), excerpt: plain(10000), body: editorialBodySchema, language: z.string().nullable(), byline: plain(500).nullable(),
    publishedAt: z.string().nullable(), coverUrl: editorialCoverUrlSchema.nullable().default(null), coverAlt: plain(500).default(''), reviewState: z.enum(['draft', 'requested']), reviewNote: plain(4000),
}).strict();
export type EditorialDocument = z.infer<typeof editorialDocumentSchema>;
export type EditorialEdit = z.infer<typeof editorialEditSchema>;
export function parseEditorialBody(value: unknown): z.infer<typeof editorialBodySchema> {
    return editorialBodySchema.parse(typeof value === 'string' ? JSON.parse(value) : value);
}
const literal = (text: string) => text.replace(/\{(?=[{%])/g, '{\u200b');
/** Conversion data becomes existing safe primitives; no HTML/Liquid execution. */
export function projectEditorialBody(value: unknown, id: string): PageComponent[] {
    return parseEditorialBody(value).map((b,i) => b.kind === 'heading'
        ? { id: `${id}-block-${i}`, type: 'Heading', props: { text: literal(b.runs.map(r => r.text).join('')), level: String(Math.max(2,b.level!)) } }
        : { id: `${id}-block-${i}`, type: 'Container', props: { className: `editorial-${b.kind}` }, styles: { marginBottom: '20px' }, children: b.runs.map((r,j) => ({
            id: `${id}-block-${i}-run-${j}`, type: r.href ? 'Link' : 'Text', props: { text: literal(r.text), ...(r.href ? { href: r.href } : {}) }, styles: { display: 'inline', whiteSpace: 'pre-wrap' },
        })) });
}
