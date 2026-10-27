import { z } from 'zod';

/** A bounded interchange tree for the initial contract; existing editor formats need explicit adapters. */
export type LocalizedRichNode = { kind: 'text'; id: string; text: string } | {
    kind: 'element'; id: string; tag: 'p' | 'span' | 'strong' | 'em' | 'a' | 'ul' | 'ol' | 'li' | 'blockquote' | 'code' | 'h1' | 'h2' | 'h3' | 'br';
    href?: string; children: LocalizedRichNode[];
};
const nodeId = z.string().min(1).max(160);
const nodeSchema: z.ZodType<LocalizedRichNode> = z.lazy(() => z.union([
    z.object({ kind: z.literal('text'), id: nodeId, text: z.string().max(100_000) }).strict(),
    z.object({ kind: z.literal('element'), id: nodeId, tag: z.enum(['p', 'span', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'h1', 'h2', 'h3', 'br']),
        href: z.string().max(8192).optional(), children: z.array(nodeSchema).max(4096) }).strict(),
]));
const documentSchema = z.object({ version: z.literal(1), children: z.array(nodeSchema).max(4096) }).strict();
const patchesSchema = z.array(z.object({ id: nodeId, text: z.string().max(100_000) }).strict()).max(4096);

function readDocument(raw: unknown) {
    // Reject depth/cycles and aggregate size before the recursive schema sees untrusted trees.
    const todo: { value: unknown; depth: number }[] = [{ value: raw, depth: 0 }];
    const seen = new Set<object>();
    let bytes = 0, nodes = 0;
    while (todo.length) {
        const { value, depth } = todo.pop()!;
        if (!value || typeof value !== 'object') throw Error('invalid_rich_text_tree');
        if (depth > 24 || ++nodes > 4097 || seen.has(value)) throw Error('rich_text_tree_limit');
        seen.add(value);
        const object = value as Record<string, unknown>;
        if (typeof object.text === 'string') bytes += new TextEncoder().encode(object.text).length;
        if (bytes > 1_000_000) throw Error('rich_text_payload_limit');
        if (Array.isArray(object.children)) {
            if (object.children.length > 4096) throw Error('rich_text_tree_limit');
            for (const child of object.children) todo.push({ value: child, depth: depth + 1 });
        }
    }
    const document = documentSchema.parse(raw), ids = new Set<string>();
    const walk = (node: LocalizedRichNode) => {
        if (ids.has(node.id)) throw Error('duplicate_rich_text_id');
        ids.add(node.id);
        if (node.kind === 'element') {
            // Original links remain protected data. No executable URL schemes in this interchange format.
            if (node.href && (!/^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(node.href) || /[\u0000-\u0020\\]/.test(node.href))) throw Error('unsafe_rich_text_link');
            if (node.href && node.tag !== 'a') throw Error('unexpected_rich_text_link');
            node.children.forEach(walk);
        }
    };
    document.children.forEach(walk);
    return document;
}
function references(text: string): string[] {
    return [...text.matchAll(/\{\{\s*[^{}]+?\s*\}\}/g)].map(match => match[0].replace(/\s/g, '')).sort();
}
export function extractRichTextSegments(raw: unknown) {
    const document = readDocument(raw), segments: { id: string; text: string; ancestors: string[] }[] = [];
    const walk = (node: LocalizedRichNode, ancestors: string[]) => {
        if (node.kind === 'text') segments.push({ id: node.id, text: node.text, ancestors });
        else node.children.forEach(child => walk(child, [...ancestors, node.tag]));
    };
    document.children.forEach(node => walk(node, []));
    return segments;
}
/** Return a new tree; AI may replace text only, never tags, IDs, structure or original links. */
export function applyRichTextTranslations(raw: unknown, patchInput: unknown) {
    const document = readDocument(raw), patches = patchesSchema.parse(patchInput);
    const replacements = new Map<string, string>();
    let bytes = 0;
    for (const patch of patches) {
        bytes += new TextEncoder().encode(patch.text).length;
        if (bytes > 1_000_000) throw Error('rich_text_payload_limit');
        if (replacements.has(patch.id)) throw Error('duplicate_rich_text_patch');
        replacements.set(patch.id, patch.text);
    }
    const walk = (node: LocalizedRichNode): LocalizedRichNode => {
        if (node.kind === 'element') return { ...node, children: node.children.map(walk) };
        const text = replacements.get(node.id);
        if (text === undefined) throw Error('missing_rich_text_translation');
        if (JSON.stringify(references(text)) !== JSON.stringify(references(node.text))) throw Error('changed_rich_text_references');
        replacements.delete(node.id);
        return { ...node, text };
    };
    const translated = { ...document, children: document.children.map(walk) };
    if (replacements.size) throw Error('unknown_rich_text_patch');
    return translated;
}
