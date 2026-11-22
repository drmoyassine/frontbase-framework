import type { PageComponent, PageLayoutData } from './ssr/types.js';
import type { StylesData } from './ssr/components/lib/styles.js';
import { directoryLiquidField, institutionDetailFields, programDetailFields } from './directory/detail-fields.js';

export type LayoutViewport = 'desktop' | 'tablet' | 'mobile';
export type LayoutStyle =
    | { property: 'horizontalAlign' | 'textAlign'; value: 'left' | 'center' | 'right' }
    | { property: 'fontWeight'; value: '400' | '700' }
    | { property: 'fontStyle'; value: 'normal' | 'italic' };
export type InlineEmphasis = { phrase: string; mark: 'bold' | 'italic'; prefix?: string; suffix?: string };
export type LayoutDraftOperation =
    | { kind: 'move'; id: string; siblingId: string; placement: 'before' | 'after' }
    | { kind: 'resize'; id: string; viewport: LayoutViewport; width: number }
    | { kind: 'match'; id: string; viewport: LayoutViewport; width: number; offset: number }
    | { kind: 'text'; id: string; value: string }
    | { kind: 'variable'; id: string; position: 'before' | 'after'; path: string | null }
    | ({ kind: 'style'; id: string; viewport: LayoutViewport } & LayoutStyle)
    | ({ kind: 'emphasis'; id: string; enabled: boolean } & InlineEmphasis);

const tileTypes = new Set(['Container', 'Section', 'Row', 'Column', 'Flex', 'Stack', 'Box', 'Paper', 'Panel', 'Group', 'Gallery', 'Image']);
const textTypes = new Set(['Text', 'Heading', 'Paragraph']);
const textKey = (props: PageComponent['props']) => (['content', 'text', 'value'] as const)
    .find(key => typeof props?.[key] === 'string' && props[key]) ?? 'text';
