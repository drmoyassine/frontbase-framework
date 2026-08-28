/**
 * Type Compatibility Engine for Workflow Node Connections
 *
 * Validates type compatibility between source node outputs and target node inputs.
 * Provides detailed error messages for incompatible connections and supports
 * type coercion rules for compatible but not exact matches.
 *
 * NOTE on architecture: In this codebase, a node schema's `inputs` are
 * *configuration form fields* (method, url, headers...), not typed data-flow
 * ports. Data flows into a node generically as `$input`. Therefore the
 * connection validation enforced by `validateConnection` is primarily
 * structural (no self-connections, no connections into trigger nodes, no
 * connections out of terminal nodes), with the type engine applied against
 * the source node's typed *outputs*. The pure functions below (checkCompatibility,
 * parseType, etc.) are fully unit-tested infrastructure that can also drive
 * richer, port-typed models in the future.
 */

import type { Connection } from 'reactflow';
import type { WorkflowNode } from '@/stores/actions';
import { getNodeSchema } from './nodeSchemas';

// ============ Type Definitions ============

export type TypeCategory =
    | 'primitive' // string, number, boolean
    | 'array' // array types
    | 'object' // object/map types
    | 'any' // any type (compatible with everything)
    | 'void' // no output (terminal nodes)
    | 'union'; // union types (e.g., string | number)

export interface CompatibilityResult {
    isValid: boolean;
    reason?: string;
    requiresCoercion?: boolean;
    coercionType?: CoercionType;
    suggestedFix?: string;
}

export type CoercionType =
    | 'toString'
    | 'toNumber'
    | 'toBoolean'
    | 'toArray'
    | 'toObject'
    | 'toJson'
    | 'unwrap';

export interface ConnectionContext {
    sourceNodeId: string;
    sourceHandle: string | null;
    targetNodeId: string;
    targetHandle: string | null;
    sourceType: string;
    targetType: string;
}

// ============ Type Compatibility Matrix ============

const COMPATIBILITY_MATRIX: Record<string, Set<string>> = {
    'any': new Set(['*']),
    'string': new Set(['string', 'number', 'any', 'json', 'object']),
    'number': new Set(['number', 'string', 'any', 'json', 'boolean']),
    'boolean': new Set(['boolean', 'string', 'any', 'json', 'number']),
    'array': new Set(['array', 'any', 'json', 'object']),
    'object': new Set(['object', 'any', 'json', 'array', 'string']),
    'json': new Set(['json', 'object', 'array', 'string', 'any']),
    'void': new Set(['void']),
};

// ============ Type Coercion Rules ============

const COERCION_RULES: Record<string, Record<string, CoercionType>> = {
    'string': {
        'number': 'toNumber',
        'boolean': 'toBoolean',
        'object': 'toJson',
        'array': 'toJson',
    },
    'number': {
        'string': 'toString',
        'boolean': 'toBoolean',
    },
    'boolean': {
        'string': 'toString',
        'number': 'toNumber',
    },
    'object': {
        'string': 'toJson',
        'array': 'toArray',
    },
    'array': {
        'object': 'toObject',
        'string': 'toJson',
    },
    'json': {
        'object': 'unwrap',
        'array': 'unwrap',
    },
};

// ============ Type Detection ============

export function parseType(typeStr: string): { category: TypeCategory; baseType: string } {
    const normalized = typeStr.toLowerCase().trim();

    if (normalized.startsWith('array<') || normalized.endsWith('[]')) {
        return { category: 'array', baseType: 'array' };
    }

    if (normalized.includes('|')) {
        return { category: 'union', baseType: 'union' };
    }

    if (['string', 'number', 'boolean', 'integer', 'float', 'double'].includes(normalized)) {
        // integer/float/double normalize down to a primitive number
        if (['integer', 'float', 'double'].includes(normalized)) {
            return { category: 'primitive', baseType: 'number' };
        }
        return { category: 'primitive', baseType: normalized };
    }

    if (['any', 'unknown'].includes(normalized)) {
        return { category: 'any', baseType: 'any' };
    }
    if (['void', 'null'].includes(normalized)) {
        return { category: 'void', baseType: normalized };
    }

    return { category: 'object', baseType: 'object' };
}

export function getBaseType(typeStr: string): string {
    const normalized = typeStr.toLowerCase().trim();

    // Array notation takes precedence over the leading identifier
    if (normalized.startsWith('array<') || normalized.endsWith('[]')) {
        return 'array';
    }

    const baseMatch = normalized.match(/^([a-z_]+)/);
    if (baseMatch) {
        const base = baseMatch[1];
        if (['integer', 'float', 'double', 'int'].includes(base)) {
            return 'number';
        }
        return base;
    }

    return normalized;
}

// ============ Compatibility Checking ============

