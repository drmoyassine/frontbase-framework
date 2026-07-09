/**
 * Pre-execution validation — ported verbatim from engine/validation.ts.
 * Pure: required fields must be present and non-empty before execution.
 */
import type { WorkflowNode } from './types.js';

const REQUIRED_FIELDS: Record<string, string[]> = {
    http_request: ['method', 'url'],
    data_request: ['dataSource', 'table'],
    data_change_trigger: ['dataSource', 'table'],
    log: ['message'],
    redirect: ['url'],
    set_variable: ['scope', 'key', 'value'],
};

export interface NodeValidationError {
    nodeId: string;
    nodeType: string;
    field: string;
    message: string;
}

export interface WorkflowValidationResult {
    valid: boolean;
    errors: NodeValidationError[];
}

function getInputs(node: WorkflowNode): Array<{ name: string; value: unknown }> {
    const inputs = node.data?.inputs ?? node.inputs ?? [];
    return (inputs || []).map((i: { name: string; value?: unknown }) => ({ name: i.name, value: i.value }));
}

function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === '' ||
        (Array.isArray(value) && value.length === 0);
}

export function validateNode(node: WorkflowNode): NodeValidationError[] {
    const required = REQUIRED_FIELDS[node.type];
    if (!required || required.length === 0) return [];

    const inputs = getInputs(node);
    const valuesByName = new Map(inputs.map((i) => [i.name, i.value]));
    const errors: NodeValidationError[] = [];

    for (const field of required) {
        const value = valuesByName.get(field);
        if (isEmpty(value)) {
            errors.push({
                nodeId: node.id,
                nodeType: node.type,
                field,
                message: `Required field "${field}" is missing on node "${node.id}"`,
            });
        }
    }
    return errors;
}

export function validateWorkflowExecution(nodes: WorkflowNode[]): WorkflowValidationResult {
    const errors: NodeValidationError[] = [];
    for (const node of nodes) errors.push(...validateNode(node));
    return { valid: errors.length === 0, errors };
}
