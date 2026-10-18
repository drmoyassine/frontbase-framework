import { savedViewFilters, type SavedFilter } from '@frontbase/edge-core/saved-view-filters';
/** Adapt the shared Data Inspector AST to PostgREST logic syntax, never SQL.
 * Refuse unproven value/operator shapes rather than omit a membership predicate. */
export function savedViewHttpPredicate(raw: unknown): string | undefined {
    const rules = savedViewFilters(raw); let nodes = 0;
    const scalar = (value: unknown): string => {
        if (typeof value === 'string' && !value.includes('\0')) return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return String(value);
        throw Error('unsupported_saved_http_value');
    };
    const compile = (rule: SavedFilter): string => {
        if (++nodes > 128) throw Error('saved_http_filter_limit');
        if ('logic' in rule) return rule.logic + '(' + rule.conditions.map(compile).join(',') + ')';
        const { field, operator, value } = rule;
        if (operator === 'is_null' || operator === 'not_null') return field + (operator === 'not_null' || value === false ? '.not.is.null' : '.is.null');
        if (operator === 'in') return field + '.in.(' + (value as unknown[]).map(scalar).join(',') + ')';
        if (['contains', 'starts_with', 'ends_with'].includes(operator)) {
            // Inspector uses case-insensitive SQL LIKE with %/_ wildcards. PostgREST
            // also aliases * to %, which would widen a literal *; reject that case.
            const text = String(value ?? '');
            if (value !== null && !['string', 'number', 'boolean'].includes(typeof value) || text.includes('*')) throw Error('unsupported_saved_http_pattern');
            return field + '.ilike.' + scalar((operator === 'starts_with' ? '' : '%') + text + (operator === 'ends_with' ? '' : '%'));
        }
        return field + '.' + operator + '.' + scalar(value);
    };
    const expression = rules.length ? 'and(' + rules.map(compile).join(',') + ')' : undefined;
    if (expression && encodeURIComponent(expression).length > 8192) throw Error('saved_http_filter_limit');
    return expression;
}
