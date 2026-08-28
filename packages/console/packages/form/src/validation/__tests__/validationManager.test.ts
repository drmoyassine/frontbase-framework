/**
 * Runtime Validation Manager Tests — Sprint 2
 */

import { describe, it, expect } from 'vitest';
import {
    validateField,
    validateFormData,
    isFieldRequired,
} from '../validationManager';
import type { ColumnSchema, FormFieldOverride } from '../../types';

const col = (over: Partial<ColumnSchema>): ColumnSchema => ({
    name: 'x',
    type: 'varchar(255)',
    nullable: true,
    primary_key: false,
    ...over,
});

describe('isFieldRequired', () => {
    it('derives required from non-nullable columns', () => {
        expect(isFieldRequired(col({ nullable: false }))).toBe(true);
        expect(isFieldRequired(col({ nullable: true }))).toBe(false);
    });
    it('override.required takes precedence', () => {
        expect(isFieldRequired(col({ nullable: false }), { validation: { required: false } })).toBe(false);
        expect(isFieldRequired(col({ nullable: true }), { validation: { required: true } })).toBe(true);
    });
    it('primary keys are never required', () => {
        expect(isFieldRequired(col({ primary_key: true, nullable: false }))).toBe(false);
    });
});

describe('validateField', () => {
    it('flags empty required fields', () => {
        expect(validateField('', col({ name: 'title', nullable: false }))).toBe('This field is required');
    });
    it('allows empty optional fields', () => {
        expect(validateField('', col({ name: 'title', nullable: true }))).toBeNull();
    });
    it('validates email columns', () => {
        expect(validateField('not-email', col({ name: 'email', nullable: true }))).toContain('email');
        expect(validateField('a@b.com', col({ name: 'email', nullable: true }))).toBeNull();
    });
    it('validates numeric columns', () => {
        expect(validateField('abc', col({ name: 'age', type: 'int', nullable: true }))).toContain('number');
        expect(validateField('42', col({ name: 'age', type: 'int', nullable: true }))).toBeNull();
    });
    it('applies override min/max', () => {
        const override: FormFieldOverride = { validation: { min: 3, max: 5 } };
        expect(validateField('ab', col({ name: 'code', nullable: true }), override)).toContain('at least 3');
        expect(validateField('abcdef', col({ name: 'code', nullable: true }), override)).toContain('at most 5');
    });
    it('applies override pattern', () => {
        const override: FormFieldOverride = { validation: { pattern: '^[A-Z]+$', patternError: 'Caps only' } };
        expect(validateField('abc', col({ name: 'code', nullable: true }), override)).toBe('Caps only');
        expect(validateField('ABC', col({ name: 'code', nullable: true }), override)).toBeNull();
    });
});

describe('validateFormData', () => {
    const columns: ColumnSchema[] = [
        col({ name: 'name', nullable: false }),
        col({ name: 'email', nullable: true }),
    ];

    it('returns valid when all required fields are present', () => {
        const r = validateFormData({ name: 'Alice', email: 'a@b.com' }, columns);
        expect(r.valid).toBe(true);
        expect(r.errors).toEqual({});
    });

    it('collects errors for missing required fields', () => {
        const r = validateFormData({ name: '', email: 'bad' }, columns);
        expect(r.valid).toBe(false);
        expect(r.errors.name).toBeDefined();
        expect(r.errors.email).toBeDefined();
    });

    it('skips hidden fields', () => {
        const r = validateFormData(
            { name: 'Alice' },
            columns,
            { email: { hidden: true } }
        );
        expect(r.valid).toBe(true);
    });
});
