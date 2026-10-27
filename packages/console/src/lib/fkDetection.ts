/**
 * Heuristic foreign-key detection (Sprint 3G).
 *
 * For datasources with no native FK reflection (Google Sheets, REST, WordPress),
 * pre-fill the relationship editor by guessing likely FKs from column names:
 *   `school_id`  → references table `school` or `schools` (high confidence)
 *   `user_id` / `created_by` / `owner_id` → references `users` (medium confidence)
 *
 * Pure + synchronous — given a table's columns and the list of all tables, returns
 * suggestions the UI can show with one-click "Add". False positives are expected;
 * the user dismisses them. See risks in sprint3.md §3G.
 */

import type { RelationshipDefinition } from '@/modules/dbsync/types/relationship';

export type FkConfidence = 'high' | 'medium';

export interface FkSuggestion extends RelationshipDefinition {
    confidence: FkConfidence;
    /** Human-readable explanation for the UI tooltip. */
    reason: string;
}

/** User-ish columns that conventionally reference a `users` table. */
const USER_REF_COLUMNS = new Set(['user_id', 'created_by', 'updated_by', 'owner_id', 'author_id', 'modified_by']);

/**
 * Derive candidate table names from a `_id` suffix base. Tries the singular base
 * plus the common English plural forms (`+s`, `+es`, `-y→ies`). Imperfect but
 * covers the frequent cases (school→schools, class→classes, category→categories);
 * the user confirms each suggestion either way.
 */
function candidateTables(base: string): string[] {
    const cands = [base, `${base}s`];
    if (/(s|x|z|ch|sh)$/.test(base)) cands.push(`${base}es`);          // class → classes
    if (base.endsWith('y') && !/[aeiou]y$/.test(base)) cands.push(base.slice(0, -1) + 'ies'); // category → categories
    return cands;
}

/**
 * Detect likely FK columns on `fromTable`.
 *
 * @param fromTable   The table whose columns we're scanning.
 * @param fromColumns Column names of `fromTable`.
 * @param allTables   Every table name in the datasource (to confirm a target exists).
 */
export function detectFkSuggestions(
    fromTable: string,
    fromColumns: string[],
    allTables: string[],
): FkSuggestion[] {
    const tableSet = new Set(allTables);
    const suggestions: FkSuggestion[] = [];

    for (const col of fromColumns) {
        // 1. {entity}_id pattern → look for a matching table.
        const m = col.match(/^(.+)_id$/);
        if (m) {
            const base = m[1];
            const target = candidateTables(base).find((t) => tableSet.has(t));
            if (target) {
                suggestions.push({
                    from_table: fromTable,
                    from_column: col,
                    to_table: target,
                    to_column: 'id',
                    relationship_type: 'many_to_one',
                    confidence: 'high',
                    reason: `Column "${col}" looks like a reference to the "${target}" table.`,
                });
                continue;
            }
        }

        // 2. Conventional user-reference columns → `users` table.
        if (USER_REF_COLUMNS.has(col) && tableSet.has('users')) {
            suggestions.push({
                from_table: fromTable,
                from_column: col,
                to_table: 'users',
                to_column: 'id',
                relationship_type: 'many_to_one',
                confidence: 'medium',
                reason: `Column "${col}" conventionally references the "users" table.`,
            });
        }
    }

    return suggestions;
}

/**
 * Filter out suggestions that already exist as defined relationships (by
 * from_table + from_column). Used so the UI only shows novel suggestions.
 */
export function novelSuggestions(
    suggestions: FkSuggestion[],
    existing: RelationshipDefinition[],
): FkSuggestion[] {
    const taken = new Set(existing.map((r) => `${r.from_table}.${r.from_column}`));
    return suggestions.filter((s) => !taken.has(`${s.from_table}.${s.from_column}`));
}
