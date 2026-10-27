import { describe, expect, it } from 'vitest';
import { editorialDraftTemplate, type EditorialDraft } from './editorialDraftTemplate';
import { expandTemplate } from '../index';

const draft = (): EditorialDraft => ({ title: 'Original title', collection_role: 'article', status: 'draft', publication_approved: false,
    public_byline: 'Author', published_gmt: '2025-04-19 09:12:43.000000', blocks: [
        { kind: 'heading', level: 1, runs: [{ text: 'Original section' }] },
        { kind: 'paragraph', runs: [{ text: 'Read ' }, { text: 'the guide', href: 'https://example.test/guide/' }] },
    ] });

describe('editorial draft adapter', () => {
    it('expands existing editable primitives with unique IDs and one main heading', () => {
        const template = editorialDraftTemplate(draft());
        expect(expandTemplate(template).id).not.toBe(expandTemplate(template).id);
        expect(JSON.stringify(template)).toContain('h2');
        expect(JSON.stringify(template)).toContain('Original publication: 2025-04-19 (UTC)');
        expect(JSON.stringify(template)).toContain('https://example.test/guide/');
        expect(JSON.stringify(template)).not.toContain('innerHTML');
    });
    it('keeps imported template-looking text literal and rejects active link URLs', () => {
        for (const href of ['javascript:alert(1)', '//evil.test/', 'https://user:secret@example.test/', 'https://example.test/{{secret}}', 'https://example.test/%7b%7bsecret%7d%7d', 'https://example.test/%ZZ']) {
            const input = draft(); input.title = '{{ system.secret }}';
            input.blocks = [{ kind: 'paragraph', runs: [{ text: '{% include secret %}', href }] }];
            const output = JSON.stringify(editorialDraftTemplate(input));
            expect(output).not.toContain('{{'); expect(output).not.toContain('{%'); expect(output).not.toContain('"href"');
        }
    });
    it('refuses approved/published input and explicitly marks missing widgets', () => {
        expect(() => editorialDraftTemplate({ ...draft(), publication_approved: true } as unknown as EditorialDraft)).toThrow();
        expect(() => editorialDraftTemplate({ ...draft(), status: 'published' } as unknown as EditorialDraft)).toThrow();
        expect(JSON.stringify(editorialDraftTemplate({ ...draft(), review_flags: ['shortcode_needs_review'] }))).toContain('form or widget has not been migrated');
    });
});
