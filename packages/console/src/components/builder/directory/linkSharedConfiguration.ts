import { directoryCopiesMatch, sitePageReferenceSchema, type DirectoryConfiguration, type SitePageReference } from '@frontbase/edge-core/directory/configuration';
import type { Page } from '@/types/builder';

/** Explicit conversion only. Preserve all custom components and unrelated root fields. */
export function linkSharedConfiguration(page: Page, configuration: DirectoryConfiguration, reference: SitePageReference): NonNullable<Page['layoutData']> {
    const old = page.layoutData || { root: {}, content: [] };
    if (old.root.directoryConfiguration !== undefined && !directoryCopiesMatch(old.root.directoryConfiguration, configuration)) throw new Error('Page copy differs from shared settings');
    const { directoryConfiguration: _copy, ...root } = old.root;
    return { ...old, root: { ...root, siteConfiguration: sitePageReferenceSchema.parse(reference) } };
}
