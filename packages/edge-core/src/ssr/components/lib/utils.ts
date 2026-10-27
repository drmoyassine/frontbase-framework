/**
 * Utility functions for SSR components
 */

/**
 * Escape HTML entities to prevent XSS attacks
 */
export function escapeHtml(str: string): string {
    if (!str || typeof str !== 'string') return '';

    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = 'fb'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