export function checkCompatibility(
    sourceType: string,
    targetType: string,
    options?: { allowCoercion?: boolean; strict?: boolean }
): CompatibilityResult {
    const opts = { allowCoercion: true, strict: false, ...options };

    const source = parseType(sourceType);
    const target = parseType(targetType);

    // Handle void/terminal sources
    if (source.baseType === 'void' || source.category === 'void') {
        return {
            isValid: false,
            reason: 'Source node has no outputs (terminal node)',
            suggestedFix: 'This node cannot have outgoing connections',
        };
    }

    // 'any' wildcard (either side)
    if (source.baseType === 'any' || target.baseType === 'any') {
        return { isValid: true, requiresCoercion: false };
    }

    // Union types - valid if any member is compatible
    if (source.category === 'union' || target.category === 'union') {
        return checkUnionCompatibility(sourceType, targetType);
    }

    // Direct match
    if (source.baseType === target.baseType) {
        return { isValid: true, requiresCoercion: false };
    }

    // In strict mode, only exact matches (and `any`) are allowed — no coercion,
    // no matrix-based cross-type compatibility.
    if (opts.strict) {
        return {
            isValid: false,
            reason: getIncompatibilityReason(source.baseType, target.baseType),
            suggestedFix: getSuggestedFix(source.baseType, target.baseType),
        };
    }

    // Compatibility matrix
    const compatibleTargets = COMPATIBILITY_MATRIX[source.baseType];
    if (compatibleTargets && (compatibleTargets.has('*') || compatibleTargets.has(target.baseType))) {
        if (opts.allowCoercion && !opts.strict) {
            const coercionType = COERCION_RULES[source.baseType]?.[target.baseType];
            if (coercionType) {
                return {
                    isValid: true,
                    requiresCoercion: true,
                    coercionType,
                    reason: `Type coercion will be applied: ${source.baseType} -> ${target.baseType}`,
                };
            }
        }
        return { isValid: true, requiresCoercion: false };
    }

    return {
        isValid: false,
        reason: getIncompatibilityReason(source.baseType, target.baseType),
        suggestedFix: getSuggestedFix(source.baseType, target.baseType),
    };
}

function checkUnionCompatibility(sourceType: string, targetType: string): CompatibilityResult {
    const sourceTypes = sourceType.split('|').map(t => getBaseType(t.trim()));
    const targetTypes = targetType.split('|').map(t => getBaseType(t.trim()));

    for (const src of sourceTypes) {
        for (const tgt of targetTypes) {
            const result = checkCompatibility(src, tgt, { strict: true });
            if (result.isValid) {
                return {
                    isValid: true,
                    requiresCoercion: result.requiresCoercion,
                    coercionType: result.coercionType,
                };
            }
        }
    }

    return {
        isValid: false,
        reason: `No compatible types in union: ${sourceType} -> ${targetType}`,
    };
}

function getIncompatibilityReason(source: string, target: string): string {
    const reasons: Record<string, Record<string, string>> = {
        'array': {
            'string': 'Cannot convert array to string directly',
            'number': 'Cannot convert array to number directly',
            'boolean': 'Cannot convert array to boolean directly',
        },
        'string': {
            'array': 'Cannot convert string to array without parsing',
        },
        'number': {
            'array': 'Cannot convert number to array',
            'object': 'Cannot convert number to object',
        },
        'boolean': {
            'array': 'Cannot convert boolean to array',
            'object': 'Cannot convert boolean to object',
        },
    };

    return reasons[source]?.[target] || `Type ${source} is not compatible with ${target}`;
}

function getSuggestedFix(source: string, target: string): string {
    const fixes: Record<string, Record<string, string>> = {
        'array': {
            'string': 'Add a Transform node to convert array to string (e.g., join)',
            'number': 'Add a Transform node to get array length or sum',
            'boolean': 'Add a Transform node to check if array is empty',
        },
        'string': {
            'array': 'Add a Transform node to parse string as JSON array',
        },
        'number': {
            'array': 'Use a Transform node to create array from number',
            'object': 'Use a Transform node to wrap number in object',
        },
    };

    return fixes[source]?.[target] || 'Add a Transform node to convert between types';
}

// ============ ReactFlow Integration ============

/**
 * Validate a ReactFlow connection.
 *
 * Enforces structural rules (self-connection, target-is-trigger, source-is-terminal)
 * and runs the type engine against the source node's typed outputs vs the target's
 * data-input type. Because schema `inputs` are configuration fields rather than
 * typed data ports, the target data type defaults to `'any'` unless the target
 * node carries explicit typed output metadata.
 */
