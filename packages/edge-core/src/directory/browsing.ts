import { z } from 'zod';
import type { PageComponent, PageLayoutData } from '../ssr/types.js';

export const directoryBrowsingSchema = z.object({
    version: z.literal(1), tabs: z.boolean(), search: z.boolean(), pagination: z.boolean(),
}).strict();
const localPath = z.string().min(1).max(400).refine(value => {
    try { const decoded = decodeURIComponent(value); return value.startsWith('/') && !decoded.startsWith('//')
        && !/[\\?#{}\s\x00-\x20]/.test(decoded) && !decoded.split('/').some(p => p === '.' || p === '..'); }
    catch { return false; }
});
/** Transient captured-request state. An array keeps visitor text out of Liquid resolution. */
export const directoryBrowsingStateSchema = z.tuple([z.object({
    path: localPath, collection: z.enum(['institution', 'program']).nullable(),
    q: z.string().max(100), searchEnabled: z.boolean(), page: z.number().int().min(1).max(834),
    hasNext: z.boolean(),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
        ...(node.props?.directoryBrowsing !== undefined ? { props: { ...node.props, directoryBrowsingState: parsed } } : {}),
        ...(node.children ? { children: walk(node.children) } : {}),
    }));
    return { ...layout, content: walk(layout.content) };
}
