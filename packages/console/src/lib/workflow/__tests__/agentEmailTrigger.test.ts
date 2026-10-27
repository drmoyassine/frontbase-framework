/**
 * Agent Node + Email Trigger Schema Tests — DEC-105 v0
 */

import { describe, it, expect } from 'vitest';
import { getNodeSchema, getDefaultInputsFromSchema, getDefaultOutputsFromSchema } from '../nodeSchemas';
import { agentSchema } from '../nodeSchemas/actions';
import { emailTriggerSchema } from '../nodeSchemas/triggers';
import { isTriggerNodeType, isTerminalNodeType } from '../typeCompatibility';
import { applyDefaults, getRequiredFields } from '../defaultManager';

describe('agentSchema', () => {
    it('is registered in the schema registry', () => {
        expect(getNodeSchema('agent')).toBe(agentSchema);
    });

    it('is an action-category node (not a trigger, not terminal)', () => {
        expect(agentSchema.category).toBe('actions');
        expect(isTriggerNodeType('agent')).toBe(false);
        expect(isTerminalNodeType('agent')).toBe(false);
    });

    it('requires baseUrl, agentSlug, contactId and message', () => {
        const required = getRequiredFields('agent');
        expect(required.map(f => f.name)).toEqual(
            expect.arrayContaining(['baseUrl', 'agentSlug', 'contactId', 'message'])
        );
    });

    it('carries the API key as a secret field', () => {
        const inputs = getDefaultInputsFromSchema('agent');
        expect(inputs.find(i => i.name === 'apiKey')?.type).toBe('password');
    });

    it('exposes the mapped turn outputs', () => {
        const outputs = getDefaultOutputsFromSchema('agent');
        const names = outputs.map(o => o.name);
        expect(names).toEqual(
            expect.arrayContaining(['reply', 'threadId', 'turnId', 'turnStatus', 'status', 'ok', 'replay'])
        );
    });

    it('applyDefaults backfills all schema fields', () => {
        const result = applyDefaults('agent', []);
        expect(result.length).toBe(agentSchema.inputs.length);
    });
});

describe('emailTriggerSchema', () => {
    it('is registered in the schema registry', () => {
        expect(getNodeSchema('email_trigger')).toBe(emailTriggerSchema);
    });

    it('is a trigger-category node', () => {
        expect(emailTriggerSchema.category).toBe('triggers');
        expect(isTriggerNodeType('email_trigger')).toBe(true);
    });

    it('is not a terminal node (has outputs)', () => {
        expect(isTerminalNodeType('email_trigger')).toBe(false);
        expect(emailTriggerSchema.outputs.length).toBeGreaterThan(0);
    });

    it('declares no required fields (every filter is optional)', () => {
        expect(getRequiredFields('email_trigger')).toEqual([]);
    });

    it('exposes the normalized email outputs', () => {
        const outputs = getDefaultOutputsFromSchema('email_trigger');
        const names = outputs.map(o => o.name);
        expect(names).toEqual(
            expect.arrayContaining(['from', 'to', 'subject', 'body', 'text', 'providerMessageId'])
        );
    });

    it('applyDefaults backfills all schema fields', () => {
        const result = applyDefaults('email_trigger', []);
        expect(result.length).toBe(emailTriggerSchema.inputs.length);
    });
});
