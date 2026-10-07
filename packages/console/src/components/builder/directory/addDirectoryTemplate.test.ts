import { expect, it } from 'vitest';
import type { DirectoryQueryBinding } from '@frontbase/edge-core/directory/configuration';
import { addDirectoryTemplate } from './addDirectoryTemplate';
const page: any = { layoutData: { root: { siteConfiguration: { version: 1, role: 'directory' }, custom: 'kept' }, content: [{ id: 'custom', type: 'Text', props: { text: 'Owner content' } }] } };
const children = (queryId: DirectoryQueryBinding['queryId']) => addDirectoryTemplate(page, { version: 1, queryId, params: queryId.endsWith('.detail') ? { path: '/original/' } : {} } as never).content[1].children![0].children!;

it('styles institution list cards with a bound CTA and preserves record bindings', () => {
    const [image, heading, summary, cta] = children('directory.institution.list');
    expect(image.props.recordBindings).toEqual({ src: 'cover', alt: 'title', hideWhenEmpty: true });
    expect(heading.props.level).toBe('2'); expect(heading.props.recordBindings).toEqual({ text: 'title' });
    expect(summary.props.recordBindings).toEqual({ text: 'summary' });
    expect(summary.styles).toMatchObject({ whiteSpace: 'pre-wrap', lineHeight: '1.65' });
    expect(cta.props).toMatchObject({ text: 'View details', color: '#ffffff', underline: false });
    expect(cta.props.recordBindings).toEqual({ href: 'originalPath' });
    expect(cta.styles).toMatchObject({ backgroundColor: '#0f172a', borderRadius: '10px' });
});

it('keeps article list covers optional and labels the CTA for reading', () => {
    const [image, , , cta] = children('directory.article.list');
    expect(image.props.recordBindings).toEqual({ src: 'cover', alt: 'coverAlt', hideWhenEmpty: true });
    expect(cta.props.text).toBe('Read article'); expect(cta.props.recordBindings).toEqual({ href: 'originalPath' });
});

it('drops the self-referential CTA on details and bounds the reading width', () => {
    const detail = addDirectoryTemplate(page, { version: 1 as const, queryId: 'directory.program.detail', params: { path: '/original-program/' } });
    expect(detail.content[1].type).toBe('Container');
    expect(detail.content[1].styles).toMatchObject({ maxWidth: '840px', width: '100%' });
    const nodes = detail.content[1].children![0].children!;
    expect(nodes.some(node => node.type === 'Link')).toBe(false);
    expect(nodes[1].props.level).toBe('1'); expect(nodes[1].styles?.lineHeight).toBe('1.2');
    expect(nodes[2].props.recordBindings).toEqual({ text: 'body' });
    expect(nodes[2].styles).toMatchObject({ color: '#334155', lineHeight: '1.65' });
});

it('mutes article detail meta and keeps body block spacing to the projected blocks', () => {
    const nodes = children('directory.article.detail');
    const [image, heading, byline, published, body] = nodes;
    expect(image.props.recordBindings).toEqual({ src: 'cover', alt: 'coverAlt', hideWhenEmpty: true });
    expect(heading.props.level).toBe('1');
    expect(byline.props.recordBindings).toEqual({ text: 'byline' }); expect(byline.styles).toMatchObject({ color: '#64748b', fontSize: '0.875rem' });
    expect(published.props.recordBindings).toEqual({ text: 'publishedAt' }); expect(published.styles).toMatchObject({ color: '#64748b' });
    expect(body.props.recordBindings).toEqual({ blocks: 'body' }); expect(body.children).toBeUndefined();
    expect(body.styles).toBeUndefined(); // projected blocks carry their own margins; a gap would double-space
    expect(nodes.some(node => node.type === 'Link')).toBe(false);
});

it('preserves owner content and refuses unlinked pages', () => {
    const layout = addDirectoryTemplate(page, { version: 1 as const, queryId: 'directory.institution.list', params: {} });
    expect(layout.content[0]).toEqual(page.layoutData.content[0]);
    expect(layout.root.custom).toBe('kept'); expect(layout.root.siteConfiguration).toEqual(page.layoutData.root.siteConfiguration);
    expect(() => addDirectoryTemplate({ layoutData: { root: {}, content: [] } } as any, { version: 1 as const, queryId: 'directory.institution.list', params: {} })).toThrow('Link shared settings first');
});
