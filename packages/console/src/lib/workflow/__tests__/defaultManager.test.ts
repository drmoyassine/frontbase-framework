/**
 * Default Value Manager Tests — Sprint 3
 */

import { describe, it, expect } from 'vitest';
import {
    applyDefaults,
    getRequiredFields,
    hasAllRequiredFields,
    validateNodeInputs,
    applyFieldDefault,
} from '../defaultManager';
import type { NodeInput } from '../defaultManager';

describe('applyDefaults', () => {
    it('fills in missing fields from the schema', () => {
        const result = applyDefaults('http_request', []);
        const names = result.map(i => i.name);
        expect(names).toContain('method');
        expect(names).toContain('url');
        const method = result.find(i => i.name === 'method');
        expect(method?.value).toBe('GET'); // schema default
    });

    it('preserves existing values', () => {
        const existing: NodeInput[] = [{ name: 'method', type: 'select', value: 'POST' }];
        const result = applyDefaults('http_request', existing);
        expect(result.find(i => i.name === 'method')?.value).toBe('POST');
    });

    it('returns inputs unchanged for unknown node types', () => {
        const existing: NodeInput[] = [{ name: 'x', type: 'string', value: 'y' }];
        expect(applyDefaults('unknown_type', existing)).toBe(existing);
    });
});

describe('getRequiredFields', () => {
    it('returns required fields for http_request', () => {
        const required = getRequiredFields('http_request');
        expect(required.map(f => f.name)).toContain('method');
        expect(required.map(f => f.name)).toContain('url');
    });
    it('returns empty for unknown types', () => {
        expect(getRequiredFields('unknown_type')).toHaveLength(0);
    });
});

describe('hasAllRequiredFields', () => {
    it('is true when all required fields are present', () => {
        const inputs: NodeInput[] = [
            { name: 'method', type: 'select', value: 'GET' },
            { name: 'url', type: 'string', value: 'https://example.com' },
        ];
        expect(hasAllRequiredFields('http_request', inputs)).toBe(true);
    });
    it('is false when a required field is missing', () => {
        const inputs: NodeInput[] = [
            { name: 'method', type: 'select', value: 'GET' },
        ];
        expect(hasAllRequiredFields('http_request', inputs)).toBe(false);
    });
});

describe('validateNodeInputs', () => {
    it('reports missing required fields', () => {
        const r = validateNodeInputs('http_request', []);
        expect(r.isValid).toBe(false);
        expect(r.errors.some(e => e.field === 'url')).toBe(true);
    });

    it('passes when required fields are present', () => {
        const r = validateNodeInputs('http_request', [
            { name: 'method', type: 'select', value: 'GET' },
            { name: 'url', type: 'string', value: 'https://example.com' },
        ]);
        expect(r.isValid).toBe(true);
    });

    it('applies defaults for missing optional fields', () => {
        const r = validateNodeInputs('http_request', [
            { name: 'method', type: 'select', value: 'GET' },
            { name: 'url', type: 'string', value: 'https://example.com' },
        ]);
        // timeout has a schema default (30000)
        expect(r.appliedDefaults).toContain('timeout');
    });

    it('reports type coercion errors', () => {
        const r = validateNodeInputs('http_request', [
            { name: 'method', type: 'select', value: 'GET' },
            { name: 'url', type: 'string', value: 'https://example.com' },
            { name: 'timeout', type: 'number', value: 'not-a-number' },
        ]);
        expect(r.errors.some(e => e.field === 'timeout')).toBe(true);
    });
});

describe('applyFieldDefault', () => {
    it('applies a default when the value is empty', () => {
        const r = applyFieldDefault('http_request', 'method', '');
        expect(r.appliedDefault).toBe(true);
        expect(r.value).toBe('GET');
    });
    it('keeps the current value when present', () => {
        const r = applyFieldDefault('http_request', 'method', 'POST');
        expect(r.appliedDefault).toBe(false);
        expect(r.value).toBe('POST');
    });
});