export function validateConnection(
    connection: Connection,
    nodes: WorkflowNode[]
): { isValid: boolean; error?: string } {
    const { source, sourceHandle, target, targetHandle } = connection;

    if (!source || !target) {
        return { isValid: false, error: 'Invalid connection: missing source or target' };
    }

    if (source === target) {
        return { isValid: false, error: 'Cannot connect a node to itself' };
    }

    const sourceNode = nodes.find(n => n.id === source);
    const targetNode = nodes.find(n => n.id === target);

    if (!sourceNode) {
        return { isValid: false, error: 'Source node not found' };
    }
    if (!targetNode) {
        return { isValid: false, error: 'Target node not found' };
    }

    const sourceSchema = getNodeSchema(sourceNode.data.type);
    const targetSchema = getNodeSchema(targetNode.data.type);

    if (!sourceSchema) {
        return { isValid: false, error: `Unknown source node type: ${sourceNode.data.type}` };
    }
    if (!targetSchema) {
        return { isValid: false, error: `Unknown target node type: ${targetNode.data.type}` };
    }

    // Source must produce outputs
    if (!sourceSchema.outputs || sourceSchema.outputs.length === 0) {
        return {
            isValid: false,
            error: `"${sourceSchema.label}" has no outputs (terminal node)`,
        };
    }

    // Cannot connect INTO a trigger node
    if (targetSchema.category === 'triggers') {
        return {
            isValid: false,
            error: 'Cannot connect to trigger nodes (a workflow starts at a trigger)',
        };
    }

    // Determine the typed source output (by handle, else first)
    const sourceOutputName = sourceHandle || sourceSchema.outputs[0]?.name;
    const sourceOutput =
        sourceSchema.outputs.find(o => o.name === sourceOutputName) || sourceSchema.outputs[0];

    if (!sourceOutput) {
        return { isValid: false, error: 'Source has no matching output' };
    }

    // The target's data-input type. Schema inputs are config form fields, so there
    // is no typed data port — the flowing data is accepted as `any`.
    const targetInputType = 'any';

    const compatibility = checkCompatibility(sourceOutput.type, targetInputType);

    if (!compatibility.isValid) {
        return {
            isValid: false,
            error: `Type mismatch: ${sourceSchema.label}.${sourceOutput.name} (${sourceOutput.type}) -> ${targetSchema.label} (${targetInputType})${compatibility.reason ? `. ${compatibility.reason}` : ''}`,
        };
    }

    // Unused vars guard (targetHandle referenced for completeness in future port typing)
    void targetHandle;

    return { isValid: true };
}

/**
 * Get all compatible targets for a source node.
 */
export function getCompatibleTargets(
    sourceNodeId: string,
    nodes: WorkflowNode[]
): Array<{
    nodeId: string;
    handles: Array<{ input: string; output: string; compatibility: CompatibilityResult }>;
}> {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return [];

    const sourceSchema = getNodeSchema(sourceNode.data.type);
    if (!sourceSchema || !sourceSchema.outputs) return [];

    const results: Array<{
        nodeId: string;
        handles: Array<{ input: string; output: string; compatibility: CompatibilityResult }>;
    }> = [];

    for (const node of nodes) {
        if (node.id === sourceNodeId) continue;

        const targetSchema = getNodeSchema(node.data.type);
        if (!targetSchema || targetSchema.category === 'triggers') continue;

        const handles: Array<{ input: string; output: string; compatibility: CompatibilityResult }> = [];

        for (const output of sourceSchema.outputs) {
            const compatibility = checkCompatibility(output.type, 'any');
            handles.push({
                input: 'data',
                output: output.name,
                compatibility,
            });
        }

        if (handles.some(h => h.compatibility.isValid)) {
            results.push({ nodeId: node.id, handles });
        }
    }

    return results;
}

// ============ Utility Functions ============

export function isTriggerNodeType(nodeType: string): boolean {
    const schema = getNodeSchema(nodeType);
    return schema?.category === 'triggers' || false;
}

export function isTerminalNodeType(nodeType: string): boolean {
    const schema = getNodeSchema(nodeType);
    return schema?.outputs?.length === 0 || false;
}

export function getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        'string': 'Text',
        'number': 'Number',
        'boolean': 'True/False',
        'array': 'List',
        'object': 'Object',
        'any': 'Any Value',
        'json': 'JSON',
        'void': 'No Output',
    };

    return labels[getBaseType(type)] || type;
}

export function formatCompatibilityMessage(result: CompatibilityResult): string {
    if (!result.isValid) {
        return result.reason || 'Incompatible types';
    }

    if (result.requiresCoercion) {
        const coercionLabels: Record<CoercionType, string> = {
            'toString': 'convert to text',
            'toNumber': 'convert to number',
            'toBoolean': 'convert to true/false',
            'toArray': 'convert to list',
            'toObject': 'convert to object',
            'toJson': 'convert to JSON',
            'unwrap': 'unwrap value',
        };

        return `Compatible with automatic ${coercionLabels[result.coercionType || 'toObject']}`;
    }

    return 'Compatible';
}
