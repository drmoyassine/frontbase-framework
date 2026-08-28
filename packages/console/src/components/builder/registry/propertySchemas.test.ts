import { describe, it, expect } from 'vitest';
import { getPropertySchema } from './propertySchemas';

/**
 * Locks in the field shape each migrated component exposes via its schema.
 * These mirror the exact fields the previous bespoke *Properties panels
 * rendered, so a regression here is a behavior change for the builder.
 */

describe('propertySchemas registry', () => {
    it('registers Heading with text + level', () => {
        const schema = getPropertySchema('Heading');
        expect(schema?.general).toBeDefined();
        const names = schema!.general!.map((f) => f.name);
        expect(names).toEqual(['text', 'level']);

        const level = schema!.general!.find((f) => f.name === 'level')!;
        expect(level.type).toBe('select');
        // Narrow the union to the select variant so `options` is type-safe.
        const levelOptions = level.type === 'select' ? level.options : [];
        expect(levelOptions.map((o) => o.value)).toEqual([
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        ]);
    });

    it('registers Text with a variable-capable multiline content field', () => {
        const schema = getPropertySchema('Text');
        const content = schema?.general?.[0];
        expect(content?.name).toBe('text');
        expect(content?.type).toBe('text');
        expect((content as any).multiline).toBe(true);
        expect((content as any).syntaxContext).toBe('output');
    });

    it('registers Link with text/href inputs and a target select', () => {
        const schema = getPropertySchema('Link');
        const names = schema!.general!.map((f) => f.name);
        expect(names).toEqual(['text', 'href', 'target']);

        // Link uses plain inputs (no variable interpolation), matching the
        // previous bespoke panel.
        expect(schema!.general!.find((f) => f.name === 'text')!.type).toBe('input');
        expect(schema!.general!.find((f) => f.name === 'href')!.type).toBe('input');
        const target = schema!.general!.find((f) => f.name === 'target')!;
        expect(target.type).toBe('select');
        const targetOptions = target.type === 'select' ? target.options : [];
        expect(targetOptions.map((o) => o.value)).toEqual(['_self', '_blank']);
    });

    it('registers Progress with a bounded number field', () => {
        const schema = getPropertySchema('Progress');
        const value = schema?.general?.[0];
        expect(value?.type).toBe('number');
        expect(value?.name).toBe('value');
        expect((value as any).min).toBe(0);
        expect((value as any).max).toBe(100);
    });

    it('registers Alert with a textarea message field', () => {
        const schema = getPropertySchema('Alert');
        const message = schema?.general?.[0];
        expect(message?.type).toBe('textarea');
        expect(message?.name).toBe('message');
    });

    it('registers Badge with conditional icon fields', () => {
        const schema = getPropertySchema('Badge');
        const names = schema!.general!.map((f) => f.name);
        expect(names).toEqual([
            'text', 'variant', 'icon', 'iconPosition',
            'backgroundColor', 'textColor', 'iconColor',
        ]);

        // Icon position + icon color are only visible when an icon is set.
        const iconPosition = schema!.general!.find((f) => f.name === 'iconPosition')!;
        expect(typeof iconPosition.visible).toBe('function');
        expect(iconPosition.visible!({ icon: 'Check' })).toBe(true);
        expect(iconPosition.visible!({})).toBe(false);

        const iconColor = schema!.general!.find((f) => f.name === 'iconColor')!;
        expect(iconColor.visible!({ icon: 'Check' })).toBe(true);
        expect(iconColor.visible!({})).toBe(false);

        // Color fields render the dual color control.
        expect(schema!.general!.find((f) => f.name === 'backgroundColor')!.type).toBe('color');
    });

    it('returns undefined for complex (non-migrated) components', () => {
        // These keep their bespoke panels and are dispatched by the legacy switch.
        expect(getPropertySchema('DataTable')).toBeUndefined();
        expect(getPropertySchema('Chart')).toBeUndefined();
        expect(getPropertySchema('Form')).toBeUndefined();
        expect(getPropertySchema('Button')).toBeUndefined();
        expect(getPropertySchema('Navbar')).toBeUndefined();
    });

    it('exposes only the general tab for migrated simple components', () => {
        // Simple components render on the general tab only; options/actions
        // tabs have no schema fields (the shared Visibility/Action editors are
        // rendered by the tab wrapper in PropertiesPanel).
        for (const type of ['Heading', 'Text', 'Link', 'Progress', 'Alert', 'Badge']) {
            const schema = getPropertySchema(type)!;
            expect(schema.general?.length ?? 0).toBeGreaterThan(0);
            expect(schema.options).toBeUndefined();
            expect(schema.actions).toBeUndefined();
        }
    });
});
