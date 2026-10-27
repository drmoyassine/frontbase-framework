/**
 * Type Compatibility Engine Tests — Sprint 1
 */

import { describe, it, expect } from 'vitest';
import {
    checkCompatibility,
    parseType,
    getBaseType,
    validateConnection,
    getCompatibleTargets,
    isTriggerNodeType,
    isTerminalNodeType,
    getTypeLabel,
    formatCompatibilityMessage,
} from '../typeCompatibility';
import type { WorkflowNode } from '@/stores/actions';

function node(id: string, type: string): WorkflowNode {
    return {
        id,
        type,
        position: { x: 0, y: 0 },
        data: { label: type, type, inputs: [], outputs: [] },
    } as WorkflowNode;
}

describe('parseType', () => {
    it('parses primitive types', () => {
        expect(parseType('string')).toEqual({ category: 'primitive', baseType: 'string' });
        expect(parseType('number')).toEqual({ category: 'primitive', baseType: 'number' });
        expect(parseType('boolean')).toEqual({ category: 'primitive', baseType: 'boolean' });
    });

    it('parses array types', () => {
        expect(parseType('array<string>')).toEqual({ category: 'array', baseType: 'array' });
        expect(parseType('string[]')).toEqual({ category: 'array', baseType: 'array' });
    });

    it('parses union types', () => {
        expect(parseType('string | number')).toEqual({ category: 'union', baseType: 'union' });
    });

    it('normalizes numeric aliases to number', () => {
        expect(parseType('integer')).toEqual({ category: 'primitive', baseType: 'number' });
        expect(parseType('float')).toEqual({ category: 'primitive', baseType: 'number' });
    });

    it('classifies unknown complex types as object', () => {
        expect(parseType('SomeCustomThing')).toEqual({ category: 'object', baseType: 'object' });
    });
});

describe('getBaseType', () => {
    it('extracts the base type', () => {
        expect(getBaseType('array<string>')).toBe('array');
        expect(getBaseType('string[]')).toBe('array');
        expect(getBaseType('integer')).toBe('number');
        expect(getBaseType('string')).toBe('string');
    });
});

describe('checkCompatibility', () => {
    it('is valid for matching types', () => {
        const r = checkCompatibility('string', 'string');
        expect(r.isValid).toBe(true);
        expect(r.requiresCoercion).toBe(false);
    });

    it('is valid for any type on either side', () => {
        expect(checkCompatibility('any', 'string').isValid).toBe(true);
        expect(checkCompatibility('number', 'any').isValid).toBe(true);
    });

    it('is valid with coercion for string -> number', () => {
        const r = checkCompatibility('string', 'number');
        expect(r.isValid).toBe(true);
        expect(r.requiresCoercion).toBe(true);
        expect(r.coercionType).toBe('toNumber');
    });

    it('is invalid for array -> number', () => {
        const r = checkCompatibility('array', 'number');
        expect(r.isValid).toBe(false);
        expect(r.reason).toBeDefined();
    });

    it('is invalid for void source', () => {
        const r = checkCompatibility('void', 'string');
        expect(r.isValid).toBe(false);
        expect(r.reason).toContain('no outputs');
    });

    it('handles union types', () => {
        const r = checkCompatibility('string | number', 'number');
        expect(r.isValid).toBe(true);
    });

    it('is strict when strict option is set', () => {
        const r = checkCompatibility('string', 'number', { strict: true });
        expect(r.isValid).toBe(false);
    });
});

describe('validateConnection (structural rules)', () => {
    const nodes: WorkflowNode[] = [
        node('trigger1', 'webhook_trigger'),
        node('action1', 'http_request'),
        node('transform1', 'transform'),
        node('response1', 'http_response'),
    ];

    it('allows a valid source -> action connection', () => {
        const r = validateConnection({ source: 'trigger1', target: 'action1' }, nodes);
        expect(r.isValid).toBe(true);
    });

    it('rejects connections into trigger nodes', () => {
        const r = validateConnection({ source: 'action1', target: 'trigger1' }, nodes);
        expect(r.isValid).toBe(false);
        expect(r.error).toContain('trigger');
    });

    it('rejects self-connections', () => {
        const r = validateConnection({ source: 'action1', target: 'action1' }, nodes);
        expect(r.isValid).toBe(false);
        expect(r.error).toContain('itself');
    });

    it('rejects connections from terminal nodes (no outputs)', () => {
        const r = validateConnection({ source: 'response1', target: 'action1' }, nodes);
        expect(r.isValid).toBe(false);
        expect(r.error).toContain('no outputs');
    });

    it('rejects when source node is missing', () => {
        const r = validateConnection({ source: 'missing', target: 'action1' }, nodes);
        expect(r.isValid).toBe(false);
    });
});

describe('getCompatibleTargets', () => {
    it('returns non-trigger nodes as compatible targets', () => {
        const nodes: WorkflowNode[] = [
            node('source1', 'transform'),
            node('target1', 'log'),
            node('trigger1', 'webhook_trigger'),
        ];
        const result = getCompatibleTargets('source1', nodes);
        expect(result.map(r => r.nodeId)).toContain('target1');
        expect(result.map(r => r.nodeId)).not.toContain('trigger1');
    });
});

describe('isTriggerNodeType / isTerminalNodeType', () => {
    it('identifies trigger nodes from the registry', () => {
        expect(isTriggerNodeType('webhook_trigger')).toBe(true);
        expect(isTriggerNodeType('schedule_trigger')).toBe(true);
        expect(isTriggerNodeType('trigger')).toBe(true);
    });

    it('returns false for non-trigger nodes', () => {
        expect(isTriggerNodeType('http_request')).toBe(false);
    });

    it('identifies terminal nodes (no outputs)', () => {
        expect(isTerminalNodeType('http_response')).toBe(true);
        expect(isTerminalNodeType('redirect')).toBe(true);
    });

    it('returns false for nodes with outputs', () => {
        expect(isTerminalNodeType('transform')).toBe(false);
    });
});

describe('getTypeLabel', () => {
    it('returns friendly labels', () => {
        expect(getTypeLabel('string')).toBe('Text');
        expect(getTypeLabel('number')).toBe('Number');
        expect(getTypeLabel('boolean')).toBe('True/False');
        expect(getTypeLabel('array')).toBe('List');
    });

    it('returns the original for unknown types', () => {
        expect(getTypeLabel('custom_type')).toBe('custom_type');
    });
});

describe('formatCompatibilityMessage', () => {
    it('formats an invalid result', () => {
        expect(formatCompatibilityMessage({ isValid: false, reason: 'Type incompatibility' }))
            .toBe('Type incompatibility');
    });

    it('formats a valid-with-coercion result', () => {
        expect(
            formatCompatibilityMessage({
                isValid: true,
                requiresCoercion: true,
                coercionType: 'toNumber',
            })
        ).toBe('Compatible with automatic convert to number');
    });

    it('formats a simple valid result', () => {
        expect(formatCompatibilityMessage({ isValid: true })).toBe('Compatible');
    });
});
