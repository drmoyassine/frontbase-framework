/**
 * Node Schemas — Central re-export hub + schema registry + helpers
 *
 * Split from 1006-line monolith into domain files:
 *   types.ts, triggers.ts, actions.ts, logic.ts,
 *   integrations.ts, interface.ts, output.ts
 *
 * All original exports are preserved — no import changes needed downstream.
 */

// Re-export all types
export type {
    FieldType, BaseFieldDefinition, SelectFieldDefinition,
    CodeFieldDefinition, KeyValueFieldDefinition, ColumnKeyValueFieldDefinition,
    ExpressionFieldDefinition, FieldDefinition, OutputDefinition, NodeSchema,
} from './types';

// Re-export all schemas
export {
    manualTriggerSchema, webhookTriggerSchema,
    scheduleTriggerSchema, dataChangeTriggerSchema,
    uiEventTriggerSchema,
} from './triggers';

export {
    httpRequestSchema, transformSchema, logSchema,
} from './actions';

export { conditionSchema } from './logic';
export { dataRequestSchema } from './integrations';
export { toastSchema, redirectSchema, refreshSchema, setVariableSchema } from './interface';
export { httpResponseSchema } from './output';

// ============ Schema Registry ============

import { manualTriggerSchema, webhookTriggerSchema, scheduleTriggerSchema, dataChangeTriggerSchema, uiEventTriggerSchema } from './triggers';
import { httpRequestSchema, transformSchema, logSchema } from './actions';
import { conditionSchema } from './logic';
import { dataRequestSchema } from './integrations';
import { toastSchema, redirectSchema, refreshSchema, setVariableSchema } from './interface';
import { httpResponseSchema } from './output';
import type { NodeSchema, FieldDefinition } from './types';

export const nodeSchemas: Record<string, NodeSchema> = {
    // Triggers
    trigger: manualTriggerSchema,
    webhook_trigger: webhookTriggerSchema,
    schedule_trigger: scheduleTriggerSchema,
    data_change_trigger: dataChangeTriggerSchema,
    ui_event_trigger: uiEventTriggerSchema,
    // Actions
    http_request: httpRequestSchema,
    transform: transformSchema,
    log: logSchema,
    // Logic
    condition: conditionSchema,
    // Integrations
    data_request: dataRequestSchema,
    // Interface
    toast: toastSchema,
    redirect: redirectSchema,
    refresh: refreshSchema,
    set_variable: setVariableSchema,
    // Output
    http_response: httpResponseSchema,
};

/**
 * Get schema for a node type
 */
export function getNodeSchema(type: string): NodeSchema | undefined {
    return nodeSchemas[type];
}

/**
 * Get default input values from schema
 */
export function getDefaultInputsFromSchema(type: string): Array<{ name: string; type: string; value?: any }> {
    const schema = nodeSchemas[type];
    if (!schema) {
        return [{ name: 'input', type: 'any' }];
    }

    return schema.inputs.map(input => ({
        name: input.name,
        type: input.type,
        value: input.default,
        description: input.description,
        required: input.required,
    }));
}

/**
 * Get default output definitions from schema
 */
export function getDefaultOutputsFromSchema(type: string): Array<{ name: string; type: string }> {
    const schema = nodeSchemas[type];
    if (!schema) {
        return [{ name: 'output', type: 'any' }];
    }

    return schema.outputs.map(output => ({
        name: output.name,
        type: output.type,
    }));
}

/**
 * Check if a field should be visible based on showWhen conditions
 */
export function isFieldVisible(
    field: FieldDefinition,
    values: Record<string, any>
): boolean {
    if (!field.showWhen) return true;

    return Object.entries(field.showWhen).every(([key, expected]) => {
        const actual = values[key];

        // Handle array of allowed values
        if (Array.isArray(expected)) {
            return expected.includes(actual);
        }

        // Handle single value comparison
        return actual === expected;
    });
}
