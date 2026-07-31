/**
 * Navbar favicon-injection special-case.
 * Pure code move from PageRenderer; no logic change.
 *
 * If a Navbar's `logo` block requests the project logo or an icon, inject the
 * runtime-resolved favicon URL into `logo.imageUrl` before the Navbar renderer
 * reads it. Returns the (possibly updated) resolvedProps.
 */

import { engineConfig } from '../config.js';

export async function applyNavbarFavicon(
    type: string,
    resolvedProps: Record<string, unknown>
): Promise<Record<string, unknown>> {
    if (type !== 'Navbar' || !resolvedProps.logo) {
        return resolvedProps;
    }
    const logoProps = resolvedProps.logo as any;
    // Inject faviconUrl if either useProjectLogo or showIcon is enabled
    if (logoProps.useProjectLogo || logoProps.showIcon) {
        // Use the unified state provider (supports all runtimes: CF, Deno, Docker, local)
        const faviconUrl = await engineConfig().resolveFaviconUrl();

        // Inject the favicon URL into the logo imageUrl property
        return {
            ...resolvedProps,
            logo: {
                ...logoProps,
                imageUrl: faviconUrl,
            }
        };
    }
    return resolvedProps;
}
