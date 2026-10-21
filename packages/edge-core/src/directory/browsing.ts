import { z } from 'zod';
import type { PageComponent, PageLayoutData } from '../ssr/types.js';

export const directoryBrowsingSchema = z.object({
    version: z.literal(1), tabs: z.boolean(), search: z.boolean(), pagination: z.boolean(),
    paginationMode:z.enum(['previous-next','numbered']).optional(), paginationPosition:z.enum(['top','bottom','both']).optional(),
    recordCount: z.boolean().optional(), sorting: z.boolean().optional(), filters: z.boolean().optional(),
}).strict();
const localPath = z.string().min(1).max(400).refine(value => {
    try { const decoded = decodeURIComponent(value); return value.startsWith('/') && !decoded.startsWith('//')
        && !/[\\?#{}\s\x00-\x20]/.test(decoded) && !decoded.split('/').some(p => p === '.' || p === '..'); }
    catch { return false; }
});
/** Transient captured-request state. An array keeps visitor text out of Liquid resolution.
 *  `labels` is display-only chrome localization injected by the localization layer, never authored.
 *  `locale` threads the SERVE language so plural-category selection matches the released pattern
 *  language (capture paths keep the site locale — patterns are language-neutral, categories are not). */
export const directoryBrowsingStateSchema = z.tuple([z.object({
    path: localPath, collection: z.enum(['institution', 'program']).nullable(),
    q: z.string().max(100), searchEnabled: z.boolean(), page: z.number().int().min(1).max(20000),
    hasNext: z.boolean(), total: z.number().int().min(0).optional(), pageSize: z.number().int().min(1).max(48).optional(),
    sort: z.enum(['title-asc','title-desc']).optional(), match: z.enum(['contains','startsWith','equals']).optional(),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    locale: z.string().max(35).refine(value => /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)).optional(),
    labels: z.record(z.string().max(12000)).optional(),
}).strict()]);
export type DirectoryBrowsingState = z.infer<typeof directoryBrowsingStateSchema>;

export function validateDirectoryBrowsing(node: PageComponent, inQuery: boolean): void {
    if (node.props?.directoryBrowsingState !== undefined) throw new Error('transient_browsing_state');
    if (node.props?.directoryBrowsing === undefined) return;
    directoryBrowsingSchema.parse(node.props.directoryBrowsing);
    if (node.type !== 'Container' || inQuery || node.props.directoryQuery !== undefined || (node.children?.length ?? 0)) {
        throw new Error('invalid_directory_browsing_component');
    }
}

export function projectDirectoryBrowsing(layout: PageLayoutData, state: DirectoryBrowsingState): PageLayoutData {
    const parsed = directoryBrowsingStateSchema.parse(state);
    const walk = (nodes: PageComponent[]): PageComponent[] => nodes.map(node => ({ ...node,
        ...(node.props?.directoryBrowsing !== undefined ? { props: { ...node.props, directoryBrowsingState: [{...parsed[0],searchEnabled:(node.props.directoryBrowsing as any).search}] } } : {}),
        ...(node.children ? { children: walk(node.children) } : {}),
    }));
    return { ...layout, content: walk(layout.content) };
}
