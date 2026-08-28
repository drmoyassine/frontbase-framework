/**
 * useVariables Hook
 * 
 * Fetches available template variables and filters from the API.
 * Used by VariablePicker for autocomplete suggestions.
 */

import { useQuery } from '@tanstack/react-query';

export interface Variable {
    path: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
    source: 'page' | 'user' | 'visitor' | 'url' | 'system' | 'record' | 'local' | 'session' | 'cookies';
    description?: string;
}

export type FilterCategory = 'Text' | 'Numbers' | 'Lists' | 'Dates' | 'Format';

export interface Filter {
    name: string;
    args?: string[];
    description: string;
    /** Picker category. Absent → bucketed into 'Format' so a pre-deploy backend
     * never drops a filter from the list. */
    category?: FilterCategory;
}

interface VariablesResponse {
    variables: Variable[];
    filters: Filter[];
}

/**
 * Hook to fetch available template variables and filters.
 * Optionally accepts a pageId to include page-specific custom variables.
 */
export function useVariables(pageId?: string) {
    const { data, isLoading, error } = useQuery<VariablesResponse>({
        queryKey: ['variables', pageId],
        queryFn: async () => {
            try {
                const url = pageId
                    ? `/api/variables/registry?page_id=${encodeURIComponent(pageId)}`
                    : '/api/variables/registry';
                const response = await fetch(url, {
                    credentials: 'include'
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch variables registry');
                }
                return response.json();
            } catch (err) {
                // If API fails, return static defaults
                console.warn('Failed to fetch variables from API, using defaults:', err);
                return getDefaultVariables();
            }
        },
        staleTime: 60_000, // custom TTL (not a STALE tier) — Cache for 1 minute
        retry: false, // Don't retry if API fails
    });

    return {
        variables: data?.variables || [],
        filters: data?.filters || [],
        isLoading,
        error,
    };
}

/**
 * Static default variables (fallback when API unavailable).
 *
 * Exported so the filter surface can be parity-tested — the curated filter set
 * here MUST mirror `TEMPLATE_FILTERS` in
 * fastapi-backend/app/routers/variables.py (the real served list).
 */
export function getDefaultVariables(): VariablesResponse {
    return {
        variables: [
            // Page
            { path: 'page.id', type: 'string', source: 'page', description: 'Page ID' },
            { path: 'page.title', type: 'string', source: 'page', description: 'Page title' },
            { path: 'page.slug', type: 'string', source: 'page', description: 'Page slug/URL' },
            { path: 'page.url', type: 'string', source: 'page', description: 'Full page URL' },
            { path: 'page.description', type: 'string', source: 'page', description: 'Meta description' },
            { path: 'page.image', type: 'string', source: 'page', description: 'OG image URL' },

            // Visitor (Basic - Always Available)
            { path: 'visitor.country', type: 'string', source: 'visitor', description: 'Country code' },
            { path: 'visitor.city', type: 'string', source: 'visitor', description: 'City name' },
            { path: 'visitor.timezone', type: 'string', source: 'visitor', description: 'Timezone offset' },
            { path: 'visitor.device', type: 'string', source: 'visitor', description: 'Device type (mobile/tablet/desktop)' },

            // Visitor (Configurable - Controlled by Settings > Privacy & Tracking)
            { path: 'visitor.ip', type: 'string', source: 'visitor', description: 'IP address' },
            { path: 'visitor.browser', type: 'string', source: 'visitor', description: 'Browser name' },
            { path: 'visitor.os', type: 'string', source: 'visitor', description: 'Operating system' },
            { path: 'visitor.language', type: 'string', source: 'visitor', description: 'Preferred language' },

            // User
            { path: 'user.id', type: 'string', source: 'user', description: 'User ID' },
            { path: 'user.email', type: 'string', source: 'user', description: 'Email address' },
            { path: 'user.name', type: 'string', source: 'user', description: 'Full name' },
            { path: 'user.firstName', type: 'string', source: 'user', description: 'First name' },
            { path: 'user.lastName', type: 'string', source: 'user', description: 'Last name' },
            { path: 'user.avatar', type: 'string', source: 'user', description: 'Avatar URL' },
            { path: 'user.role', type: 'string', source: 'user', description: 'User role' },

            // URL
            { path: 'url.param_name', type: 'string', source: 'url', description: 'Value of query parameter (e.g. ?id=123)' },

            // System
            { path: 'system.date', type: 'string', source: 'system', description: 'Current date (UTC)' },
            { path: 'system.time', type: 'string', source: 'system', description: 'Current time (UTC)' },
            { path: 'system.datetime', type: 'string', source: 'system', description: 'ISO timestamp (UTC)' },
            { path: 'system.year', type: 'number', source: 'system', description: 'Current year' },
            { path: 'system.month', type: 'number', source: 'system', description: 'Current month' },
            { path: 'system.day', type: 'number', source: 'system', description: 'Current day' },

            // Record (data binding)

            { path: 'record.field_name', type: 'any', source: 'record', description: 'Field from the current data record' },

            // User-defined
            { path: 'local.variable_name', type: 'any', source: 'local', description: 'Page-level local variable' },
            { path: 'session.variable_name', type: 'any', source: 'session', description: 'Session storage variable' },
            { path: 'cookies.cookie_name', type: 'string', source: 'cookies', description: 'Browser cookie value' },
        ],
        filters: [
            // ── Text ──────────────────────────────────────────────
            { name: 'upcase', description: 'Convert to UPPERCASE', category: 'Text' },
            { name: 'downcase', description: 'Convert to lowercase', category: 'Text' },
            { name: 'capitalize', description: 'Capitalize the first letter', category: 'Text' },
            { name: 'strip', description: 'Trim whitespace from both ends', category: 'Text' },
            { name: 'strip_html', description: 'Remove HTML tags', category: 'Text' },
            { name: 'newline_to_br', description: 'Turn line breaks into <br>', category: 'Text' },
            { name: 'truncate', args: ['length'], description: 'Cut to a max length (with …)', category: 'Text' },
            { name: 'truncate_words', args: ['count'], description: 'Cut to N words (with …)', category: 'Text' },
            { name: 'replace', args: ['search', 'replacement'], description: 'Replace all matches', category: 'Text' },
            { name: 'remove', args: ['text'], description: 'Remove all matches', category: 'Text' },
            { name: 'append', args: ['text'], description: 'Add text to the end', category: 'Text' },
            { name: 'prepend', args: ['text'], description: 'Add text to the start', category: 'Text' },
            { name: 'slugify', description: 'Make a URL-friendly slug', category: 'Text' },
            { name: 'escape_html', description: 'Escape HTML special characters', category: 'Text' },
            { name: 'url_encode', description: 'URL-encode for use in links', category: 'Text' },

            // ── Numbers ───────────────────────────────────────────
            { name: 'plus', args: ['number'], description: 'Add', category: 'Numbers' },
            { name: 'minus', args: ['number'], description: 'Subtract', category: 'Numbers' },
            { name: 'times', args: ['number'], description: 'Multiply', category: 'Numbers' },
            { name: 'divided_by', args: ['number'], description: 'Divide', category: 'Numbers' },
            { name: 'modulo', args: ['number'], description: 'Remainder', category: 'Numbers' },
            { name: 'round', args: ['decimals'], description: 'Round (default 0 decimals)', category: 'Numbers' },
            { name: 'ceil', description: 'Round up', category: 'Numbers' },
            { name: 'floor', description: 'Round down', category: 'Numbers' },
            { name: 'abs', description: 'Absolute value', category: 'Numbers' },
            { name: 'at_least', args: ['number'], description: 'Minimum value', category: 'Numbers' },
            { name: 'at_most', args: ['number'], description: 'Maximum value', category: 'Numbers' },
            { name: 'size', description: 'Length of text or list', category: 'Numbers' },

            // ── Lists ─────────────────────────────────────────────
            { name: 'split', args: ['delimiter'], description: 'Split text into a list', category: 'Lists' },
            { name: 'join', args: ['separator'], description: 'Join a list into text', category: 'Lists' },
            { name: 'first', description: 'First item of a list', category: 'Lists' },
            { name: 'last', description: 'Last item of a list', category: 'Lists' },
            { name: 'map', args: ['field'], description: 'Pick a field from each item (operates on a list)', category: 'Lists' },
            { name: 'where', args: ['field', 'value'], description: 'Keep items where field = value (operates on a list)', category: 'Lists' },
            { name: 'sort', args: ['property'], description: 'Sort (by property)', category: 'Lists' },
            { name: 'sort_natural', args: ['property'], description: 'Case-insensitive sort', category: 'Lists' },
            { name: 'reverse', description: 'Reverse a list or text', category: 'Lists' },
            { name: 'uniq', description: 'Remove duplicates (operates on a list)', category: 'Lists' },
            { name: 'compact', description: 'Remove blank items (operates on a list)', category: 'Lists' },
            { name: 'slice', args: ['start', 'length'], description: 'Take a slice', category: 'Lists' },

            // ── Dates ─────────────────────────────────────────────
            { name: 'date', args: ['format'], description: 'Format a date (strftime)', category: 'Dates' },
            { name: 'date_format', args: ['format'], description: 'Format (short/long/iso/time)', category: 'Dates' },
            { name: 'time_ago', description: 'Relative time (2 days ago)', category: 'Dates' },
            { name: 'timezone', args: ['tz'], description: 'Convert timezone', category: 'Dates' },

            // ── Format ────────────────────────────────────────────
            { name: 'default', args: ['value'], description: 'Fallback if empty', category: 'Format' },
            { name: 'json', description: 'Output as JSON', category: 'Format' },
            { name: 'money', args: ['currency'], description: 'Currency ($29.99)', category: 'Format' },
            { name: 'number', args: ['locale'], description: 'Number with separators (1,234)', category: 'Format' },
            { name: 'percent', args: ['decimals'], description: 'Percentage', category: 'Format' },
            { name: 'pluralize', args: ['singular', 'plural'], description: 'Singular/plural by count', category: 'Format' },
        ],
    };
}
