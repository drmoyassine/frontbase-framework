/**
 * UI Event Trigger Schema Tests — Sprint 4
 */

import { describe, it, expect } from 'vitest';
import { getNodeSchema, getDefaultInputsFromSchema, getDefaultOutputsFromSchema } from '../nodeSchemas';
import { uiEventTriggerSchema } from '../nodeSchemas/triggers';
import { isTriggerNodeType, isTerminalNodeType } from '../typeCompatibility';
import { applyDefaults, getRequiredFields } from '../defaultManager';

describe('uiEventTriggerSchema', () => {
    it('is registered in the schema registry', () => {
        expect(getNodeSchema('ui_event_trigger')).toBe(uiEventTriggerSchema);
    });

    it('is a trigger-category node', () => {
        expect(uiEventTriggerSchema.category).toBe('triggers');
        expect(isTriggerNodeType('ui_event_trigger')).toBe(true);
    });

    it('is not a terminal node (has outputs)', () => {
        expect(isTerminalNodeType('ui_event_trigger')).toBe(false);
        expect(uiEventTriggerSchema.outputs.length).toBeGreaterThan(0);
    });

    it('declares the expected default event type', () => {
        const inputs = getDefaultInputsFromSchema('ui_event_trigger');
        const eventType = inputs.find(i => i.name === 'eventType');
        expect(eventType?.value).toBe('click');
    });

    it('has required eventType and elementSelector fields', () => {
        const required = getRequiredFields('ui_event_trigger');
        expect(required.map(f => f.name)).toEqual(
            expect.arrayContaining(['eventType', 'elementSelector'])
        );
    });

    it('exposes event-data outputs', () => {
        const outputs = getDefaultOutputsFromSchema('ui_event_trigger');
        const names = outputs.map(o => o.name);
        expect(names).toEqual(
            expect.arrayContaining(['timestamp', 'eventType', 'element', 'value', 'key'])
        );
    });

    it('applyDefaults backfills all schema fields', () => {
        const result = applyDefaults('ui_event_trigger', []);
        expect(result.length).toBe(uiEventTriggerSchema.inputs.length);
        expect(result.find(i => i.name === 'debounceMs')?.value).toBe(0);
    });
});
