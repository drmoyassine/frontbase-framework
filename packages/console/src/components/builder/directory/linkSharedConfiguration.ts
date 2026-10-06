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
    const node = (type: string, props: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, props });
    return { ...old, content: [{ id: crypto.randomUUID(), type: 'Container', props: { sharedSiteHeader: true },
        styles: { display: 'flex', flexWrap: 'wrap', gap: '24px', padding: '24px' }, children: [
            node('Link', { text: 'Site name', href: '/', siteBindings: { text: 'site.name' } }),
            node('Text', { text: 'Destination', siteBindings: { text: 'site.destination' } }),
            node('Link', { text: 'Email a counselor', href: '', siteBindings: { href: 'contacts.email' } }),
            node('Link', { text: 'WhatsApp', href: '', siteBindings: { href: 'contacts.whatsapp' } }),
        ] }, ...old.content] };
}
