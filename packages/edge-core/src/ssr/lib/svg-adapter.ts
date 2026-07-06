/**
 * SVG Adapter Utility
 * 
 * Fetches SVG content and adapts it for dark mode by replacing
 * fills with currentColor so it inherits the text color.
 */

// Simple in-memory cache to avoid refetching SVGs
const svgCache = new Map<string, string>();

/**
 * Check if a URL points to an SVG file
 */
export function isSvgUrl(url: string): boolean {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    return cleanUrl.endsWith('.svg');
}

/**
 * Fetch SVG content and adapt fills for dark mode
 * Returns inline SVG string with currentColor for fills
 */
export async function fetchAndAdaptSVG(
    url: string,
    className: string = '',
    size: { width?: string; height?: string } = {}
): Promise<string | null> {
    if (!url) return null;

    // Check cache first
    const cacheKey = `${url}:${className}:${size.width}:${size.height}`;
    if (svgCache.has(cacheKey)) {
        return svgCache.get(cacheKey)!;
    }

    try {
        const response = await fetch(url, {
            headers: { 'Accept': 'image/svg+xml' },
        });

        if (!response.ok) {
            console.warn(`[SVG Adapter] Failed to fetch: ${url} (${response.status})`);
            return null;
        }

        let svgContent = await response.text();

        // Validate it's actually SVG
        if (!svgContent.includes('<svg')) {
            console.warn(`[SVG Adapter] Not valid SVG: ${url}`);
            return null;
        }

        // Replace common dark fills with currentColor
        svgContent = svgContent
            .replace(/fill\s*=\s*["']#000(000)?["']/gi, 'fill="currentColor"')
            .replace(/fill\s*=\s*["']black["']/gi, 'fill="currentColor"')
            .replace(/fill\s*=\s*["']#1[0-9a-f]{5}["']/gi, 'fill="currentColor"') // Dark grays
            .replace(/fill\s*:\s*#000(000)?/gi, 'fill:currentColor')
            .replace(/fill\s*:\s*black/gi, 'fill:currentColor');

        // Add class if provided
        if (className) {
            svgContent = svgContent.replace('<svg', `<svg class="${className}"`);
        }

        // Add sizing attributes if provided
        if (size.width || size.height) {
            const widthAttr = size.width ? ` width="${size.width}"` : '';
            const heightAttr = size.height ? ` height="${size.height}"` : '';
            svgContent = svgContent.replace('<svg', `<svg${widthAttr}${heightAttr} style="display:inline-block;"`);
        }

        // Cache the result
        svgCache.set(cacheKey, svgContent);

        return svgContent;
    } catch (error) {
        console.error(`[SVG Adapter] Error fetching ${url}:`, error);
        return null;
    }
}

/**
 * Render an image that adapts to dark mode
 * - SVGs: Inlined with currentColor
 * - Rasters: Regular <img> with CSS filter fallback
 */
export async function renderAdaptiveImage(
    url: string,
    alt: string = '',
    className: string = '',
    size: { width?: string; height?: string } = {}
): Promise<string> {
    if (!url) return '';

    if (isSvgUrl(url)) {
        const inlineSvg = await fetchAndAdaptSVG(url, className, size);
        if (inlineSvg) {
            return inlineSvg;
        }
        // Fall back to img tag if SVG fetch fails
    }

    // Raster image - CSS filter handles dark mode
    const widthAttr = size.width ? ` width="${size.width}"` : '';
    const heightAttr = size.height ? ` height="${size.height}"` : '';
    const classAttr = className ? ` class="${className}"` : '';

    return `<img src="${url}" alt="${alt}"${widthAttr}${heightAttr}${classAttr} />`;
}
