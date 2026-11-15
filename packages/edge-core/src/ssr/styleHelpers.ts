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
const cssPropertyNames = new Map<string, string>();
function toKebab(key: string): string {
    const existing = cssPropertyNames.get(key);
    if (existing !== undefined) return existing;
    const result = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    // Names only, never values or tenant data. Bound arbitrary custom properties.
    if (cssPropertyNames.size < 512) cssPropertyNames.set(key, result);
    return result;
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
const BASIC_PROP_ENTRIES = Object.entries(BASIC_PROP_MAP);

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

const frozenPlainData = new WeakSet<object>();

/** Frozen plain data can share derived CSS across requests. Mutable builder styles
 * and accessor-backed objects continue through the ordinary formatter. */
export function isFrozenPlainData(value: unknown): boolean {
    if (!value || typeof value !== 'object' || !Object.isFrozen(value)) return false;
    if (frozenPlainData.has(value)) return true;
    const checking = new WeakSet<object>();
    function check(input: unknown, depth: number): boolean {
        if (input === null || typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean' || input === undefined) return true;
        if (typeof input !== 'object' || depth > 32 || !Object.isFrozen(input)) return false;
        if (frozenPlainData.has(input)) return true;
        if (checking.has(input)) return false;
        const prototype = Object.getPrototypeOf(input);
        if (prototype !== Object.prototype && prototype !== null && !(Array.isArray(input) && prototype === Array.prototype)) return false;
        checking.add(input);
        const descriptors = Object.values(Object.getOwnPropertyDescriptors(input));
        if (Object.getOwnPropertySymbols(input).length ||
            !descriptors.every(descriptor => Object.hasOwn(descriptor, 'value') && check(descriptor.value, depth + 1))) return false;
        checking.delete(input);
        frozenPlainData.add(input);
        return true;
    }
    return check(value, 0);
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
    let cssProps: Record<string, string> | undefined;

    // First, apply props-based styles
    for (const [prop, css] of BASIC_PROP_ENTRIES) {
        if (props[prop] !== undefined) {
            (cssProps ??= {})[css] = String(props[prop]);
        }
    }

    // Handle styles object - detect which format it is
    let styleValues: Record<string, any> | undefined;

    if (styles && typeof styles === 'object') {
        // New stylesData format: { activeProperties: [...], values: {...}, stylingMode: '...' }
        if ('values' in styles && typeof styles.values === 'object') {
            styleValues = styles.values || undefined;
        }
        // Old flat format: { justifyContent: 'center', ... }
        else {
            // Filter out non-CSS keys
            styleValues = styles;
        }
    }

    if (!styleValues) return cssProps ? styleText(cssProps) : '';
    const cached = inlineStyles.get(styleValues);
    if (!cached && !isFrozenPlainData(styleValues)) {
        return styleText(applyInlineStyleValues(cssProps ?? {}, styleValues));
    }
    const declarations = cached ?? compileInlineStyleDeclarations(styleValues);
    if (!cssProps) return declarations.text;
    // Apply authored overrides onto prop-derived entries in their original order.
    // This preserves CSS precedence even for order-sensitive shorthand/longhand.
    Object.assign(cssProps, declarations.values);
    return styleText(cssProps);
}

function styleText(values: Record<string, string>): string {
    return Object.entries(values).map(([key, value]) => `${key}:${value}`).join(';');
}

type InlineStyleDeclarations = { values: Record<string, string>; text: string };
const inlineStyles = new WeakMap<object, InlineStyleDeclarations>();

function applyInlineStyleValues(values: Record<string, string>, styleValues: Record<string, unknown>): Record<string, string> {
    const emit: StyleValueEmitter = (key, value) => { values[key] = value; };
    for (const [key, value] of Object.entries(styleValues)) {
        if (key !== 'activeProperties' && key !== 'stylingMode') processStyleEntry(key, value, emit);
    }
    return values;
}

function compileInlineStyleDeclarations(styleValues: Record<string, unknown>): InlineStyleDeclarations {
    const values = applyInlineStyleValues({}, styleValues);
    const result = { values, text: styleText(values) };
    inlineStyles.set(styleValues, result);
    return result;
}

const viewportStyleRules = new WeakMap<object, string>();

function viewportRule(values: Record<string, unknown>): string {
    const existing = viewportStyleRules.get(values);
    if (existing !== undefined) return existing;
    const parts: string[] = [];
    const emit: StyleValueEmitter = (key, value) => { parts.push(`${key}:${value} !important`); };
    for (const [key, value] of Object.entries(values)) processStyleEntry(key, value, emit, (_key, val) => String(val));
    const declarations = parts.join(';');
    if (isFrozenPlainData(values)) viewportStyleRules.set(values, declarations);
    return declarations;
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

    // Tablet overrides (max-width: 1024px)
    if (viewportOverrides.tablet && Object.keys(viewportOverrides.tablet).length > 0) {
        const tabletCSS = viewportRule(viewportOverrides.tablet);
        if (tabletCSS) {
            cssRules.push(`@media(max-width:1024px){[id="${componentId}"]{${tabletCSS}}}`);
        }
    }

    // Mobile overrides (max-width: 640px)
    if (viewportOverrides.mobile && Object.keys(viewportOverrides.mobile).length > 0) {
        const mobileCSS = viewportRule(viewportOverrides.mobile);
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
