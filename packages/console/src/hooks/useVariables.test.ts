import { describe, it, expect } from 'vitest';
import { getDefaultVariables, FilterCategory } from './useVariables';

/**
 * Filter-surface parity guard.
 *
 * The filter list shown in the picker comes from the BACKEND
 * (`TEMPLATE_FILTERS` in fastapi-backend/app/routers/variables.py); this
 * `getDefaultVariables()` is the offline fallback and MUST mirror it. These
 * tests lock the curated surface so accidental drift (a removed/renamed filter,
 * a missing category, a duplicate) becomes a red test rather than a silent UI
 * gap.
 *
 * The canonical name set is intentionally checked in here: editing the fallback
 * forces a matching edit to this list (and, per the comment in useVariables.ts,
 * to the backend).
 */
const CANONICAL_FILTER_NAMES = [
    // Text
    'upcase', 'downcase', 'capitalize', 'strip', 'strip_html', 'newline_to_br',
    'truncate', 'truncate_words', 'replace', 'remove', 'append', 'prepend',
    'slugify', 'escape_html', 'url_encode',
    // Numbers
    'plus', 'minus', 'times', 'divided_by', 'modulo', 'round', 'ceil', 'floor',
    'abs', 'at_least', 'at_most', 'size',
    // Lists
    'split', 'join', 'first', 'last', 'map', 'where', 'sort', 'sort_natural',
    'reverse', 'uniq', 'compact', 'slice',
    // Dates
    'date', 'date_format', 'time_ago', 'timezone',
    // Format
    'default', 'json', 'money', 'number', 'percent', 'pluralize',
] as const;

const VALID_CATEGORIES: FilterCategory[] = ['Text', 'Numbers', 'Lists', 'Dates', 'Format'];

describe('filter surface parity guard', () => {
    const filters = getDefaultVariables().filters;
    const names = filters.map(f => f.name);

    it('has no duplicate filter names', () => {
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        expect(dupes, `duplicate filter names: ${dupes.join(', ')}`).toEqual([]);
    });

    it('every filter has a valid category', () => {
        for (const f of filters) {
            expect(VALID_CATEGORIES, `${f.name} has bad category "${f.category}"`).toContain(f.category);
        }
    });

    it('exposes exactly the curated canonical set', () => {
        expect(new Set(names).size).toBe(CANONICAL_FILTER_NAMES.length);
        for (const name of CANONICAL_FILTER_NAMES) {
            expect(names, `missing filter: ${name}`).toContain(name);
        }
    });

    it('every category is non-empty', () => {
        for (const cat of VALID_CATEGORIES) {
            expect(filters.some(f => f.category === cat), `empty category: ${cat}`).toBe(true);
        }
    });
});
