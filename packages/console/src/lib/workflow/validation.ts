/**
 * Workflow Type Validation & Coercion — Sprint 3
 *
 * Utilities for validating node input values against their declared schema
 * type and coercing compatible-but-mismatched values. Pure and fully
 * unit-testable.
 */

export type CoerceResult =
    | { ok: true; value: unknown; coerced: boolean }
    | { ok: false; error: string };

function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === '';
}

/**
 * Attempt to coerce a value to the target type. Returns the coerced value
 * (and a `coerced` flag) or an error when conversion is impossible.
 */
export function coerceValue(targetType: string, value: unknown): CoerceResult {
    if (isEmpty(value)) {
        return { ok: true, value, coerced: false };
    }

    const target = targetType.toLowerCase().trim();

    switch (target) {
        case 'string':
        case 'text':
            return { ok: true, value: String(value), coerced: typeof value !== 'string' };

        case 'number':
        case 'integer':
        case 'float':
        case 'double': {
            const num = Number(value);
            if (isNaN(num)) {
                return { ok: false, error: `Cannot convert "${value}" to a number` };
            }
            return { ok: true, value: num, coerced: typeof value !== 'number' };
        }

        case 'boolean':
        case 'bool': {
            if (typeof value === 'boolean') return { ok: true, value, coerced: false };
            const str = String(value).toLowerCase().trim();
            if (['true', '1', 'yes', 'on'].includes(str)) return { ok: true, value: true, coerced: true };
            if (['false', '0', 'no', 'off'].includes(str)) return { ok: true, value: false, coerced: true };
            return { ok: false, error: `Cannot convert "${value}" to a boolean` };
        }

        case 'json': {
            if (typeof value === 'string') {
                try {
                    return { ok: true, value: JSON.parse(value), coerced: true };
                } catch {
                    return { ok: false, error: 'Invalid JSON string' };
                }
            }
            try {
                return { ok: true, value: JSON.parse(JSON.stringify(value)), coerced: false };
            } catch {
                return { ok: false, error: 'Value is not JSON-serializable' };
            }
        }

        case 'array':
            if (Array.isArray(value)) return { ok: true, value, coerced: false };
            return { ok: true, value: [value], coerced: true };

        case 'object':
            if (typeof value === 'object' && !Array.isArray(value)) {
                return { ok: true, value, coerced: false };
            }
            return { ok: false, error: 'Value is not an object' };

        case 'select':
        case 'password':
        case 'code':
        case 'keyvalue':
        case 'columnkeyvalue':
        case 'expression':
        case 'conditionbuilder':
        case 'fieldmapping':
            // These are UI field types; values are stored as strings/objects as-is.
            return { ok: true, value, coerced: false };

        case 'any':
        case 'unknown':
        default:
            return { ok: true, value, coerced: false };
    }
}

/**
 * Validate that a value matches a target type (no coercion applied).
 */
export function validateType(targetType: string, value: unknown): { valid: boolean; error?: string } {
    if (isEmpty(value)) {
        return { valid: true }; // emptiness is a "required" concern, not a type concern
    }
    const result = coerceValue(targetType, value);
    if (!result.ok) return { valid: false, error: result.error };
    return { valid: !result.coerced, error: result.coerced ? `Value requires coercion to ${targetType}` : undefined };
}

/**
 * Validate and coerce in one step. Returns the (possibly coerced) value or an error.
 */
export function validateAndCoerceType(targetType: string, value: unknown): CoerceResult {
    return coerceValue(targetType, value);
}
