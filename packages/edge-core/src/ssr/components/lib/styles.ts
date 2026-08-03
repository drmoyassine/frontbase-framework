/**
 * Styles utilities for SSR components
 */

import { processStyleEntry } from '../../styleHelpers.js';

/**
 * Per-viewport style overrides (mobile-first responsive). Each breakpoint maps
 * CSS property names to values; `buildResponsiveCSS` emits them as !important
 * media queries (tablet: max-width 1024px, mobile: max-width 640px). Desktop is
 * the inline base style and has no entry here.
 */
export interface ViewportOverrides {
    tablet?: Record<string, unknown>;
    mobile?: Record<string, unknown>;
}

export interface StylesData {
    activeProperties?: string[];
    values?: Record<string, any>;
    stylingMode?: 'visual' | 'css';
    rawCSS?: string;
    /** Responsive overrides per breakpoint (builder writes these; SSR emits media queries). */
    viewportOverrides?: ViewportOverrides;
}

export function sanitizeCSS(css: string | undefined | null): string {
    if (!css) return "";
    let sanitized = css;
    // Prevent HTML context breakout
    sanitized = sanitized.replace(/<\/\s*style\s*>/gi, "");
    // Prevent obsolete but dangerous CSS vectors
    sanitized = sanitized.replace(/expression\s*\(/gi, "no-expression(");
    sanitized = sanitized.replace(/url\s*\(\s*['"]?javascript:/gi, "url(");
    sanitized = sanitized.replace(/behavior\s*:/gi, "no-behavior:");
    sanitized = sanitized.replace(/-moz-binding\s*:/gi, "no-binding:");
    return sanitized;
}

/**
 * Convert StylesData to inline CSS string.
 *
 * Delegates value resolution to the canonical `processStyleEntry` so output is
 * byte-identical with the getCommonAttributes / rootStyles paths: declarations
 * emit `${key}:${value}` and join with `;` (no spaces).
 */
export function stylesDataToCSS(stylesData?: StylesData): string {
    if (!stylesData) return '';

    // Handle raw CSS mode
    if (stylesData.stylingMode === 'css' && stylesData.rawCSS) {
        return sanitizeCSS(stylesData.rawCSS);
    }

    // Handle visual mode with values
    if (!stylesData.values) return '';

    const parts: string[] = [];
    for (const [key, value] of Object.entries(stylesData.values)) {
        if (value === undefined || value === null || value === '' || key === 'className') {
            continue;
        }
        processStyleEntry(key, value, (cssKey, cssValue) => {
            parts.push(`${cssKey}:${cssValue}`);
        });
    }

    return parts.join(';');
}
