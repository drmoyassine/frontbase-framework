import type { PageComponent, PageLayoutData } from './ssr/types.js';
import type { StylesData } from './ssr/components/lib/styles.js';

export type LayoutViewport = 'desktop' | 'tablet' | 'mobile';
export type LayoutStyle =
    | { property: 'horizontalAlign' | 'textAlign'; value: 'left' | 'center' | 'right' }
    | { property: 'fontWeight'; value: '400' | '700' }
    | { property: 'fontStyle'; value: 'normal' | 'italic' };
export type InlineEmphasis = { phrase: string; mark: 'bold' | 'italic'; prefix?: string; suffix?: string };
export type LayoutDraftOperation =
    | { kind: 'move'; id: string; siblingId: string; placement: 'before' | 'after' }
    | { kind: 'resize'; id: string; viewport: LayoutViewport; width: number }
    | ({ kind: 'style'; id: string; viewport: LayoutViewport } & LayoutStyle)
    | ({ kind: 'emphasis'; id: string; enabled: boolean } & InlineEmphasis);

const tileTypes = new Set(['Container', 'Section', 'Row', 'Column', 'Flex', 'Stack', 'Box', 'Paper', 'Panel', 'Group', 'Gallery', 'Image']);
const textTypes = new Set(['Text', 'Heading', 'Paragraph']);

export function inlineEmphasis(value: unknown): InlineEmphasis[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 16).filter(item => item && typeof item.phrase === 'string' && item.phrase.trim() &&
        item.phrase.length <= 240 && (item.mark === 'bold' || item.mark === 'italic') &&
        [item.prefix, item.suffix].every(part => part === undefined || (typeof part === 'string' && part.length <= 40)))
        .map(({ phrase, mark, prefix, suffix }) => ({ phrase, mark, ...(prefix ? { prefix } : {}), ...(suffix ? { suffix } : {}) }));
}

export function layoutDraftTiles(layout: PageLayoutData) {
    const tiles: { id: string; elementId: string; parentId: string | null; label: string; text: boolean;
        widths: Partial<Record<LayoutViewport, number>>; formatting: Partial<Record<LayoutViewport, Record<string, unknown>>>;
        emphasis: InlineEmphasis[] }[] = [];
    const walk = (nodes: PageComponent[], parentId: string | null) => {
        for (const node of nodes) {
            if (node.versions?.length || ['Repeater', 'DataTable', 'DataGrid'].includes(node.type)) continue;
            const text = textTypes.has(node.type);
            if ((text || tileTypes.has(node.type)) && node.stylesData?.stylingMode !== 'css') {
                const percent = (value: unknown) => /^\d+%$/.test(String(value)) ? Number(String(value).slice(0, -1)) : undefined;
                const overrides = node.stylesData?.viewportOverrides ?? node.styles?.viewportOverrides;
                const heading = node.children?.find(child => child.type === 'Heading')?.props;
                const formatting = (styles?: Record<string, unknown>) => Object.fromEntries(
                    ['horizontalAlign', 'textAlign', 'fontWeight', 'fontStyle'].filter(key => styles?.[key] !== undefined)
                        .map(key => [key, styles![key]]));
                tiles.push({
                    id: node.id, elementId: String(node.props?.anchor || node.id), parentId, text,
                    label: String(node.props?._layerName || heading?.text || heading?.content || node.props?.anchor || node.type).slice(0, 80),
                    formatting: { desktop: formatting({ ...node.styles, ...node.stylesData?.values }),
                        tablet: formatting(overrides?.tablet), mobile: formatting(overrides?.mobile) },
                    emphasis: text ? inlineEmphasis(node.props?.inlineEmphasis) : [],
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

/** Change layout and presentation without altering component identities or live bindings. */
export function applyLayoutDraftOperation<T extends PageLayoutData>(layout: T, operation: LayoutDraftOperation): T | null {
    const tiles = layoutDraftTiles(layout);
    const tile = tiles.find(candidate => candidate.id === operation.id);
    if (!tile) return null;
    if (operation.kind === 'move') {
        const sibling = tiles.find(candidate => candidate.id === operation.siblingId);
        if (!sibling || tile.text || sibling.text || sibling.parentId !== tile.parentId || sibling.id === tile.id) return null;
    } else if (operation.kind === 'resize') {
        if (tile.text || !Number.isInteger(operation.width) || operation.width < 25 || operation.width > 100) return null;
    } else if (operation.kind === 'style') {
        if (tile.text === (operation.property === 'horizontalAlign')) return null;
    } else if (!tile.text || !inlineEmphasis([operation]).length) return null;

    const change = (nodes: PageComponent[]): PageComponent[] => {
        const index = nodes.findIndex(node => node.id === tile.id);
        if (index < 0) return nodes.map(node => node.children ? { ...node, children: change(node.children) } : node);
        const result = nodes.slice();
        const node = result[index]!;
        if (operation.kind === 'move') {
            result.splice(index, 1);
            const target = result.findIndex(sibling => sibling.id === operation.siblingId);
            result.splice(target + (operation.placement === 'after' ? 1 : 0), 0, node);
        } else if (operation.kind === 'emphasis') {
            const { phrase, mark, prefix, suffix } = operation;
            const emphasis = inlineEmphasis(node.props?.inlineEmphasis).filter(item =>
                item.phrase !== phrase || item.mark !== mark || item.prefix !== prefix || item.suffix !== suffix);
            if (operation.enabled) emphasis.push({ phrase, mark, ...(prefix ? { prefix } : {}), ...(suffix ? { suffix } : {}) });
            result[index] = { ...node, props: { ...node.props, inlineEmphasis: emphasis.slice(-16) } };
        } else {
            const stylesData: StylesData = { stylingMode: 'visual', activeProperties: [], values: {}, ...node.stylesData };
            const size = operation.kind === 'resize'
                ? { width: operation.width + '%', maxWidth: operation.width + '%' }
                : { [operation.property]: operation.value, ...(operation.property === 'textAlign' && node.type === 'Text' &&
                    !node.stylesData?.values?.display && !node.styles?.display ? { display: 'block' } : {}) };
            if (operation.viewport === 'desktop') {
                stylesData.values = { ...stylesData.values, ...size };
                stylesData.activeProperties = [...new Set([...(stylesData.activeProperties ?? []), ...Object.keys(size)])];
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
