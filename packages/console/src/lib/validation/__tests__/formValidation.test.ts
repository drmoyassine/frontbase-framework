/**
 * Form Validation Engine Tests — Sprint 2
 */

import { describe, it, expect } from 'vitest';
import {
    required,
    email,
    minLength,
    maxLength,
    pattern,
    numeric,
    url,
    min,
    max,
    validateValue,
    validateFields,
    isValid,
} from '../formValidation';

describe('required', () => {
    it('fails on empty values', () => {
        expect(required()('')).toBe('This field is required');
        expect(required()(null)).toBe('This field is required');
        expect(required()(undefined)).toBe('This field is required');
        expect(required()([])).toBe('This field is required');
    });
    it('passes on present values', () => {
        expect(required()('x')).toBeNull();
        expect(required()(0)).toBeNull();
        expect(required()(['a'])).toBeNull();
    });
});

describe('email', () => {
    it('passes valid emails', () => {
        expect(email()('a@b.com')).toBeNull();
    });
    it('fails invalid emails', () => {
        expect(email()('not-an-email')).toBe('Enter a valid email address');
    });
    it('skips empty values', () => {
        expect(email()('')).toBeNull();
    });
});

describe('minLength / maxLength', () => {
    it('enforces minimum length', () => {
        expect(minLength(3)('ab')).toContain('at least 3');
        expect(minLength(3)('abc')).toBeNull();
    });
    it('enforces maximum length', () => {
        expect(maxLength(3)('abcd')).toContain('at most 3');
        expect(maxLength(3)('abc')).toBeNull();
    });
    it('skips empty values', () => {
        expect(minLength(3)('')).toBeNull();
        expect(maxLength(3)('')).toBeNull();
    });
});

describe('pattern', () => {
    it('matches valid input', () => {
        expect(pattern(/^[A-Z]+$/)('ABC')).toBeNull();
    });
    it('rejects invalid input', () => {
        expect(pattern(/^[A-Z]+$/)('abc')).toBe('Invalid format');
    });
});

describe('numeric / url / min / max', () => {
    it('numeric', () => {
        expect(numeric()('12')).toBeNull();
        expect(numeric()('abc')).toBe('Must be a number');
    });
    it('url', () => {
        expect(url()('https://example.com')).toBeNull();
        expect(url()('not a url')).toBe('Enter a valid URL');
    });
    it('min / max', () => {
        expect(min(5)(4)).toContain('at least 5');
        expect(max(5)(6)).toContain('at most 5');
        expect(min(5)(5)).toBeNull();
        expect(max(5)(5)).toBeNull();
    });
});

describe('validateValue', () => {
    it('returns the first failing rule', () => {
        const err = validateValue('ab', [required(), minLength(3)]);
        expect(err).toContain('at least 3');
    });
    it('returns null when all rules pass', () => {
        expect(validateValue('abc', [required(), minLength(3)])).toBeNull();
    });
});

describe('validateFields', () => {
    it('collects errors across fields', () => {
        const errors = validateFields(
            { name: '', email: 'bad' },
            { name: [required()], email: [email()] }
        );
        expect(errors).toHaveLength(2);
        expect(errors.map(e => e.field)).toEqual(['name', 'email']);
    });
    it('returns no errors when valid', () => {
        const errors = validateFields(
            { name: 'x', email: 'a@b.com' },
            { name: [required()], email: [email()] }
        );
        expect(errors).toHaveLength(0);
        expect(isValid(errors)).toBe(true);
    });
});
