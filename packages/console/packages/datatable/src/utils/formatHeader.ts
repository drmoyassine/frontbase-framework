import type { ColumnOverride } from '../types';

/**
 * Format column header for display
 * 
 * @example
 * // Custom label: formatHeader('first_name', { displayName: 'Name' }) → 'Name'
 * // Dot notation: formatHeader('countries.flag') → 'Countries › Flag'
 * // Underscores: formatHeader('first_name') → 'First Name'
 */
export function formatHeader(key: string, override?: ColumnOverride): string {
    // Check for custom label (builder uses 'displayName', alias 'label')
    if (override?.displayName) return override.displayName;
    if (override?.label) return override.label;

    // Auto-format: countries.flag → Countries › Flag
    return key;
}
