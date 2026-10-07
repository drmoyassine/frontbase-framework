import { directoryQueryBindingSchema, type DirectoryQueryBinding } from '@frontbase/edge-core/directory/configuration';
import type { Page } from '@/types/builder';

/** Append editable authoring nodes only: no fetched records or datasource credentials. */
export function addDirectoryTemplate(page: Page, binding: DirectoryQueryBinding): NonNullable<Page['layoutData']> {
    const query = directoryQueryBindingSchema.parse(binding); const old = page.layoutData || { root: {}, content: [] };
    if (!old.root.siteConfiguration) throw new Error('Link shared settings first');
    const detail = query.queryId.endsWith('.detail'); const article = query.queryId.startsWith('directory.article.');
    const node = (type: string, props: Record<string, unknown>, styles?: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, props, ...(styles ? { styles } : {}) });
    // Editorial body blocks carry their own 20px margins; keep the blocks container gap-free to avoid double spacing.
    const meta = { color: '#64748b', fontSize: '0.875rem', margin: '0' };
    const card = { ...node('Container', {}, { display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', border: '1px solid #dbe2ea', borderRadius: '16px', backgroundColor: '#ffffff', color: '#0f172a' }), children: [
        node('Image', { src: '', alt: '', width: '100%', height: detail ? '260px' : '180px', objectFit: 'cover', borderRadius: '12px', recordBindings: { src: 'cover', alt: article ? 'coverAlt' : 'title', hideWhenEmpty: true } }),
        node('Heading', { text: 'Record title', level: detail ? '1' : '2', recordBindings: { text: 'title' } }, detail ? { lineHeight: '1.2' } : undefined),
        ...(article && detail ? [
            node('Paragraph', { text: 'Byline', recordBindings: { text: 'byline' } }, meta),
            node('Paragraph', { text: 'Original publication date', recordBindings: { text: 'publishedAt' } }, meta),
            node('Container', { recordBindings: { blocks: 'body' } })
        ] : [node('Paragraph', { text: 'Record description', recordBindings: { text: detail ? 'body' : 'summary' } }, { whiteSpace: 'pre-wrap', lineHeight: '1.65', color: detail ? '#334155' : '#0f172a', margin: '0' })]),
        // Detail pages live on their own original path; a self-referential CTA would link a page to itself.
        ...(detail ? [] : [node('Link', { text: article ? 'Read article' : 'View details', href: '', color: '#ffffff', underline: false, recordBindings: { href: 'originalPath' } }, { backgroundColor: '#0f172a', padding: '10px 18px', borderRadius: '10px', textAlign: 'center' })]),
    ] };
    return { ...old, content: [...old.content, { ...node(detail ? 'Container' : 'Repeater', { directoryQuery: query, columns: 3, layout: 'grid' }, detail ? { maxWidth: '840px', width: '100%', padding: '24px' } : undefined), children: [card] }] };
}
