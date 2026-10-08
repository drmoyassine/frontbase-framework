import { directoryCopiesMatch, sitePageReferenceSchema, type DirectoryConfiguration, type SitePageReference } from '@frontbase/edge-core/directory/configuration';
import type { Page } from '@/types/builder';

/** Explicit conversion only. Preserve all custom components and unrelated root fields. */
export function linkSharedConfiguration(page: Page, configuration: DirectoryConfiguration, reference: SitePageReference): NonNullable<Page['layoutData']> {
    const old = page.layoutData || { root: {}, content: [] };
    if (old.root.directoryConfiguration !== undefined && !directoryCopiesMatch(old.root.directoryConfiguration, configuration)) throw new Error('Page copy differs from shared settings');
    const { directoryConfiguration: _copy, ...root } = old.root;
    return { ...old, root: { ...root, siteConfiguration: sitePageReferenceSchema.parse(reference) } };
}

/** Opt-in reusable chrome, added without replacing the owner's existing layout. */
export function addSharedPageHeader(page: Page): NonNullable<Page['layoutData']> {
    const old = page.layoutData || { root: {}, content: [] };
    if (old.content.some(node => node.props?.sharedSiteHeader === true)) return old;
    const node = (type: string, props: Record<string, unknown>, styles?: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, props, ...(styles ? { styles } : {}) });
    // Flat structure on purpose: saved pages and tests pin the brand link as the header's first child.
    const contact = { border: '1px solid #dbe2ea', borderRadius: '9999px', padding: '8px 16px', fontSize: '0.875rem' };
    return { ...old, content: [{ id: crypto.randomUUID(), type: 'Container', props: { sharedSiteHeader: true },
        styles: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 24px', padding: '18px 32px', borderBottom: '1px solid #dbe2ea', backgroundColor: '#ffffff' }, children: [
            node('Link', { text: 'Site name', href: '/', color: '#0f172a', underline: false, siteBindings: { text: 'site.name', href: 'routes.directory' } }, { fontWeight: '700', fontSize: '1.125rem' }),
            node('Text', { text: 'Destination', siteBindings: { text: 'site.destination' } }, { color: '#64748b', fontSize: '0.875rem' }),
            node('Link', { text: 'Email a counselor', href: '', color: '#0f172a', underline: false, siteBindings: { href: 'contacts.email', hideWhenEmpty: true } }, { ...contact, marginLeft: 'auto' }),
            node('Link', { text: 'WhatsApp', href: '', color: '#0f172a', underline: false, siteBindings: { href: 'contacts.whatsapp', hideWhenEmpty: true } }, contact),
        ] }, ...old.content] };
}
