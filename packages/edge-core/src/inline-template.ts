import { z } from 'zod';
import type { PageComponent } from './ssr/types.js';
import { directoryLiquidField, institutionDetailFields, programDetailFields } from './directory/detail-fields.js';

export const inlineTemplateTypes = new Set(['Text', 'Heading', 'Paragraph', 'Link', 'Button']);
const variablePattern = /^(?:record\.[a-zA-Z]\w*|record\.columns\.[A-Za-z_][A-Za-z0-9_]{0,62}|(?:page|system)\.[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*|query\.[\w-]+\.total|lists\.[a-z][a-z0-9_]{0,63}\.count)$/;
export const detailBindingColumnSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/)
    .refine(name => !['__proto__', 'constructor', 'prototype'].includes(name));
export const maxDetailBindingColumns = 64;
export const detailBindingColumnsSchema = z.array(detailBindingColumnSchema).max(maxDetailBindingColumns)
    .refine(columns => new Set(columns).size === columns.length);
export const detailBindingRoles = ['institution', 'program'] as const;
export type DetailBindingRole = typeof detailBindingRoles[number];
export type DetailBindingColumns = Partial<Record<DetailBindingRole, readonly string[]>>;

function detailQueryRole(queryId: string | undefined): DetailBindingRole | undefined {
    return detailBindingRoles.find(role => queryId === `directory.${role}.detail`);
}

