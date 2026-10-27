/**
 * Default Value Manager — Sprint 3
 *
 * Enforces schema-driven defaults for workflow nodes:
 *  - Applies default values on node creation
 *  - Validates required fields
 *  - Coerces mismatched types
 *  - Reports missing fields
 *
 * Pure and fully unit-testable.
 */

import { getNodeSchema } from './nodeSchemas';
import type { FieldDefinition } from './nodeSchemas';
import { coerceValue } from './validation';

export interface NodeInput {
    name: string;
    type: string;
    value?: any;
    required?: boolean;
    description?: string;
}

export interface FieldValidationError {
    field: string;
    error: string;
    value: any;
    expectedType: string;
}

export interface DefaultsValidationResult {
    isValid: boolean;
    errors: FieldValidationError[];
    appliedDefaults: string[];
    coercedFields: string[];
}

/**
 * Apply default values to node inputs based on the schema. Existing values
 * are preserved; missing fields are filled with their schema default.
 */
export function applyDefaults(nodeType: string, existingInputs: NodeInput[] = []): NodeInput[] {
    const schema = getNodeSchema(nodeType);
    if (!schema) {
        return existingInputs;
    }

    const inputsMap = new Map(existingInputs.map(input => [input.name, input]));
    const result: NodeInput[] = [];

    for (const field of schema.inputs as FieldDefinition[]) {
        const existing = inputsMap.get(field.name);

        if (existing) {
            result.push({
                ...existing,
                required: field.required ?? existing.required,
                description: field.description ?? existing.description,
            });
            continue;
        }

        // Field is missing — synthesize from schema default
        const hasDefault = field.default !== undefined;
        result.push({
            name: field.name,
            type: field.type,
            value: hasDefault ? field.default : undefined,
            required: field.required,
            description: field.description,
        });
    }

    return result;
}

/**
 * Return the list of required field definitions for a node type.
 */
export function getRequiredFields(nodeType: string): FieldDefinition[] {
    const schema = getNodeSchema(nodeType);
    if (!schema) return [];
    return (schema.inputs as FieldDefinition[]).filter(f => f.required);
}

/**
 * Whether a node input value satisfies the "required" constraint.
 */
export function hasAllRequiredFields(nodeType: string, inputs: NodeInput[]): boolean {
    const required = getRequiredFields(nodeType);
    const valuesByName = new Map(inputs.map(i => [i.name, i.value]));
    return required.every(f => {
        const v = valuesByName.get(f.name);
        return v !== undefined && v !== null && v !== '';
    });
}

/**
 * Validate node inputs: required fields present + types coercible.
 * Applies defaults for missing optional fields and reports problems.
 */
export function validateNodeInputs(nodeType: string, inputs: NodeInput[]): DefaultsValidationResult {
    const schema = getNodeSchema(nodeType);
    if (!schema) {
        return { isValid: true, errors: [], appliedDefaults: [], coercedFields: [] };
    }

    const errors: FieldValidationError[] = [];
    const appliedDefaults: string[] = [];
    const coercedFields: string[] = [];

    const valuesByName = new Map(inputs.map(i => [i.name, i.value]));

    for (const field of schema.inputs as FieldDefinition[]) {
        const hasValue = valuesByName.has(field.name);
        const value = valuesByName.get(field.name);

        if (!hasValue || value === undefined || value === null || value === '') {
            // Apply default if available
            if (field.default !== undefined) {
                appliedDefaults.push(field.name);
            } else if (field.required) {
                errors.push({
                    field: field.name,
                    error: 'Required field is missing',
                    value,
                    expectedType: field.type,
                });
            }
            continue;
        }

        // Type-check / coerce
        const coerced = coerceValue(field.type, value);
        if (!coerced.ok) {
            errors.push({
                field: field.name,
                error: coerced.error,
                value,
                expectedType: field.type,
            });
        } else if (coerced.coerced) {
            coercedFields.push(field.name);
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        appliedDefaults,
        coercedFields,
    };
}

/**
 * Ensure a single field has a value, applying the schema default if missing.
 * Returns the value to store (or undefined when no default exists).
 */
export function applyFieldDefault(nodeType: string, fieldName: string, currentValue: any): { value: any; appliedDefault: boolean } {
    const schema = getNodeSchema(nodeType);
    const field = (schema?.inputs as FieldDefinition[] | undefined)?.find(f => f.name === fieldName);

    if (field && (currentValue === undefined || currentValue === null || currentValue === '')) {
        if (field.default !== undefined) {
            return { value: field.default, appliedDefault: true };
        }
    }
    return { value: currentValue, appliedDefault: false };
}
