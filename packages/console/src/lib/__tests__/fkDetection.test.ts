import { describe, it, expect } from 'vitest';
import { detectFkSuggestions, novelSuggestions } from '../fkDetection';
import type { RelationshipDefinition } from '@/modules/dbsync/types/relationship';

const TABLES = ['students', 'schools', 'classes', 'users', 'teachers'];

describe('detectFkSuggestions (Sprint 3G)', () => {
    it('detects _id columns that match an existing table (singular→plural)', () => {
        const s = detectFkSuggestions('students', ['id', 'name', 'school_id', 'class_id'], TABLES);
        const tables = s.map((x) => x.to_table).sort();
        expect(tables).toEqual(['classes', 'schools']);
        expect(s.find((x) => x.from_column === 'school_id')).toMatchObject({
            to_table: 'schools',
            to_column: 'id',
            relationship_type: 'many_to_one',
            confidence: 'high',
        });
    });

    it('also accepts a singular target table', () => {
        const s = detectFkSuggestions('orders', ['teacher_id'], TABLES);
        expect(s[0].to_table).toBe('teachers'); // base "teacher" → "teachers"
    });

    it('suggests users for conventional user-ref columns', () => {
        const s = detectFkSuggestions('posts', ['id', 'created_by', 'author_id'], TABLES);
        expect(s.every((x) => x.to_table === 'users' && x.confidence === 'medium')).toBe(true);
        expect(s).toHaveLength(2);
    });

    it('does not suggest when no matching table exists', () => {
        const s = detectFkSuggestions('x', ['category_id', 'weird_value'], TABLES);
        expect(s).toEqual([]); // no "category"/"categories" table
    });

    it('ignores plain id and non-_id columns', () => {
        const s = detectFkSuggestions('students', ['id', 'name', 'email'], TABLES);
        expect(s).toEqual([]);
    });
});

describe('novelSuggestions', () => {
    it('filters out already-defined relationships', () => {
        const suggestions = detectFkSuggestions('students', ['school_id', 'class_id'], TABLES);
        const existing: RelationshipDefinition[] = [
            { from_table: 'students', from_column: 'school_id', to_table: 'schools', to_column: 'id' },
        ];
        const novel = novelSuggestions(suggestions, existing);
        expect(novel.map((s) => s.from_column)).toEqual(['class_id']);
    });
});
