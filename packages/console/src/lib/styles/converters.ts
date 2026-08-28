import { CSS_PROPERTY_CONFIGS } from './configs';
import type { StyleValues } from './types';

/**
 * Convert style values object to CSS string
 */
export const stylesToCSS = (values: StyleValues): string => {
    const cssLines: string[] = [];

    Object.entries(values).forEach(([propertyId, value]) => {
        const config = CSS_PROPERTY_CONFIGS[propertyId];
        if (!config) return;

        try {
            const cssValue = config.toCSSValue(value);

            // Handle properties that return objects (like horizontalAlign => { marginLeft, marginRight })
            if (typeof cssValue === 'object' && cssValue !== null) {
                Object.entries(cssValue).forEach(([cssProp, cssVal]) => {
                    const cssPropertyName = cssProp.replace(/([A-Z])/g, '-$1').toLowerCase();
                    cssLines.push(`${cssPropertyName}: ${cssVal};`);
                });
            } else {
                const cssPropertyName = propertyId.replace(/([A-Z])/g, '-$1').toLowerCase();
                cssLines.push(`${cssPropertyName}: ${cssValue};`);
            }
        } catch (error) {
            console.error(`Error converting ${propertyId} to CSS:`, error);
        }
    });

    return cssLines.join('\n');
};

/**
 * Convert CSS string to style values object
 * Handles reverse mapping for derived properties like horizontalAlign
 */
export const cssToStyles = (css: string): StyleValues => {
    const values: StyleValues = {};
    const rawValues: Record<string, string> = {};

    // Split by semicolons and process each declaration
    const declarations = css.split(';').map(d => d.trim()).filter(Boolean);

    declarations.forEach(declaration => {
        const colonIndex = declaration.indexOf(':');
        if (colonIndex === -1) return;

        const property = declaration.substring(0, colonIndex).trim();
        const value = declaration.substring(colonIndex + 1).trim();

        // Convert CSS property name to camelCase
        const camelProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

        // Store raw values for pattern detection
        rawValues[camelProperty] = value;

        const config = CSS_PROPERTY_CONFIGS[camelProperty];
        if (!config) return;

        try {
            values[camelProperty] = config.fromCSSValue(value);
        } catch (error) {
            console.error(`Error parsing ${property} from CSS:`, error);
        }
    });

    // Detect patterns and convert to higher-level properties
    // horizontalAlign: detect margin-left/right auto patterns
    const ml = rawValues.marginLeft;
    const mr = rawValues.marginRight;

    if (ml === 'auto' && mr === 'auto') {
        values.horizontalAlign = 'center';
        delete values.marginLeft;
        delete values.marginRight;
    } else if (ml === 'auto' && (mr === '0' || mr === '0px' || !mr)) {
        values.horizontalAlign = 'right';
        delete values.marginLeft;
        delete values.marginRight;
    } else if ((ml === '0' || ml === '0px' || !ml) && mr === 'auto') {
        values.horizontalAlign = 'left';
        delete values.marginLeft;
        delete values.marginRight;
    }

    return values;
};

/**
 * Merge style values with defaults
 */
export const mergeWithDefaults = (values: StyleValues, propertyIds: string[]): StyleValues => {
    const merged: StyleValues = {};

    propertyIds.forEach(id => {
        const config = CSS_PROPERTY_CONFIGS[id];
        if (!config) return;

        merged[id] = values[id] !== undefined ? values[id] : config.defaultValue;
    });

    return merged;
};

/**
 * Validate a property value
 */
export const validatePropertyValue = (propertyId: string, value: any): boolean => {
    const config = CSS_PROPERTY_CONFIGS[propertyId];
    if (!config) return false;

    try {
        // Attempt conversion to CSS
        config.toCSSValue(value);
        return true;
    } catch {
        return false;
    }
};

/**
 * Get CSS variable name for a property
 */
export const getCSSVariableName = (propertyId: string): string => {
    return `--${propertyId.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
};
