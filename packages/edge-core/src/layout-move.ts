import type { PageComponent } from './ssr/types.js';

/** Drop boundaries are measured before removing the source node. */
export function moveInsertionIndex(source: number, boundary: number, sharedParent: boolean): number {
    return sharedParent && source < boundary ? boundary - 1 : boundary;
}

/** Resolve both endpoints in the authored version selected by the editor. */
export function moveLayoutNode(content: PageComponent[], id: string, parentId: string | undefined,
    boundary: number, versions: Readonly<Record<string, string>> = {}): PageComponent[] | null {
    type Location = { node: PageComponent; list: PageComponent[]; index: number; locked: boolean };
    const found = new Map<string, Location>();
    const duplicates = new Set<string>();
    const selected = (node: PageComponent) => node.versions?.find(version => version.id === versions[node.id]);
    const walk = (list: PageComponent[], locked: boolean) => list.forEach((node, index) => {
        if (found.has(node.id)) duplicates.add(node.id);
        found.set(node.id, { node, list, index, locked });
        const version = selected(node);
        const children = version?.overrides.children ?? node.children;
        if (children) walk(children, locked || !!version && !version.overrides.children);
    });
    walk(content, false);
    const source = found.get(id);
    const parent = parentId === undefined ? undefined : found.get(parentId);
    if (!source || source.locked || duplicates.has(id) || (parentId !== undefined && (!parent || duplicates.has(parentId)))) return null;
    const targetVersion = parent && selected(parent.node);
    if (parent?.locked || targetVersion && !targetVersion.overrides.children) return null;
    const children = parent ? targetVersion?.overrides.children ?? parent.node.children : content;
    const target = children ?? [];
    const contains = (node: PageComponent): boolean => node.id === parentId ||
        (node.children ?? []).some(contains) || (node.versions ?? []).some(version => version.overrides.children?.some(contains));
    if (parent && contains(source.node)) return null;
    if (!Number.isInteger(boundary) || boundary < -1 || boundary > target.length) return null;
    const sharedParent = source.list === target;
    const index = moveInsertionIndex(source.index, boundary === -1 ? target.length : boundary, sharedParent);
    if (sharedParent && index === source.index) return content;

    const replace = (list: PageComponent[]): PageComponent[] => {
        const next = list.flatMap((node, position) => {
            if (list === source.list && position === source.index) return [];
            const version = selected(node);
            const current = version?.overrides.children ?? node.children;
            const updated = current ? replace(current) : node === parent?.node ? [source.node] : current;
            if (updated === current) return [node];
            if (version?.overrides.children) return [{ ...node, versions: node.versions!.map(item =>
                item === version ? { ...item, overrides: { ...item.overrides, children: updated } } : item) }];
            return [{ ...node, children: updated }];
        });
        if (list === target) next.splice(index, 0, source.node);
        return next.length === list.length && next.every((node, position) => node === list[position]) ? list : next;
    };
    return replace(content);
}
