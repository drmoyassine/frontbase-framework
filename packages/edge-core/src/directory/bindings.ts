import { z } from 'zod';
import type { PageComponent, PageLayoutData } from '../ssr/types.js';
import { projectEditorialBody } from './editorial.js';

const path = z.string().max(400).refine(v => {
    try { const decoded = decodeURIComponent(v); return v.startsWith('/') && !decoded.startsWith('//') && !/[\\?#{}\s\x00-\x20]/.test(decoded) && !decoded.split('/').some(p => p === '.' || p === '..'); }
    catch { return false; }
});
const listParams = z.object({ q: z.string().trim().max(100).optional(), offset: z.number().int().min(0).max(10000).optional(), limit: z.number().int().min(1).max(48).optional() }).strict();
const programParams = listParams.extend({ institutionId: z.union([z.string().min(1).max(128), z.number().int().positive()]).optional() }).strict();
const detailParams = z.object({ path }).strict();
const binding = <T extends string, S extends z.ZodTypeAny>(queryId: T, params: S) => z.object({ version: z.literal(1), queryId: z.literal(queryId), params }).strict();
/** Authoring requests only. Public route parameters/approval are a later boundary. */
export const directoryQueryBindingSchema = z.discriminatedUnion('queryId', [
    binding('directory.institution.list', listParams), binding('directory.program.list', programParams), binding('directory.city.list', listParams),
    binding('directory.institution.detail', detailParams), binding('directory.program.detail', detailParams),
    binding('directory.article.list', listParams), binding('directory.article.detail', detailParams),
]);
export type DirectoryQueryBinding = z.infer<typeof directoryQueryBindingSchema>;
export const directoryRecordBindingSchema = z.object({
    text: z.enum(['title', 'summary', 'body', 'byline', 'publishedAt']).optional(), href: z.literal('originalPath').optional(),
    blocks: z.literal('body').optional(),
    src: z.enum(['cover', 'logo']).optional(), alt: z.enum(['title','coverAlt']).optional(),
}).strict();

/** Validate saved nodes without fetching rows. Avoid nested query multiplication. */
export function directoryLayoutQueries(layout: PageLayoutData): { id: string; binding: DirectoryQueryBinding }[] {
    const requests: { id: string; binding: DirectoryQueryBinding }[] = []; let visited = 0;
    const walk = (nodes: PageComponent[], inQuery = false, depth = 0, articleQuery = false) => {
        if (depth > 20) throw new Error('directory_template_depth');
        for (const node of nodes) {
            if (++visited > 2000) throw new Error('directory_template_size');
            const props = node.props || {}; let isArticle = false;
            if (props.directoryQuery !== undefined) {
                if (inQuery || requests.length >= 8 || requests.some(r => r.id === node.id) || props.binding || node.binding) throw new Error('ambiguous_directory_query');
                const query = directoryQueryBindingSchema.parse(props.directoryQuery);
                isArticle = query.queryId === 'directory.article.detail';
                if (node.type !== (query.queryId.endsWith('.list') ? 'Repeater' : 'Container')) throw new Error('invalid_directory_query_component');
                requests.push({ id: node.id, binding: query });
            }
            if (props.recordBindings !== undefined) {
                if (!inQuery) throw new Error('record_binding_without_query');
                const record = directoryRecordBindingSchema.parse(props.recordBindings);
                if (record.text && !['Text', 'Heading', 'Paragraph', 'Link'].includes(node.type)
                    || record.href && node.type !== 'Link' || (record.src || record.alt) && node.type !== 'Image'
                    || record.blocks && (node.type !== 'Container' || !articleQuery || Object.keys(record).length !== 1 || (node.children?.length ?? 0) > 0)
                    || props.siteBindings !== undefined) throw new Error('invalid_record_binding_component');
            }
            walk(node.children || [], inQuery || props.directoryQuery !== undefined, depth + 1, articleQuery || isArticle);
        }
    };
    walk(layout?.content || []); return requests;
}

const literal = (value: unknown) => typeof value === 'string' ? value.replace(/\{(?=[{%])/g, '{\u200b') : '';
const imageUrl = (value: unknown) => {
    if (typeof value !== 'string' || /["'<>\\\x00-\x20]/.test(value)) return '';
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};

/** Transient plain-component projection through the SAME renderer; never save its rows. */
export function projectDirectoryRecords<T extends PageLayoutData>(layout: T, records: Map<string, Record<string, unknown>[]>): T {
    directoryLayoutQueries(layout);
    let projected = 0;
    const walk = (node: PageComponent, row?: Record<string, unknown>, index = 0): PageComponent => {
        if (++projected > 4000) throw new Error('directory_projection_size');
        const props = { ...node.props }; const query = props.directoryQuery;
        if (query !== undefined) {
            const parsed = directoryQueryBindingSchema.parse(query); const rows = records.get(node.id);
            if (!rows || rows.length > (parsed.queryId.endsWith('.list') ? 48 : 1)) throw new Error('directory_records_unavailable');
            const { directoryQuery: _query, ...rest } = props;
            const list = parsed.queryId.endsWith('.list'); const columns = Math.min(4, Math.max(1, Number(props.columns) || 3));
            if (list) rest.className = `${typeof rest.className === 'string' ? rest.className : ''} ${props.layout === 'list' ? 'flex flex-col' : `grid grid-cols-1 ${columns > 1 ? 'md:grid-cols-2' : ''} ${columns > 2 ? `lg:grid-cols-${Math.floor(columns)}` : ''}`} gap-6`;
            return { ...node, type: 'Container', props: rest,
                ...(list ? { styles: { gap: '24px', ...node.styles } } : {}),
                children: rows.length ? rows.flatMap((record, i) => (node.children || []).map(child => walk(child, record, i)))
                    : [{ id: `${node.id}-empty`, type: 'Text', props: { text: 'No records matched this preview.' } }] };
        }
        const id = index ? `${node.id}-preview-${index}` : node.id;
        const { recordBindings: _bindings, ...rest } = props;
        if (props.recordBindings !== undefined) {
            const b = directoryRecordBindingSchema.parse(props.recordBindings);
            if (!row) throw new Error('record_context_unavailable');
            if (b.blocks) { const children = projectEditorialBody(row.body, id); projected += children.reduce((n,c) => n + 1 + (c.children?.length ?? 0), 0); if (projected > 4000) throw new Error('directory_projection_size'); return { ...node, id, props: rest, children }; }
            if (b.text) { delete rest.content; delete rest.value; rest.text = literal(row[b.text]); }
            if (b.href) rest.href = path.safeParse(row.originalPath).success ? row.originalPath : '';
            if (b.src) { delete rest.url; rest.src = imageUrl(row[b.src]); }
            if (b.alt) rest.alt = literal(row[b.alt]);
        }
        return { ...node, id, props: rest, ...(node.children ? { children: node.children.map(child => walk(child, row, index)) } : {}) };
    };
    return { ...layout, content: layout.content.map(node => walk(node)) };
}
