import { describe, it, expect } from 'vitest';
import { createLiquidEngine } from '../engine';
import { renderSafe } from '../limits';

const engine = createLiquidEngine();

async function render(template: string, ctx: Record<string, any> = {}): Promise<string> {
    const r = await renderSafe(engine, template, ctx);
    if (!r.ok) throw new Error(r.error);
    return r.output ?? '';
}

describe('Frontbase filters (shared core)', () => {
    it('money formats currency', async () => {
        expect(await render('{{ price | money }}', { price: 29.9 })).toBe('$29.90');
        expect(await render('{{ price | money: "EUR" }}', { price: 10 })).toBe('€10.00');
    });

    it('percent formats', async () => {
        expect(await render('{{ ratio | percent }}', { ratio: 0.75 })).toBe('75%');
        expect(await render('{{ ratio | percent: 2 }}', { ratio: 0.755 })).toBe('75.50%');
    });

    it('pluralize picks singular/plural', async () => {
        expect(await render('{{ count | pluralize: "item", "items" }}', { count: 1 })).toBe('item');
        expect(await render('{{ count | pluralize: "item", "items" }}', { count: 3 })).toBe('items');
    });

    it('slugify normalizes text', async () => {
        expect(await render('{{ title | slugify }}', { title: 'Hello World!' })).toBe('hello-world');
    });

    it('truncate_words limits word count', async () => {
        expect(await render('{{ text | truncate_words: 2 }}', { text: 'one two three four' })).toBe('one two...');
    });

    it('escape_html escapes entities', async () => {
        expect(await render('{{ raw | escape_html }}', { raw: '<b>x</b>' })).toBe(
            '&lt;b&gt;x&lt;/b&gt;',
        );
    });

    it('json serializes objects', async () => {
        expect(await render('{{ obj | json }}', { obj: { a: 1 } })).toBe('{"a":1}');
    });
});
