/**
 * Form Validation Engine — Sprint 2
 *
 * A small, framework-agnostic rule engine for validating field values.
 * Each rule is a function (value) => string | null, returning an error
 * message when the value fails the rule or null when it passes.
 *
 * This module is pure and has no UI or store dependencies, so it is fully
 * unit-testable and usable on both the builder and runtime sides.
 */

export type ValidationRule = (value: unknown, context?: Record<string, unknown>) => string | null;

export interface FieldValidationError {
    field: string;
    message: string;
}

// ============ Rule factories ============

export function required(message = 'This field is required'): ValidationRule {
    return (value) => {
        if (value === null || value === undefined) return message;
        if (typeof value === 'string' && value.trim() === '') return message;
        if (Array.isArray(value) && value.length === 0) return message;
        return null;
    };
}

export function email(message = 'Enter a valid email address'): ValidationRule {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (value) => {
        if (value === null || value === undefined || value === '') return null;
        return re.test(String(value)) ? null : message;
    };
}

export function minLength(n: number, message?: string): ValidationRule {
    return (value) => {
        if (value === null || value === undefined || value === '') return null;
        const len = String(value).length;
        return len >= n ? null : (message || `Must be at least ${n} characters`);
    };
}

export function maxLength(n: number, message?: string): ValidationRule {
    return (value) => {
        if (value === null || value === undefined || value === '') return null;
        const len = String(value).length;
        return len <= n ? null : (message || `Must be at most ${n} characters`);
    };
}

export function pattern(regex: RegExp, message = 'Invalid format'): ValidationRule {
    return (value) => {
        if (value === null || value === undefined || value === '') return null;
        return regex.test(String(value)) ? null : message;
    };
}

export function numeric(message = 'Must be a number'): ValidationRule {
    return (value) => {
        if (value === null || value === undefined || value === '') return null;
        return !isNaN(Number(value)) ? null : message;
    };
}

export function url(message = 'Enter a valid URL'): ValidationRule {
    return (value) => {
        if (value === null || value === undefined || value === '') return null;
        try {
            // eslint-disable-next-line no-new
            new URL(String(value));
            return null;
        } catch {
            return message;
        }
    };
}

export function min(n: number, message?: string): ValidationRule {
    return (value) => {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        if (isNaN(num)) return null;
        return num >= n ? null : (message || `Must be at least ${n}`);
    };
}

export function max(n: number, message?: string): ValidationRule {
    return (value) => {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        if (isNaN(num)) return null;
        return num <= n ? null : (message || `Must be at most ${n}`);
    };
}

// ============ Core evaluation ============

/**
 * Validate a single value against a list of rules. Returns the first error or null.
 */
export function validateValue(value: unknown, rules: ValidationRule[], context?: Record<string, unknown>): string | null {
    for (const rule of rules) {
        const error = rule(value, context);
        if (error) return error;
    }
    return null;
}

/**
 * Validate multiple fields at once.
 *
 * @param values - field name -> value
 * @param rulesByField - field name -> rules
 * @returns array of field-level errors (only failing fields included)
 */
export function validateFields(
    values: Record<string, unknown>,
    rulesByField: Record<string, ValidationRule[]>
): FieldValidationError[] {
    const errors: FieldValidationError[] = [];
    for (const [field, rules] of Object.entries(rulesByField)) {
        const message = validateValue(values[field], rules);
        if (message) {
            errors.push({ field, message });
        }
    }
    return errors;
}

/**
 * True when no errors are present.
 */
export function isValid(errors: FieldValidationError[]): boolean {
    return errors.length === 0;
}
