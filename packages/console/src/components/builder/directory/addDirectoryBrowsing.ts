import type { Page, ComponentData } from '@/types/builder';

export function hasDirectoryBrowsing(nodes: ComponentData[]): boolean {
    return nodes.some(node => node.props.directoryBrowsing !== undefined || hasDirectoryBrowsing(node.children || []));
}

/** Editable position/style/options, with no fetched rows or transient request state. */
export function addDirectoryBrowsing(page: Page): NonNullable<Page['layoutData']> {
    const old = page.layoutData;
    if (!old || !['directory', 'article-index'].includes(String((old.root.siteConfiguration as {role?:string} | undefined)?.role))) throw new Error('Link an index page first');
    if (hasDirectoryBrowsing(old.content)) return old;
    const control: ComponentData = { id: crypto.randomUUID(), type: 'Container',
        props: { title: 'Directory browsing', directoryBrowsing: { version: 1, tabs: true, search: true, pagination: true } },
        styles: { padding: '24px', width: '100%', boxSizing: 'border-box' }, children: [],
    };
    const firstQuery = old.content.findIndex(node => node.props.directoryQuery !== undefined);
    const index = firstQuery < 0 ? old.content.length : firstQuery;
    return { ...old, content: [...old.content.slice(0, index), control, ...old.content.slice(index)] };
}
