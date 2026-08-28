import { describe, it, expect } from 'vitest';
import { findPath, canReach, toPostgrestSelect, buildGraph } from '../resolveRelationships';
import type { RelationshipDefinition } from '@/modules/dbsync/types/relationship';

const RELS: RelationshipDefinition[] = [
    { from_table: 'students', from_column: 'school_id', to_table: 'schools', to_column: 'id' },
    { from_table: 'schools', from_column: 'district_id', to_table: 'districts', to_column: 'id' },
    { from_table: 'classes', from_column: 'school_id', to_table: 'schools', to_column: 'id' },
];

describe('resolveRelationships (Sprint 3H)', () => {
    it('finds a direct (1-hop) path', () => {
        const path = findPath(RELS, 'students', 'schools');
        expect(path).toHaveLength(1);
        expect(path![0]).toMatchObject({ from_table: 'students', to_table: 'schools' });
    });

    it('finds a multi-level (2-hop) path A→B→C', () => {
        const path = findPath(RELS, 'students', 'districts');
        expect(path).toHaveLength(2);
        expect(path!.map((e) => e.to_table)).toEqual(['schools', 'districts']);
    });

    it('returns null when no path exists', () => {
        expect(findPath(RELS, 'districts', 'students')).toBeNull(); // edges point student→school→district only
    });

    it('returns [] for same-table (zero hops)', () => {
        expect(findPath(RELS, 'students', 'students')).toEqual([]);
    });

    it('detects and survives a cycle (no infinite loop)', () => {
        const cyclic: RelationshipDefinition[] = [
            { from_table: 'a', from_column: 'b_id', to_table: 'b', to_column: 'id' },
            { from_table: 'b', from_column: 'a_id', to_table: 'a', to_column: 'id' }, // a↔b cycle
            { from_table: 'b', from_column: 'c_id', to_table: 'c', to_column: 'id' },
        ];
        // a→b→c must resolve despite the a↔b cycle.
        const path = findPath(cyclic, 'a', 'c');
        expect(path).not.toBeNull();
        expect(path!.map((e) => e.to_table)).toEqual(['b', 'c']);
    });

    it('canReach agrees with findPath', () => {
        expect(canReach(RELS, 'students', 'districts')).toBe(true);
        expect(canReach(RELS, 'districts', 'students')).toBe(false);
    });

    it('buildGraph produces an adjacency map', () => {
        const g = buildGraph(RELS);
        expect(g.get('students')).toHaveLength(1);
        expect(g.get('schools')![0].to_table).toBe('districts');
        expect(g.has('districts')).toBe(false); // no outgoing edges
    });
});

describe('toPostgrestSelect', () => {
    it('emits a nested select with * by default', () => {
        const path = findPath(RELS, 'students', 'districts')!;
        expect(toPostgrestSelect(path)).toBe('schools(*),districts(*)');
    });

    it('projects requested columns per table (3E integration)', () => {
        const path = findPath(RELS, 'students', 'districts')!;
        expect(
            toPostgrestSelect(path, { schools: ['id', 'name'], districts: ['id', 'label'] }),
        ).toBe('schools(id,name),districts(id,label)');
    });
});
