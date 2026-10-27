import type { LiquidEngine } from './types';

/**
 * Register the Frontbase custom Liquid filters on an engine instance.
 *
 * Single source of truth for filters — moved out of services/edge/src/ssr/lib/liquid.ts
 * so SSR, the builder preview, and (later) the client runtime all use the same
 * definitions. Do not duplicate these anywhere else.
 *
 * Accepts a structural `LiquidEngine` so it works with whichever physical
 * liquidjs copy the caller has (root vs services/edge).
 */
export function registerFrontbaseFilters(engine: LiquidEngine): void {
    /**
     * Format as currency
     * Usage: {{ price | money }} → "$29.99"
     * Usage: {{ price | money: "EUR" }} → "€29.99"
     */
    engine.registerFilter('money', (value: number, currency: string = 'USD') => {
        const symbols: Record<string, string> = {
            USD: '$',
            EUR: '€',
            GBP: '£',
            KES: 'KSh',
            JPY: '¥',
            CNY: '¥',
            INR: '₹',
            BRL: 'R$',
            AUD: 'A$',
            CAD: 'C$',
        };
        const symbol = symbols[currency] || currency + ' ';
        const num = Number(value);
        if (isNaN(num)) return value;
        return `${symbol}${num.toFixed(2)}`;
    });

    /**
     * Relative time (time ago)
     * Usage: {{ createdAt | time_ago }} → "2 days ago"
     */
    engine.registerFilter('time_ago', (value: string | Date) => {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months} month${months > 1 ? 's' : ''} ago`;
        }
        const years = Math.floor(diffDays / 365);
        return `${years} year${years > 1 ? 's' : ''} ago`;
    });

    /**
     * Convert timezone
     * Usage: {{ system.datetime | timezone: visitor.timezone }} → "2026-01-18 17:00:00"
     */
    engine.registerFilter('timezone', (value: string, tz: string) => {
        try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;
            return date.toLocaleString('en-US', { timeZone: tz || 'UTC' });
        } catch {
            return value;
        }
    });

    /**
     * Format date
     * Usage: {{ date | date_format: "short" }} → "Jan 18, 2026"
     */
    engine.registerFilter('date_format', (value: string | Date, format: string = 'short') => {
        try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;

            switch (format) {
                case 'short':
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                case 'long':
                    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                case 'iso':
                    return date.toISOString().split('T')[0];
                case 'time':
                    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                default:
                    return date.toLocaleDateString();
            }
        } catch {
            return value;
        }
    });

    /** JSON stringify: {{ page.jsonld | json }} */
    engine.registerFilter('json', (value: unknown) => {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    });

    /** Pluralize: {{ count | pluralize: "item", "items" }} */
    engine.registerFilter('pluralize', (count: number, singular: string, plural: string) => {
        return count === 1 ? singular : plural;
    });

    /** Escape HTML entities: {{ userInput | escape_html }} */
    engine.registerFilter('escape_html', (value: string) => {
        if (typeof value !== 'string') return value;
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    });

    /** Truncate words (not characters): {{ text | truncate_words: 10 }} */
    engine.registerFilter('truncate_words', (value: string, wordCount: number = 10) => {
        if (typeof value !== 'string') return value;
        const words = value.split(/\s+/);
        if (words.length <= wordCount) return value;
        return words.slice(0, wordCount).join(' ') + '...';
    });

    /** Slugify: {{ title | slugify }} → "my-page-title" */
    engine.registerFilter('slugify', (value: string) => {
        if (typeof value !== 'string') return value;
        return value
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    });

    /** Number formatting with locale: {{ amount | number }} → "1,234.56" */
    engine.registerFilter('number', (value: number, locale: string = 'en-US') => {
        const num = Number(value);
        if (isNaN(num)) return value;
        return num.toLocaleString(locale);
    });

    /** Percentage: {{ ratio | percent }} → "75%"; {{ ratio | percent: 2 }} → "75.50%" */
    engine.registerFilter('percent', (value: number, decimals: number = 0) => {
        const num = Number(value);
        if (isNaN(num)) return value;
        return `${(num * 100).toFixed(decimals)}%`;
    });
}
