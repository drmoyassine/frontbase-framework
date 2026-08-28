/**
 * Workflow Type Validation & Coercion Tests — Sprint 3
 */

import { describe, it, expect } from 'vitest';
import { coerceValue, validateType, validateAndCoerceType } from '../validation';

describe('coerceValue', () => {
    it('coerces strings to numbers', () => {
        const r = coerceValue('number', '42');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value).toBe(42);
            expect(r.coerced).toBe(true);
        }
    });

    it('fails on non-numeric strings', () => {
        expect(coerceValue('number', 'abc').ok).toBe(false);
    });

    it('coerces strings to booleans', () => {
        expect(coerceValue('boolean', 'true')).toMatchObject({ ok: true, value: true });
        expect(coerceValue('boolean', '0')).toMatchObject({ ok: true, value: false });
    });

    it('parses json strings', () => {
        const r = coerceValue('json', '{"a":1}');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toEqual({ a: 1 });
    });

    it('wraps scalars into arrays', () => {
        const r = coerceValue('array', 'x');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toEqual(['x']);
    });

    it('passes empty values through untouched', () => {
        expect(coerceValue('number', '').ok).toBe(true);
        expect(coerceValue('number', null).ok).toBe(true);
    });

    it('accepts UI field types as-is', () => {
        expect(coerceValue('select', 'GET').ok).toBe(true);
        expect(coerceValue('keyValue', []).ok).toBe(true);
    });
});

describe('validateType', () => {
    it('passes for exact types', () => {
        expect(validateType('number', 5).valid).toBe(true);
        expect(validateType('string', 'hi').valid).toBe(true);
    });
    it('flags coerced values', () => {
        expect(validateType('number', '5').valid).toBe(false);
    });
    it('passes empty values', () => {
        expect(validateType('number', '').valid).toBe(true);
    });
});

describe('validateAndCoerceType', () => {
    it('returns coerced value', () => {
        const r = validateAndCoerceType('number', '7');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toBe(7);
    });
});
