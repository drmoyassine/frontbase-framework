/**
 * Styles utilities for SSR components
 */

export interface StylesData {
    activeProperties?: string[];
    values?: Record<string, any>;
    stylingMode?: 'visual' | 'css';
    rawCSS?: string;
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
 * Convert StylesData to inline CSS string
 */
export function stylesDataToCSS(stylesData?: StylesData): string {
    if (!stylesData) return '';

    // Handle raw CSS mode
    if (stylesData.stylingMode === 'css' && stylesData.rawCSS) {
        return sanitizeCSS(stylesData.rawCSS);
    }

    // Handle visual mode with values
    if (!stylesData.values) return '';

    const styleParts: string[] = [];

    for (const [prop, value] of Object.entries(stylesData.values)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }

        // Handle special 'size' object: { width, widthUnit, height, heightUnit }
        if (prop === 'size' && typeof value === 'object') {
            const sizeObj = value as any;
            if (sizeObj.width !== undefined && sizeObj.width !== 'auto') {
                const widthUnit = sizeObj.widthUnit || 'px';
                styleParts.push(`width: ${sizeObj.width}${widthUnit}`);
            }
            if (sizeObj.height !== undefined && sizeObj.height !== 'auto') {
                const heightUnit = sizeObj.heightUnit || 'px';
                styleParts.push(`height: ${sizeObj.height}${heightUnit}`);
            }
            continue;
        }

        // Handle padding/margin objects: { top, right, bottom, left }
        if ((prop === 'padding' || prop === 'margin') && typeof value === 'object') {
            const boxObj = value as any;
            if ('top' in boxObj && 'right' in boxObj && 'bottom' in boxObj && 'left' in boxObj) {
                styleParts.push(`${prop}: ${boxObj.top}px ${boxObj.right}px ${boxObj.bottom}px ${boxObj.left}px`);
            } else {
                // Handle individual sides
                if (boxObj.top !== undefined) styleParts.push(`${prop}-top: ${boxObj.top}px`);
                if (boxObj.right !== undefined) styleParts.push(`${prop}-right: ${boxObj.right}px`);
                if (boxObj.bottom !== undefined) styleParts.push(`${prop}-bottom: ${boxObj.bottom}px`);
                if (boxObj.left !== undefined) styleParts.push(`${prop}-left: ${boxObj.left}px`);
            }
            continue;
        }

        // Handle horizontalAlign: converts to margin-left/right auto
        if (prop === 'horizontalAlign' && typeof value === 'string') {
            if (value === 'center') {
                styleParts.push('margin-left: auto');
                styleParts.push('margin-right: auto');
            } else if (value === 'right') {
                styleParts.push('margin-left: auto');
                styleParts.push('margin-right: 0');
            } else {
                styleParts.push('margin-left: 0');
                styleParts.push('margin-right: auto');
            }
            continue;
        }

        // Skip any remaining object values (would become [object Object])
        if (typeof value === 'object') {
            continue;
        }

        // Convert camelCase to kebab-case
        const cssKey = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        styleParts.push(`${cssKey}: ${value}`);
    }

    return styleParts.join('; ');
}
