import { directoryQueryBindingSchema, type DirectoryQueryBinding } from '@frontbase/edge-core/directory/configuration';
import type { Page } from '@/types/builder';

/** Append editable authoring nodes only: no fetched records or datasource credentials. */
export function addDirectoryTemplate(page: Page, binding: DirectoryQueryBinding): NonNullable<Page['layoutData']> {
    const query = directoryQueryBindingSchema.parse(binding); const old = page.layoutData || { root: {}, content: [] };
    if (!old.root.siteConfiguration) throw new Error('Link shared settings first');
    const detail = query.queryId.endsWith('.detail'); const article = query.queryId === 'directory.article.detail';
    const node = (type: string, props: Record<string, unknown>, styles?: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, props, ...(styles ? { styles } : {}) });
    const card = { ...node('Container', {}, { display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', border: '1px solid #dbe2ea', borderRadius: '16px', backgroundColor: '#ffffff', color: '#0f172a' }), children: [
        node('Image', { src: '', alt: '', width: '100%', height: detail ? '260px' : '180px', objectFit: 'cover', borderRadius: '12px', recordBindings: { src: 'cover', alt: article ? 'coverAlt' : 'title' } }),
        node('Heading', { text: 'Record title', level: detail ? '1' : '2', recordBindings: { text: 'title' } }),
        ...(article ? [node('Paragraph', { text: 'Byline', recordBindings: { text: 'byline' } }), node('Paragraph', { text: 'Original publication date', recordBindings: { text: 'publishedAt' } }), node('Container', { recordBindings: { blocks: 'body' } })]
            : [node('Paragraph', { text: 'Record description', recordBindings: { text: detail ? 'body' : 'summary' } }, { whiteSpace: 'pre-wrap' })]),
        node('Link', { text: 'View details', href: '', recordBindings: { href: 'originalPath' } }),
    ] };
    return { ...old, content: [...old.content, { ...node(detail ? 'Container' : 'Repeater', { directoryQuery: query, columns: 3, layout: 'grid' }), children: [card] }] };
}
