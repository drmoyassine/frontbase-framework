import { describe, it, expect } from 'vitest';
import { createLiquidEngine } from '../engine';
import { renderSafe, maxBlockDepth, DEFAULT_LIMITS } from '../limits';

const engine = createLiquidEngine();

describe('maxBlockDepth', () => {
    it('counts flat for-loops as depth 1', () => {
        expect(maxBlockDepth('{% for x in xs %}{{ x }}{% endfor %}')).toBe(1);
    });
    it('counts nested depth', () => {
        const tpl = '{% for a in as %}{% if a %}{% for b in a.bs %}{{ b }}{% endfor %}{% endif %}{% endfor %}';
        expect(maxBlockDepth(tpl)).toBe(3);
    });
    it('ignores else/elsif/when', () => {
        const tpl = '{% if x %}1{% else %}2{% endif %}';
        expect(maxBlockDepth(tpl)).toBe(1);
    });
});

describe('renderSafe limits', () => {
    it('renders valid templates', async () => {
        const r = await renderSafe(engine, 'Hi {{ name }}', { name: 'Ada' });
        expect(r.ok).toBe(true);
        expect(r.output).toBe('Hi Ada');
    });

    it('returns a structured error for malformed templates', async () => {
        const r = await renderSafe(engine, '{% if %}broken', {});
        expect(r.ok).toBe(false);
        expect(typeof r.error).toBe('string');
    });

    it('rejects oversized templates', async () => {
        const huge = '{{ x }}' + 'a'.repeat(DEFAULT_LIMITS.maxTemplateLength + 1);
        const r = await renderSafe(engine, huge, { x: 1 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/max length/);
    });

    it('rejects deeply nested templates', async () => {
        const deep = '{% if a %}'.repeat(100) + '{% endif %}'.repeat(100);
        const r = await renderSafe(engine, deep, { a: true }, { maxNestingDepth: 16 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/nesting depth/);
    });

    it('aborts a runaway loop within the timeout budget', async () => {
        const loop = '{% for i in (1..10000000) %}{{ i }}{% endfor %}';
        const start = Date.now();
        const r = await renderSafe(engine, loop, {}, { timeoutMs: 400 });
        const elapsed = Date.now() - start;
        expect(r.ok).toBe(false);
        // Should abort well under a few seconds, not run to completion.
        expect(elapsed).toBeLessThan(3000);
    });
});

describe('renderSafe cache', () => {
    it('returns identical output on repeated renders', async () => {
        const tpl = '{{ items | size }}: {% for i in items %}{{ i }}{% endfor %}';
        const ctx = { items: [1, 2, 3] };
        const a = await renderSafe(engine, tpl, ctx);
        const b = await renderSafe(engine, tpl, ctx);
        const c = await renderSafe(engine, tpl, ctx);
        expect(a.ok && b.ok && c.ok).toBe(true);
        expect(a.output).toBe(b.output);
        expect(b.output).toBe(c.output);
    });
});