export function detailBindingColumn(path: string): string | undefined {
    const match = /^record\.columns\.([A-Za-z_][A-Za-z0-9_]{0,62})$/.exec(path)?.[1];
    return match && !['__proto__', 'constructor', 'prototype'].includes(match) ? match : undefined;
}
const markSchema = z.enum(['bold', 'italic']);
const rangeSchema = z.object({ start: z.number().int().min(0).max(12000), text: z.string().min(1).max(12000), mark: markSchema }).strict();
export const inlineTemplateSchema = z.array(z.union([
    z.object({ text: z.string().max(12000).refine(value => !/\{[{%]/.test(value)), emphasis: z.array(rangeSchema).max(32).optional(),
        translationSlot: z.string().regex(/^(?:\d{1,2}|literal-\d{1,4})$/).optional() }).strict(),
    z.object({ variable: z.string().max(180).regex(variablePattern), marks: z.array(markSchema).max(2).optional() }).strict(),
])).max(32).refine(parts => parts.reduce((length, part) => length + ('text' in part ? part.text.length : 0), 0) <= 12000)
    .refine(parts => {
        const slots = parts.flatMap((part, index) => 'text' in part ? [part.translationSlot ?? String(index)] : []);
        return new Set(slots).size === slots.length;
    });
export type InlineTemplate = z.infer<typeof inlineTemplateSchema>;
export type InlineMark = z.infer<typeof markSchema>;

export function inlineMarkRuns(text: string, emphasis: { start: number; text: string; mark: InlineMark }[] = []) {
    const ranges = emphasis.filter(range => range && Number.isInteger(range.start) && range.start >= 0 &&
        typeof range.text === 'string' && range.text.length > 0 && text.slice(range.start, range.start + range.text.length) === range.text);
    const points = [...new Set([0, text.length, ...ranges.flatMap(range => [range.start, range.start + range.text.length])])].sort((a, b) => a - b);
    return points.slice(0, -1).map((start, index) => ({
        text: text.slice(start, points[index + 1]),
        marks: [...new Set(ranges.filter(range => range.start <= start && range.start + range.text.length >= points[index + 1]!).map(range => range.mark))],
    }));
}

export function inlineQueryId(variable: string): string | undefined {
    return /^query\.([\w-]+)\.total$/.exec(variable)?.[1];
}

export function listCountAlias(variable: string): string | undefined {
    return /^lists\.([a-z][a-z0-9_]{0,63})\.count$/.exec(variable)?.[1];
}

export interface ListCount { id: string; alias: string; label: string }

export function inlineVariableAllowed(path: string, fields: readonly string[], lists: readonly ListCount[] = []): boolean {
    if (!variablePattern.test(path)) return false;
    if (path.startsWith('record.')) return fields.includes(path.slice(7));
    const alias = listCountAlias(path);
    if (alias) return lists.some(list => list.alias === alias);
    return /^(page|system)\./.test(path);
}

/** Count-capable directory lists. The default alias comes from the collection,
 * while the builder layer name remains the editor-facing label. */
export function listCounts(nodes: PageComponent[]): ListCount[] {
    const candidates: (ListCount & { base: string; explicit: boolean })[] = [];
    const collect = (children: PageComponent[]) => { for (const node of children) {
        const query = (node.props?.directoryQuery as { queryId?: string } | undefined)?.queryId;
        const collection = /^directory\.(institution|program|article|city)\.list$/.exec(query ?? '')?.[1];
        if (node.type === 'Repeater' && collection && /^[\w-]+$/.test(node.id)) {
            const base = collection === 'city' ? 'cities' : collection + 's';
            const requested = node.props?.listAlias;
            const explicit = typeof requested === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(requested) &&
                !['constructor', 'prototype'].includes(requested);
            candidates.push({ id: node.id, alias: explicit ? requested : base, base, explicit,
                label: String(node.props?._layerName || node.id).slice(0, 160) });
        }
        if (node.children) collect(node.children);
    } };
    collect(nodes);
    const used = new Set<string>();
    // Explicit aliases take precedence. Duplicate defaults resolve by element ID
    // so moving a list in the canvas preserves the existing references.
    candidates.sort((a, b) => Number(b.explicit) - Number(a.explicit) || a.id.localeCompare(b.id, 'en'));
    return candidates.map(({id, alias, label, base}) => {
        const suffix = (base + '_' + id.toLowerCase().replace(/[^a-z0-9_]/g, '_')).slice(0, 60);
        for (let index = 1; used.has(alias); index++) alias = suffix + '_' + index;
        used.add(alias);
        return {id, alias, label};
    });
}

export function inlineRecordFields(scope: string | undefined): string[] {
    if (!scope) return [];
    return ['title', 'summary', 'body', ...scope === 'institution' ? institutionDetailFields
        : scope === 'program' ? programDetailFields : ['byline', 'publishedAt']];
}

export function readInlineTemplate(node: PageComponent): InlineTemplate | undefined {
    if (!inlineTemplateTypes.has(node.type) || node.binding || node.props?.binding || node.props?.siteBindings) return;
    const props = node.props ?? {};
    if (props.inlineTemplate !== undefined) {
        const template = inlineTemplateSchema.safeParse(props.inlineTemplate);
        return template.success ? template.data : undefined;
    }
    const primary = props.recordBindings as { text?: string } | undefined;
    const text = (node.type === 'Button' ? [props.label, props.text] : [props.content, props.text, props.value, props.label])
        .find(value => typeof value === 'string' && value) as string | undefined;
    const parts: InlineTemplate = [];
    for (const [index, value] of [props.inlineBefore, text, props.inlineAfter].entries()) {
        if (index === 1 && primary?.text) { parts.push({ variable: 'record.' + primary.text }); continue; }
        if (typeof value !== 'string' || !value) continue;
        if (index !== 1) {
            const variable = /^\{\{\s*([^{}\s]+)\s*\}\}$/.exec(value)?.[1];
            if (!variable || !variablePattern.test(variable)) return;
            if (index === 2) parts.push({ text: ' ' });
            parts.push({ variable });
            if (index === 0) parts.push({ text: ' ' });
        } else if (/\{\{\s*(?:lists\.|record\.columns\.)/.test(value)) {
            const segments = value.split(/\{\{\s*(lists\.[a-z][a-z0-9_]{0,63}\.count|record\.columns\.[A-Za-z_][A-Za-z0-9_]{0,62}|record\.[a-zA-Z]\w*)\s*\}\}/);
            if (segments.some((segment, index) => index % 2 === 0 && /\{[{%]/.test(segment))) return;
            for (const [index, segment] of segments.entries()) if (segment) parts.push(index % 2 ? { variable: segment } : { text: segment });
        } else if (/\{[{%]/.test(value)) {
            const field = directoryLiquidField(value);
            if (!field) return;
            parts.push({ variable: 'record.' + field });
        } else parts.push({ text: value });
    }
    return parts;
}

/** Drop text-only legacy references that the author removed, while retaining
 * independent URL/media bindings and the metadata for a surviving field. */
export function inlineTemplatePatch(node: PageComponent, parts: InlineTemplate): Record<string, unknown> {
    const patch: Record<string, unknown> = { inlineTemplate: parts, inlineBefore: undefined, inlineAfter: undefined };
    const binding = node.props?.recordBindings as { text?: string; relatedQuery?: string; href?: string; src?: string } | undefined;
    if (!binding?.text || parts.some(part => 'variable' in part && part.variable === 'record.'+binding.text)) return patch;
    // A related reference still scopes replacement fields on this element.
    if (binding.relatedQuery && !binding.href && parts.some(part => 'variable' in part && part.variable.startsWith('record.'))) return patch;
    const { text:_text, fallbackText:_fallbackText, format:_format, hideWhenEmpty, relatedQuery, ...rest } = binding as Record<string,unknown>;
    const remaining = { ...rest, ...(binding.href || binding.src ? { hideWhenEmpty, relatedQuery } : {}) };
    patch.recordBindings = Object.keys(remaining).length ? remaining : undefined;
    return patch;
}

export function inlineTemplateScopes(nodes: PageComponent[], detailColumns?: DetailBindingColumns) {
    const queries = listCounts(nodes);
    const result = new Map<string, { fields: string[]; queries: ListCount[]; detailRole?: DetailBindingRole }>();
    const walk = (children: PageComponent[], inherited?: string, inheritedDetail?: DetailBindingRole) => { for (const node of children) {
        const query = node.props?.directoryQuery as { queryId?: string } | undefined;
        const scope = query?.queryId?.split('.')[1] ?? inherited;
        const related = (node.props?.recordBindings as { relatedQuery?: string } | undefined)?.relatedQuery;
        const detail = query?.queryId ? detailQueryRole(query.queryId) : inheritedDetail;
        const detailRole = related ? 'institution' : detail;
        const selected = detailRole ? detailColumns?.[detailRole] : undefined;
        const fields = selected?.map(column => 'columns.' + column) ?? inlineRecordFields(related ? 'institution' : scope);
        if (inlineTemplateTypes.has(node.type)) result.set(node.id, { fields, queries, detailRole });
        if (node.children) walk(node.children, scope, detail);
    } };
    walk(nodes);
    return result;
}

/** Authoring and publication share the same boundary for physical column refs. */
export function validateDetailBindings(layout: {content: PageComponent[]}, columns?: DetailBindingColumns) {
    const used = { institution: new Set<string>(), program: new Set<string>() };
    const walk = (nodes: PageComponent[], inherited?: DetailBindingRole) => { for (const node of nodes) {
        const query = node.props?.directoryQuery as {queryId?: string} | undefined;
        const detail = query?.queryId ? detailQueryRole(query.queryId) : inherited;
        const role = (node.props?.recordBindings as {relatedQuery?: string} | undefined)?.relatedQuery ? 'institution' : detail;
        const parts = readInlineTemplate(node);
        for (const part of parts ?? []) if ('variable' in part && part.variable.startsWith('record.columns.')) {
            const column = detailBindingColumn(part.variable);
            if (!role || !column || !columns?.[role]?.includes(column) || !inlineTemplateTypes.has(node.type))
                throw Error('detail_binding_column_refused');
            used[role].add(column);
        }
        if (node.children) walk(node.children, detail);
        for (const version of node.versions ?? []) {
            const { props, children } = version.overrides;
            if (props || children) walk([{...node, children: children ?? (props?.directoryQuery !== undefined ? node.children : undefined),
                versions: undefined, props: {...node.props,...props}}], inherited);
        }
    } };
    walk(layout.content);
    return used;
}