const literalText = (node: PageComponent) => {
    if (node.binding || node.props?.binding || node.props?.recordBindings || node.props?.siteBindings) return undefined;
    const aliases = ['content','text','value'].map(key => node.props?.[key]).filter(value => value !== undefined && value !== '');
    if (aliases.length > 1 || aliases.some(value => typeof value !== 'string' || /\{[{%]/.test(value))) return undefined;
    return String(node.props?.[textKey(node.props)] ?? '');
};

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
        emphasis: InlineEmphasis[]; editableText?: string; variables?: { before: string; after: string }; recordFields?: readonly string[] }[] = [];
    const walk = (nodes: PageComponent[], parentId: string | null, scope?: 'program' | 'institution') => {
        for (const node of nodes) {
            if (node.versions?.length || ['Repeater', 'DataTable', 'DataGrid'].includes(node.type)) continue;
            const text = textTypes.has(node.type);
            const query = (node.props?.directoryQuery as { queryId?: string } | undefined)?.queryId;
            const directoryScope = query === 'directory.program.detail' ? 'program' : query === 'directory.institution.detail' ? 'institution' : scope;
            if ((text || tileTypes.has(node.type)) && node.stylesData?.stylingMode !== 'css') {
                const percent = (value: unknown) => /^\d+(\.\d+)?%$/.test(String(value)) ? Number(String(value).slice(0, -1)) : undefined;
                const overrides = node.stylesData?.viewportOverrides ?? node.styles?.viewportOverrides;
                const heading = node.children?.find(child => child.type === 'Heading')?.props;
                const formatting = (styles?: Record<string, unknown>) => Object.fromEntries(
                    ['horizontalAlign', 'textAlign', 'fontWeight', 'fontStyle', 'marginLeft', 'marginInlineStart', 'boxSizing'].filter(key => styles?.[key] !== undefined)
                        .map(key => [key, styles![key]]));
                tiles.push({
                    id: node.id, elementId: String(node.props?.anchor || node.id), parentId, text,
                    label: String(node.props?._layerName || heading?.text || heading?.content || node.props?.anchor || node.type).slice(0, 80),
                    formatting: { desktop: formatting({ ...node.styles, ...node.stylesData?.values }),
                        tablet: formatting(overrides?.tablet), mobile: formatting(overrides?.mobile) },
                    emphasis: text ? inlineEmphasis(node.props?.inlineEmphasis) : [],
                    ...(text ? { variables: { before: String(node.props?.inlineBefore ?? ''), after: String(node.props?.inlineAfter ?? '') },
                        ...(directoryScope ? {recordFields:['title','summary','body',...((node.props?.recordBindings as { relatedQuery?: string } | undefined)?.relatedQuery || directoryScope==='institution' ? institutionDetailFields : programDetailFields)]} : {}),
                        editableText: literalText(node) } : {}),
                    widths: {
                        desktop: percent(node.stylesData?.values?.maxWidth ?? node.styles?.maxWidth),
                        tablet: percent(overrides?.tablet?.maxWidth),
                        mobile: percent(overrides?.mobile?.maxWidth),
                    },
                });
            }
            if (node.children?.length) walk(node.children, node.id, directoryScope);
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
        if (!sibling || sibling.parentId !== tile.parentId || sibling.id === tile.id) return null;
    } else if (operation.kind === 'resize') {
        if (tile.text || !Number.isFinite(operation.width) || operation.width < 1 || operation.width > 100) return null;
    } else if (operation.kind === 'match') {
        if (tile.text || !Number.isFinite(operation.width) || !Number.isFinite(operation.offset) ||
            operation.width < 1 || operation.offset < 0 || operation.width + operation.offset > 100.001) return null;
    } else if (operation.kind === 'text') {
        if (tile.editableText === undefined || operation.value.length > 12000 || /\{[{%]/.test(operation.value)) return null;
    } else if (operation.kind === 'variable') {
        const field = directoryLiquidField(`{{ ${operation.path} }}`);
        if (!tile.text || operation.path !== null && !/^(page|system)\.[a-zA-Z_][\w.]{0,100}$/.test(operation.path) &&
            !(field && tile.recordFields?.includes(field))) return null;
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
        } else if (operation.kind === 'text') {
            const props = { ...node.props };
            const key = textKey(props);
            props[key] = operation.value;
            result[index] = { ...node, props };
        } else if (operation.kind === 'variable') {
            const props = { ...node.props };
            const key = operation.position === 'before' ? 'inlineBefore' : 'inlineAfter';
            if (operation.path) props[key] = `{{ ${operation.path} }}`; else delete props[key];
            result[index] = { ...node, props };
        } else if (operation.kind === 'emphasis') {
            const { phrase, mark, prefix, suffix } = operation;
            const emphasis = inlineEmphasis(node.props?.inlineEmphasis).filter(item =>
                item.phrase !== phrase || item.mark !== mark || item.prefix !== prefix || item.suffix !== suffix);
            if (operation.enabled) emphasis.push({ phrase, mark, ...(prefix ? { prefix } : {}), ...(suffix ? { suffix } : {}) });
            result[index] = { ...node, props: { ...node.props, inlineEmphasis: emphasis.slice(-16) } };
        } else {
            const stylesData: StylesData = { stylingMode: 'visual', activeProperties: [], values: {}, ...node.stylesData };
            const size = operation.kind === 'resize' || operation.kind === 'match'
                ? { width: operation.width + '%', maxWidth: operation.width + '%', ...(operation.kind === 'match'
                    ? { boxSizing: 'border-box', horizontalAlign: 'start', marginInlineStart: operation.offset + '%', marginInlineEnd: 'auto' } : {}) }
                : { [operation.property]: operation.value, ...(operation.property === 'textAlign' && node.type === 'Text' &&
                    !node.stylesData?.values?.display && !node.styles?.display ? { display: 'block' } : {}) };
            const alignManually = operation.kind === 'style' && operation.property === 'horizontalAlign';
            const withStyle = (previous?: Record<string, unknown>) => {
                const values = { ...previous };
                if (alignManually || operation.kind === 'match') {
                    delete values.marginLeft; delete values.marginRight;
                    delete values.marginInlineStart; delete values.marginInlineEnd;
                }
                return { ...values, ...size };
            };
            if (operation.viewport === 'desktop') {
                stylesData.values = withStyle(stylesData.values);
                stylesData.activeProperties = [...new Set([...(stylesData.activeProperties ?? []), ...Object.keys(size)])];
            } else {
                const overrides = stylesData.viewportOverrides ?? node.styles?.viewportOverrides ?? {};
                stylesData.viewportOverrides = { ...overrides, [operation.viewport]: withStyle(overrides[operation.viewport]) };
            }
            // Creating stylesData must not shadow legacy breakpoint overrides.
            stylesData.viewportOverrides ??= node.styles?.viewportOverrides;
            result[index] = { ...node, stylesData };
        }
        return result;
    };
    return { ...layout, content: change(layout.content) };
}
