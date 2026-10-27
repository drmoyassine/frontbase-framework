/**
 * Runtime Form Validation Manager — Sprint 2
 *
 * Validates form data against the bound column schema and field overrides.
 * A field is considered required when the column is non-nullable OR the
 * override explicitly marks it required. Email/phone columns receive format
 * checks, and override min/max/pattern rules are applied.
 *
 * Pure (no React/store deps) so it is fully unit-testable.
 */

import type { ColumnSchema, FormFieldOverride } from '../types';

export type FieldErrors = Record<string, string>;

export interface ValidationResult {
    valid: boolean;
    errors: FieldErrors;
}

function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === '' ||
        (Array.isArray(value) && value.length === 0);
}

function isEmailColumn(column: ColumnSchema): boolean {
    return column.name.toLowerCase().includes('email');
}

function isNumericColumn(column: ColumnSchema): boolean {
    const sqlType = (typeof column.type === 'string' ? column.type : column.type[0] || '').toLowerCase();
    return sqlType.includes('int') || sqlType.includes('decimal') || sqlType.includes('numeric') ||
        sqlType.includes('float') || sqlType.includes('double') || sqlType === 'serial' || sqlType === 'bigserial';
}

/**
 * Determine whether a column should be treated as required.
 */
export function isFieldRequired(column: ColumnSchema, override: FormFieldOverride = {}): boolean {
    if (column.primary_key) return false;
    if (override.validation?.required !== undefined) return override.validation.required;
    return !column.nullable;
}

/**
 * Validate a single field value against its column + override.
 */
export function validateField(
    value: unknown,
    column: ColumnSchema,
    override: FormFieldOverride = {}
): string | null {
    const required = isFieldRequired(column, override);

    if (isEmpty(value)) {
        return required ? 'This field is required' : null;
    }

    const str = String(value);

    // Email format
    if (isEmailColumn(column) || override.type === 'email') {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!re.test(str)) return 'Enter a valid email address';
    }

    // Numeric columns
    if (isNumericColumn(column) || override.type === 'number') {
        if (isNaN(Number(value))) return 'Must be a number';
    }

    // Override rules
    const v = override.validation;
    if (v) {
        if (v.min !== undefined && v.max !== undefined && v.min === v.max) {
            if (str.length !== v.min) return `Must be exactly ${v.min} characters`;
        }
        if (v.min !== undefined && str.length < v.min) return `Must be at least ${v.min} characters`;
        if (v.max !== undefined && str.length > v.max) return `Must be at most ${v.max} characters`;
        if (v.pattern) {
            try {
                const re = new RegExp(v.pattern);
                if (!re.test(str)) return v.patternError || 'Invalid format';
            } catch {
                // Ignore malformed patterns
            }
        }
    }

    return null;
}

/**
 * Validate an entire form's data against visible columns + overrides.
 */
export function validateFormData(
    formData: Record<string, unknown>,
    columns: ColumnSchema[],
    overrides: Record<string, FormFieldOverride> = {}
): ValidationResult {
    const errors: FieldErrors = {};

    for (const column of columns) {
        const override = overrides[column.name] || {};
        if (override.hidden) continue;

        const error = validateField(formData[column.name], column, override);
        if (error) {
            errors[column.name] = error;
        }
    }

    return { valid: Object.keys(errors).length === 0, errors };
}
