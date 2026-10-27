/**
 * Page Validation Tests — Sprint 2
 */

import { describe, it, expect } from 'vitest';
import {
    validatePageForms,
    validatePageForSave,
    validatePageForPublish,
} from '../pageValidation';

describe('validatePageForms', () => {
    it('passes when there are no forms', () => {
        const page = { layoutData: { content: [{ type: 'heading', props: {} }] } };
        expect(validatePageForms(page)).toHaveLength(0);
    });

    it('passes when a form has a valid binding', () => {
        const page = {
            layoutData: {
                content: [{ type: 'form', props: { binding: { tableName: 'users' } } }],
            },
        };
        expect(validatePageForms(page)).toHaveLength(0);
    });

    it('flags a form with no binding', () => {
        const page = { layoutData: { content: [{ type: 'form', props: {} }] } };
        const errors = validatePageForms(page);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('no data binding');
    });

    it('flags a form with an empty tableName', () => {
        const page = {
            layoutData: {
                content: [{ type: 'form', props: { binding: { tableName: '' } } }],
            },
        };
        const errors = validatePageForms(page);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toContain('tableName');
    });

    it('handles a page with no layoutData', () => {
        expect(validatePageForms({})).toHaveLength(0);
    });
});

describe('validatePageForSave', () => {
    it('is valid for a well-formed page', () => {
        const page = {
            layoutData: { content: [{ type: 'form', props: { binding: { tableName: 'users' } } }] },
        };
        expect(validatePageForSave(page).valid).toBe(true);
    });

    it('reports form binding errors', () => {
        const page = { layoutData: { content: [{ type: 'form', props: {} }] } };
        const r = validatePageForSave(page);
        expect(r.valid).toBe(false);
        expect(r.errors.length).toBeGreaterThan(0);
    });
});

describe('validatePageForPublish', () => {
    it('requires slug and name', () => {
        const page = {
            name: '',
            slug: '',
            layoutData: { content: [{ type: 'form', props: { binding: { tableName: 'users' } } }] },
        };
        const r = validatePageForPublish(page);
        expect(r.valid).toBe(false);
        expect(r.errors.some(e => e.field === 'slug')).toBe(true);
        expect(r.errors.some(e => e.field === 'name')).toBe(true);
    });

    it('passes when slug and name are present and forms are bound', () => {
        const page = {
            name: 'Home',
            slug: 'home',
            layoutData: { content: [{ type: 'form', props: { binding: { tableName: 'users' } } }] },
        };
        expect(validatePageForPublish(page).valid).toBe(true);
    });
});
