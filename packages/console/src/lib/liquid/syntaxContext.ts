/**
 * Syntax context for `@`-enabled inputs.
 *
 * Every variable-enabled input declares which kind of Liquid expression it
 * accepts, so the variable picker can gate which categories it offers. This is
 * the enabler for safe Liquid authoring: a tag is output/control-flow and is
 * not valid in an expression (visibility/RLS, which want a bare boolean) or a
 * scalar (a filter value).
 *
 *   - 'output'     Text / labels / props — full tags ({% if %}, {% for %}),
 *                  filters, and variables are all valid. (Logic snippets are
 *                  offered here only — see Stage 6.)
 *   - 'expression' Visibility / RLS — a bare boolean; stays on the query-builder
 *                  track. NO raw tags, NO filters.
 *   - 'scalar'     Filter values — variables + filters, but no control-flow tags.
 */
export type SyntaxContext = 'output' | 'expression' | 'scalar';

/** Default context — preserves pre-existing behavior (filters via `|`, no tags). */
export const DEFAULT_SYNTAX_CONTEXT: SyntaxContext = 'scalar';

/** Filters (the `|` trigger) are valid in output and scalar contexts only. */
export function filtersAllowedForContext(ctx: SyntaxContext | undefined): boolean {
    return ctx !== 'expression';
}

/** Logic snippets ({% if %}/{% for %}/...) are valid in output contexts only. */
export function logicAllowedForContext(ctx: SyntaxContext | undefined): boolean {
    return ctx === 'output';
}
