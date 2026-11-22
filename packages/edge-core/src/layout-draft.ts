import type { PageComponent, PageLayoutData } from './ssr/types.js';
import type { StylesData } from './ssr/components/lib/styles.js';

export type LayoutViewport = 'desktop' | 'tablet' | 'mobile';
export type LayoutDraftOperation =
    | { kind: 'move'; id: string; siblingId: string; placement: 'before' | 'after' }
    | { kind: 'resize'; id: string; viewport: LayoutViewport; width: number };

const tileTypes = new Set(['Container', 'Section', 'Row', 'Column', 'Flex', 'Stack', 'Box', 'Paper', 'Panel', 'Group', 'Gallery', 'Image']);

export function layoutDraftTiles(layout: PageLayoutData) {
    const tiles: { id: string; elementId: string; parentId: string | null; label: string; widths: Partial<Record<LayoutViewport, number>> }[] = [];
    const walk = (nodes: PageComponent[], parentId: string | null) => {
        for (const node of nodes) {
            if (node.versions?.length || ['Repeater', 'DataTable', 'DataGrid'].includes(node.type)) continue;
            if (tileTypes.has(node.type) && node.stylesData?.stylingMode !== 'css') {
                const percent = (value: unknown) => /^\d+%$/.test(String(value)) ? Number(String(value).slice(0, -1)) : undefined;
                const overrides = node.stylesData?.viewportOverrides ?? node.styles?.viewportOverrides;
                const heading = node.children?.find(child => child.type === 'Heading')?.props;
                tiles.push({
                    id: node.id, elementId: String(node.props?.anchor || node.id), parentId,
                    label: String(node.props?._layerName || heading?.text || heading?.content || node.props?.anchor || node.type).slice(0, 80),
                    widths: {
                        desktop: percent(node.stylesData?.values?.maxWidth ?? node.styles?.maxWidth),
                        tablet: percent(overrides?.tablet?.maxWidth),
                        mobile: percent(overrides?.mobile?.maxWidth),
                    },
                });
            }
            if (node.children?.length) walk(node.children, node.id);
        }
    };
    walk(layout.content, null);
    return tiles;
}

/** Edit only sibling order or size. IDs, component payloads and bindings stay intact. */
export function applyLayoutDraftOperation<T extends PageLayoutData>(layout: T, operation: LayoutDraftOperation): T | null {
    const tiles = layoutDraftTiles(layout);
    const tile = tiles.find(candidate => candidate.id === operation.id);
    if (!tile) return null;
    if (operation.kind === 'move') {
        const sibling = tiles.find(candidate => candidate.id === operation.siblingId);
        if (!sibling || sibling.parentId !== tile.parentId || sibling.id === tile.id) return null;
    } else if (!Number.isInteger(operation.width) || operation.width < 25 || operation.width > 100) return null;

    const change = (nodes: PageComponent[]): PageComponent[] => {
        const index = nodes.findIndex(node => node.id === tile.id);
        if (index < 0) return nodes.map(node => node.children ? { ...node, children: change(node.children) } : node);
        const result = nodes.slice();
        const node = result[index]!;
        if (operation.kind === 'move') {
            result.splice(index, 1);
            const target = result.findIndex(sibling => sibling.id === operation.siblingId);
            result.splice(target + (operation.placement === 'after' ? 1 : 0), 0, node);
        } else {
            const stylesData: StylesData = { stylingMode: 'visual', activeProperties: [], values: {}, ...node.stylesData };
            const size = { width: operation.width + '%', maxWidth: operation.width + '%' };
            if (operation.viewport === 'desktop') {
                stylesData.values = { ...stylesData.values, ...size };
                stylesData.activeProperties = [...new Set([...(stylesData.activeProperties ?? []), 'width', 'maxWidth'])];
            } else {
                const overrides = stylesData.viewportOverrides ?? node.styles?.viewportOverrides ?? {};
                stylesData.viewportOverrides = { ...overrides, [operation.viewport]: { ...overrides[operation.viewport], ...size } };
            }
            // Creating stylesData must not shadow legacy breakpoint overrides.
            stylesData.viewportOverrides ??= node.styles?.viewportOverrides;
            result[index] = { ...node, stylesData };
        }
        return result;
    };
    return { ...layout, content: change(layout.content) };
}
