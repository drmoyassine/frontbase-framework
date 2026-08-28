import { describe, it, expect } from 'vitest';
import { renderSync, isSimpleInterpolation, resolvePath } from '../sync';

describe('isSimpleInterpolation', () => {
    it('accepts plain literal strings', () => {
        expect(isSimpleInterpolation('Hello world')).toBe(true);
        expect(isSimpleInterpolation('')).toBe(true);
    });

    it('accepts bare dot-path interpolation', () => {
        expect(isSimpleInterpolation('{{ user.name }}')).toBe(true);
        expect(isSimpleInterpolation('Price: {{ record.price }}')).toBe(true);
        expect(isSimpleInterpolation('{{ a.b.c }}')).toBe(true);
    });

    it('rejects filters', () => {
        expect(isSimpleInterpolation('{{ price | money }}')).toBe(false);
    });

    it('rejects logic tags', () => {
        expect(isSimpleInterpolation('{% if user %}hi{% endif %}')).toBe(false);
        expect(isSimpleInterpolation('{% for x in xs %}{{ x }}{% endfor %}')).toBe(false);
    });

    it('rejects non-strings', () => {
        expect(isSimpleInterpolation(42)).toBe(false);
        expect(isSimpleInterpolation(null)).toBe(false);
        expect(isSimpleInterpolation(undefined)).toBe(false);
    });

    it('rejects empty expressions', () => {
        expect(isSimpleInterpolation('{{}}')).toBe(false);
        expect(isSimpleInterpolation('{{   }}')).toBe(false);
    });
});

describe('renderSync', () => {
    it('resolves dot paths against a flat context', () => {
        expect(renderSync('Hello {{ user.name }}', { user: { name: 'Ada' } })).toBe('Hello Ada');
    });

    it('resolves record tokens', () => {
        expect(renderSync('{{ record.title }} — {{ record.price }}', {
            record: { title: 'Widget', price: 9.99 },
        })).toBe('Widget — 9.99');
    });

    it('renders empty for missing values', () => {
        expect(renderSync('[{{ record.missing }}]', { record: {} })).toBe('[]');
    });

    it('leaves plain literals untouched', () => {
        expect(renderSync('No tokens here', {})).toBe('No tokens here');
    });

    it('serializes object values as JSON', () => {
        expect(renderSync('{{ record }}', { record: { a: 1 } })).toBe('{"a":1}');
    });
});

describe('resolvePath', () => {
    it('walks nested paths', () => {
        expect(resolvePath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
    });
    it('returns undefined for missing paths', () => {
        expect(resolvePath({ a: 1 }, 'a.b.c')).toBeUndefined();
    });
    it('returns undefined for null roots', () => {
        expect(resolvePath(null, 'a')).toBeUndefined();
    });
});
