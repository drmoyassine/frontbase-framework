import type { ComponentTemplate } from '../types';
import { directoryLiteral } from './educationDirectoryTemplate';

export interface EditorialDraft {
    title: string;
    collection_role: 'article' | 'page';
    public_byline?: string | null;
    published_gmt?: string | null;
    blocks: { kind: 'paragraph' | 'heading' | 'list_item' | 'quote'; level?: number; runs: { text: string; href?: string }[] }[];
    review_flags?: string[];
    status: 'draft';
    publication_approved: false;
}

function reviewedLink(href: string): string | null {
    try {
        if (/[{}\\\x00-\x20]/.test(href) || /[{}\\\x00-\x20]/.test(decodeURIComponent(href))) return null;
        const url = new URL(href);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? href : null;
    } catch { return null; }
}

/** Conversion adapter only: editable primitives, no HTML or publication authority. */
export function editorialDraftTemplate(draft: EditorialDraft): ComponentTemplate {
    if (draft.status !== 'draft' || draft.publication_approved !== false) throw new Error('Editorial adapter requires an unapproved draft');
    const text = (value: string): ComponentTemplate => ({ type: 'Text', props: { text: directoryLiteral(value) } });
    const body = draft.blocks.map((block): ComponentTemplate => {
        if (!['paragraph', 'heading', 'list_item', 'quote'].includes(block.kind)) throw new Error('Unsupported editorial block');
        if (block.kind === 'heading') {
            const level = Math.min(6, Math.max(2, Number.isInteger(block.level) ? block.level! : 2));
            return { type: 'Heading', props: { text: directoryLiteral(block.runs.map(r => r.text).join('')), level: `h${level}` } };
        }
        return { type: 'Container', props: { className: `editorial-${block.kind}` }, styles: { marginBottom: '20px' },
            children: block.runs.map(run => {
                const href = run.href && reviewedLink(run.href);
                return { ...(href ? { type: 'Link', props: { text: directoryLiteral(run.text), href } } : text(run.text)),
                    styles: { display: 'inline', whiteSpace: 'pre-wrap' } };
            }) };
    });
    const date = draft.published_gmt?.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2}) /)?.[1];
    return { type: 'Container', props: { className: 'editorial-draft' }, styles: { maxWidth: '840px', margin: '0 auto', padding: '36px 24px' }, children: [
        text('EDITORIAL PREVIEW · NOT PUBLISHED'),
        { type: 'Heading', props: { text: directoryLiteral(draft.title), level: 'h1' } },
        ...(draft.collection_role === 'article' ? [text([draft.public_byline, date && `Original publication: ${date} (UTC)`].filter(Boolean).join(' · '))] : []),
        text('Recovered content for migration review. Facts, links and original media still need approval.'),
        ...(draft.review_flags?.includes('shortcode_needs_review') ? [text('The original embedded form or widget has not been migrated.')] : []),
        ...body,
    ] };
}
