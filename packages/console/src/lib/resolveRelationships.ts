/**
 * Relationship graph + multi-level path resolution (Sprint 3H).
 *
 * Supports nested relationships like `students → schools → districts` (A→B→C)
 * by treating user/native relationships as a directed graph and finding a path
 * between two tables. A cycle guard (visited set) prevents infinite loops on
 * circular references.
 *
 * Pure + synchronous; used to translate a requested "show me X from table Y"
 * into either a PostgREST nested select (Supabase) or a sequence of fetches.
 */

import type { RelationshipDefinition } from '@/modules/dbsync/types/relationship';

export interface RelEdge {
    from_table: string;
    from_column: string;
    to_table: string;
    to_column: string;
}

/** Build an adjacency map: from_table → edges leaving it. */
export function buildGraph(rels: RelationshipDefinition[]): Map<string, RelEdge[]> {
    const graph = new Map<string, RelEdge[]>();
    for (const r of rels) {
        const edge: RelEdge = {
            from_table: r.from_table,
            from_column: r.from_column,
            to_table: r.to_table,
            to_column: r.to_column,
        };
        const list = graph.get(edge.from_table) || [];
        list.push(edge);
        graph.set(edge.from_table, list);
    }
    return graph;
}

/** True if `from` can reach `to` through any chain of relationships. */
export function canReach(rels: RelationshipDefinition[], from: string, to: string): boolean {
    return findPath(rels, from, to) !== null;
}

/**
 * Find a relationship chain from `from` to `to`. Returns the list of edges, or
 * null if no path exists. Cycle-safe (a visited set stops circular refs) and
 * depth-bounded (`maxDepth`, default 4) to cap cost on pathological schemas.
 */
export function findPath(
    rels: RelationshipDefinition[],
    from: string,
    to: string,
    maxDepth = 4,
): RelEdge[] | null {
    if (from === to) return [];
    const graph = buildGraph(rels);
    const visited = new Set<string>([from]);

    const dfs = (node: string, path: RelEdge[]): RelEdge[] | null => {
        if (node === to) return path;
        if (path.length >= maxDepth) return null;
        for (const edge of graph.get(node) || []) {
            // Cycle guard: never revisit a table already on the current exploration.
            if (visited.has(edge.to_table)) continue;
            visited.add(edge.to_table);
            const found = dfs(edge.to_table, [...path, edge]);
            if (found) return found;
            visited.delete(edge.to_table); // backtrack to explore alternatives
        }
        return null;
    };

    return dfs(from, []);
}

/**
 * Translate a relationship chain to a PostgREST nested `select` clause.
 *   [{to_table: 'schools'}, {to_table: 'districts'}]
 *     → 'schools(*),districts(*)'
 * Pass `columnsByTable` to project specific columns per table (Sprint 3E).
 */
export function toPostgrestSelect(
    path: RelEdge[],
    columnsByTable?: Record<string, string[]>,
): string {
    return path
        .map((edge) => {
            const cols = columnsByTable?.[edge.to_table];
            const colSpec = cols && cols.length ? cols.join(',') : '*';
            return `${edge.to_table}(${colSpec})`;
        })
        .join(',');
}
