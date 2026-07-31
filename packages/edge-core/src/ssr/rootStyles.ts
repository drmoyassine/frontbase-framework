/**
 * Page-root containerStyles → rootStyle resolution (the ROOT-ONLY apply path).
 * Pure code move from PageRenderer.renderPage; no logic change.
 *
 * Only the returned `rootStyle` / `rootClass` strings are byte-load-bearing;
 * the internal imperative styleParts accumulation is reproduced verbatim.
 */

import { buildStyleString, buildClassName, processStyleEntry } from './styleHelpers.js';

export function resolveRootStyles(rootProps: Record<string, unknown>): { rootStyle: string; rootClass: string } {
    // Extract containerStyles from root (builder format)
    const containerStyles = (rootProps as any).containerStyles;
    let rootStyle = '';
    let rootClass = (rootProps as any).className as string || '';

    if (containerStyles) {
        // Handle NEW StylesData format: { activeProperties: [...], values: {...} }
        if ('values' in containerStyles && containerStyles.values) {
            const { values } = containerStyles;
            const styleParts: string[] = [];

            // Apply ALL styles from values (not just activeProperties) via the
            // canonical processStyleEntry so output is byte-identical with the
            // getCommonAttributes / stylesDataToCSS paths.
            for (const [prop, value] of Object.entries(values)) {
                if (value === undefined || value === null || value === '' || prop === 'className') {
                    continue;
                }
                processStyleEntry(prop, value, (cssKey, cssValue) => {
                    styleParts.push(`${cssKey}:${cssValue}`);
                });
            }

            // Also check for className in values
            if (values.className) {
                rootClass = buildClassName(rootClass, String(values.className));
            }

            rootStyle = styleParts.join(';');
        }
        // Handle OLD ContainerStyles format (direct properties)
        else {
            rootStyle = buildStyleString(containerStyles as Record<string, unknown>);
        }
    } else {
        // Fallback to direct root properties
        rootStyle = buildStyleString(rootProps as Record<string, unknown>);
    }

    return { rootStyle, rootClass };
}
