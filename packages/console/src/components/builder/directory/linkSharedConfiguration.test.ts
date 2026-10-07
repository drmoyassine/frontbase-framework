import { expect, it } from 'vitest';
import { addSharedPageHeader } from './linkSharedConfiguration';
const page: any = { layoutData: { root: { siteConfiguration: { version: 1, role: 'directory' }, custom: 'kept' }, content: [{ id: 'custom', type: 'Text', props: { text: 'Owner content' } }] } };

it('adds a flat styled header with the brand link first and contact pills last', () => {
    const layout = addSharedPageHeader(page);
    const header = layout.content[0];
    expect(header.props.sharedSiteHeader).toBe(true);
    expect(header.styles).toMatchObject({ flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #dbe2ea' });
    const [brand, destination, email, whatsapp] = header.children!;
    expect(header.children!.every(node => node.children === undefined)).toBe(true); // flat: no nested groups
    expect(brand.type).toBe('Link'); expect(brand.props).toMatchObject({ text: 'Site name', siteBindings: { text: 'site.name' }, color: '#0f172a', underline: false });
    expect(brand.styles).toMatchObject({ fontWeight: '700' });
    expect(destination.props.siteBindings).toEqual({ text: 'site.destination' });
    expect(destination.styles).toMatchObject({ color: '#64748b', fontSize: '0.875rem' });
    expect(email.props.siteBindings).toEqual({ href: 'contacts.email', hideWhenEmpty: true });
    expect(email.styles).toMatchObject({ marginLeft: 'auto', borderRadius: '9999px', border: '1px solid #dbe2ea' });
    expect(whatsapp.props.siteBindings).toEqual({ href: 'contacts.whatsapp', hideWhenEmpty: true });
    expect(whatsapp.styles).toMatchObject({ borderRadius: '9999px' });
});

it('is idempotent and preserves the owner layout', () => {
    const once = addSharedPageHeader(page);
    expect(addSharedPageHeader({ ...page, layoutData: once })).toEqual(once); // second add is a no-op
    expect(once.content[1]).toEqual(page.layoutData.content[0]);
    expect(once.root).toEqual(page.layoutData.root);
});
