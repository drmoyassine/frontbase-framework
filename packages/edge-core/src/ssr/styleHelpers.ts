/**
 * SSR Style Helpers
 * 
 * Utility functions for building inline styles, responsive CSS media queries,
 * visibility rules, and className strings from component props and styles data.
 * 
 * Extracted from PageRenderer.ts for clarity and reusability.
 */

// type-only: styles.ts imports processStyleEntry from this module, so a runtime
// import would cycle; type-only imports are erased and safe.
import type { StylesData, ViewportOverrides } from './components/lib/styles.js';

// CSS properties that should NOT receive automatic 'px' units
const UNITLESS_PROPS = new Set([
    'opacity', 'z-index', 'flex', 'flex-grow', 'flex-shrink', 'order',
    'line-height', 'font-weight',
    'grid-column', 'grid-row', 'grid-area', 'grid-column-start', 'grid-column-end',
    'grid-row-start', 'grid-row-end', 'column-count', 'fill-opacity', 'stroke-opacity'
]);

/**
 * Convert a camelCase key to kebab-case CSS property.
 */
function toKebab(key: string): string {
    return key.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Auto-append 'px' to numeric values for length properties.
 */
function maybeAddPx(cssKey: string, value: string | number): string {
    const v = String(value);
    if (/^-?\d+(\.\d+)?$/.test(v) && !UNITLESS_PROPS.has(cssKey)) {
        return v + 'px';
    }
    return v;
}

// ============================================================================
// Props → CSS mapping shared by buildStyleString and buildInlineStyles
// ============================================================================

const BASIC_PROP_MAP: Record<string, string> = {
    padding: 'padding',
    margin: 'margin',
    width: 'width',
    height: 'height',
    maxWidth: 'max-width',
    minWidth: 'min-width',
    backgroundColor: 'background-color',
    color: 'color',
};

const EXTENDED_PROP_MAP: Record<string, string> = {
    ...BASIC_PROP_MAP,
    maxHeight: 'max-height',
    minHeight: 'min-height',
    background: 'background',
    border: 'border',
    borderRadius: 'border-radius',
    boxShadow: 'box-shadow',
    opacity: 'opacity',
    overflow: 'overflow',
};

// ============================================================================
// Core style value processing (shared by inline + responsive)
// ============================================================================

interface StyleValueEmitter {
    (cssKey: string, cssValue: string): void;
}

/**
 * Process a single style entry (key/value from the styles object),
 * handling special shapes like size, padding/margin objects, and horizontalAlign.
 *
 * Canonical stylesData→CSS value resolver — every SSR styles path (rootStyles,
 * getCommonAttributes, stylesDataToCSS) MUST delegate here so published bytes
 * stay byte-identical across renderers. Format defaults to maybeAddPx (numeric
 * values get a 'px' suffix unless the property is in UNITLESS_PROPS).
 */
export function processStyleEntry(
    key: string,
    value: unknown,
    emit: StyleValueEmitter,
    formatValue: (cssKey: string, val: string | number) => string = (k, v) => maybeAddPx(k, v)
): void {
    if (value === undefined || value === null || value === '') return;

    // Handle special 'size' object: { width, widthUnit, height, heightUnit }
    if (key === 'size' && typeof value === 'object') {
        const sizeObj = value as any;
        if (sizeObj.width !== undefined && sizeObj.width !== 'auto') {
            const widthUnit = sizeObj.widthUnit || 'px';
            emit('width', formatValue('width', sizeObj.width + widthUnit));
        }
        if (sizeObj.height !== undefined && sizeObj.height !== 'auto') {
            const heightUnit = sizeObj.heightUnit || 'px';
            emit('height', formatValue('height', sizeObj.height + heightUnit));
        }
        return;
    }

    // Handle padding/margin objects: { top, right, bottom, left }
    if ((key === 'padding' || key === 'margin') && typeof value === 'object') {
        const boxObj = value as any;
        if (boxObj.top !== undefined) emit(`${key}-top`, formatValue(`${key}-top`, boxObj.top + 'px'));
        if (boxObj.right !== undefined) emit(`${key}-right`, formatValue(`${key}-right`, boxObj.right + 'px'));
        if (boxObj.bottom !== undefined) emit(`${key}-bottom`, formatValue(`${key}-bottom`, boxObj.bottom + 'px'));
        if (boxObj.left !== undefined) emit(`${key}-left`, formatValue(`${key}-left`, boxObj.left + 'px'));
        return;
    }

    // Handle horizontalAlign: converts to margin-left/right auto
    if (key === 'horizontalAlign' && typeof value === 'string') {
        if (value === 'center') {
            emit('margin-left', formatValue('margin-left', 'auto'));
            emit('margin-right', formatValue('margin-right', 'auto'));
        } else if (value === 'right') {
            emit('margin-left', formatValue('margin-left', 'auto'));
            emit('margin-right', formatValue('margin-right', '0'));
        } else {
            emit('margin-left', formatValue('margin-left', '0'));
            emit('margin-right', formatValue('margin-right', 'auto'));
        }
        return;
    }

    // Skip any remaining object values (would become [object Object])
    if (typeof value === 'object') return;

    const cssKey = toKebab(key);
    emit(cssKey, formatValue(cssKey, String(value)));
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build inline styles from both props and component styles object.
 * The styles object takes precedence.
 * 
 * Supports both formats:
 * - Old flat format: { justifyContent: 'center', padding: '24px' }
 * - New stylesData format: { activeProperties: [...], values: {...}, stylingMode: 'visual' }
 */
export function buildInlineStyles(props: Record<string, unknown>, styles: Record<string, any>): string {
    const cssProps: Record<string, string> = {};

    // First, apply props-based styles
    for (const [prop, css] of Object.entries(BASIC_PROP_MAP)) {
        if (props[prop] !== undefined) {
            cssProps[css] = String(props[prop]);
        }
    }

    // Handle styles object - detect which format it is
    let styleValues: Record<string, any> = {};

    if (styles && typeof styles === 'object') {
        // New stylesData format: { activeProperties: [...], values: {...}, stylingMode: '...' }
        if ('values' in styles && typeof styles.values === 'object') {
            styleValues = styles.values || {};
        }
        // Old flat format: { justifyContent: 'center', ... }
        else {
            // Filter out non-CSS keys
            const nonCssKeys = ['activeProperties', 'stylingMode'];
            for (const [key, value] of Object.entries(styles)) {
                if (!nonCssKeys.includes(key)) {
                    styleValues[key] = value;
                }
            }
        }
    }

    // Apply style values using shared processor
    for (const [key, value] of Object.entries(styleValues)) {
        processStyleEntry(key, value, (cssKey, cssValue) => {
            cssProps[cssKey] = cssValue;
        });
    }

    return Object.entries(cssProps)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
}

/**
 * Build responsive CSS media queries for viewport-specific style overrides.
 * Returns a <style> tag with media queries for tablet and mobile.
 * 
 * Breakpoints (mobile-first order for cascade):
 * - Desktop: no media query (base styles via inline)
 * - Tablet: @media (max-width: 1024px)
 * - Mobile: @media (max-width: 640px)
 */
export function buildResponsiveCSS(componentId: string, styles: StylesData | Record<string, unknown> | undefined): string {
    // viewportOverrides is typed on StylesData; legacy `component.styles` (plain
    // record) still flows through here, so narrow defensively.
    const viewportOverrides = (styles as StylesData | undefined)?.viewportOverrides as ViewportOverrides | undefined;
    if (!viewportOverrides) {
        return '';
    }

    const cssRules: string[] = [];

    // Helper to convert style values to CSS properties with !important
    const valuesToCSS = (values: Record<string, unknown>): string => {
        const props: string[] = [];
        for (const [key, value] of Object.entries(values)) {
            processStyleEntry(key, value, (cssKey, cssValue) => {
                props.push(`${cssKey}:${cssValue} !important`);
            }, (_k, v) => String(v));
        }
        return props.join(';');
    };

    // Tablet overrides (max-width: 1024px)
    if (viewportOverrides.tablet && Object.keys(viewportOverrides.tablet).length > 0) {
        const tabletCSS = valuesToCSS(viewportOverrides.tablet);
        if (tabletCSS) {
            cssRules.push(`@media(max-width:1024px){[id="${componentId}"]{${tabletCSS}}}`);
        }
    }

    // Mobile overrides (max-width: 640px)
    if (viewportOverrides.mobile && Object.keys(viewportOverrides.mobile).length > 0) {
        const mobileCSS = valuesToCSS(viewportOverrides.mobile);
        if (mobileCSS) {
            cssRules.push(`@media(max-width:640px){[id="${componentId}"]{${mobileCSS}}}`);
        }
    }

    if (cssRules.length === 0) {
        return '';
    }

    return `<style>${cssRules.join('')}</style>`;
}

/**
 * Build CSS media queries for per-viewport visibility.
 * Generates display:none rules for viewports where component is hidden.
 * 
 * Default visibility is true (visible) for all viewports.
 */
export function buildVisibilityCSS(componentId: string, visibility: any): string {
    if (!visibility) return '';

    const { mobile = true, tablet = true, desktop = true } = visibility;

    // If all visible, no CSS needed
    if (mobile && tablet && desktop) return '';

    const cssRules: string[] = [];

    // Desktop hidden (min-width: 1025px)
    if (!desktop) {
        cssRules.push(`@media(min-width:1025px){[id="${componentId}"]{display:none!important}}`);
    }

    // Tablet hidden (641px - 1024px)
    if (!tablet) {
        cssRules.push(`@media(min-width:641px) and (max-width:1024px){[id="${componentId}"]{display:none!important}}`);
    }

    // Mobile hidden (max-width: 640px)
    if (!mobile) {
        cssRules.push(`@media(max-width:640px){[id="${componentId}"]{display:none!important}}`);
    }

    if (cssRules.length === 0) return '';

    return `<style>${cssRules.join('')}</style>`;
}

/**
 * Build inline style string from props.
 */
export function buildStyleString(props: Record<string, unknown>): string {
    const styleProps: Record<string, string> = {};

    for (const [prop, css] of Object.entries(EXTENDED_PROP_MAP)) {
        if (props[prop] !== undefined) {
            styleProps[css] = String(props[prop]);
        }
    }

    // Handle custom style object
    if (props.style && typeof props.style === 'object') {
        Object.assign(styleProps, props.style);
    }

    return Object.entries(styleProps)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
}

/**
 * Build className string from multiple sources.
 */
export function buildClassName(...classes: (string | undefined)[]): string {
    return classes.filter(Boolean).join(' ');
}
