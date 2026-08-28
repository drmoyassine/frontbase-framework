import { describe, it, expect } from 'vitest';
import { deepEqual } from './equality';

describe('deepEqual', () => {
  describe('primitives', () => {
    it('returns true for identical primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('a', 'a')).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(undefined, undefined)).toBe(true);
    });

    it('returns true for identical references (fast path)', () => {
      const obj = { a: 1 };
      expect(deepEqual(obj, obj)).toBe(true);
      const arr = [1, 2, 3];
      expect(deepEqual(arr, arr)).toBe(true);
    });

    it('treats NaN as equal to NaN', () => {
      expect(deepEqual(NaN, NaN)).toBe(true);
    });

    it('returns false for different primitives', () => {
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual('a', 'b')).toBe(false);
      expect(deepEqual(true, false)).toBe(false);
      expect(deepEqual(0, null)).toBe(false);
      expect(deepEqual(null, undefined)).toBe(false);
    });

    it('returns false for different types', () => {
      expect(deepEqual(1, '1')).toBe(false);
      expect(deepEqual(0, false)).toBe(false);
    });
  });

  describe('objects', () => {
    it('returns true for structurally identical objects', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });

    it('returns true for nested identical objects', () => {
      expect(deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })).toBe(true);
    });

    it('returns false when a value differs', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    });

    it('returns false when keys differ', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    });

    it('returns false when key count differs', () => {
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it('handles empty objects', () => {
      expect(deepEqual({}, {})).toBe(true);
      expect(deepEqual({}, { a: 1 })).toBe(false);
    });
  });

  describe('arrays', () => {
    it('returns true for identical arrays', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    });

    it('returns false for different length', () => {
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('returns false for different order', () => {
      expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    });

    it('handles nested arrays', () => {
      expect(deepEqual([[1, 2], [3]], [[1, 2], [3]])).toBe(true);
      expect(deepEqual([[1, 2], [3]], [[1, 2], [4]])).toBe(false);
    });

    it('handles empty arrays', () => {
      expect(deepEqual([], [])).toBe(true);
      expect(deepEqual([], [1])).toBe(false);
    });
  });

  describe('mixed structures (component-data shapes)', () => {
    it('compares realistic props objects', () => {
      const a = { text: 'Hello', level: 'h1', binding: { table: 'users', filter: { active: true } } };
      const b = { text: 'Hello', level: 'h1', binding: { table: 'users', filter: { active: true } } };
      expect(deepEqual(a, b)).toBe(true);
    });

    it('detects a changed nested binding', () => {
      const a = { binding: { filter: { active: true } } };
      const b = { binding: { filter: { active: false } } };
      expect(deepEqual(a, b)).toBe(false);
    });

    it('detects a single keystroke change in text', () => {
      const a = { text: 'Hello World' };
      const b = { text: 'Hello Worl' };
      expect(deepEqual(a, b)).toBe(false);
    });
  });

  describe('opaque / non-plain values', () => {
    it('compares functions by reference (returns false for distinct refs)', () => {
      const f = () => 1;
      const g = () => 1;
      expect(deepEqual(f, f)).toBe(true); // same reference
      expect(deepEqual(f, g)).toBe(false); // different reference
    });

    it('rejects Date instances as structural (compared by ref)', () => {
      const d1 = new Date(0);
      const d2 = new Date(0);
      expect(deepEqual(d1, d2)).toBe(false); // not plain -> opaque
      expect(deepEqual(d1, d1)).toBe(true);
    });

    it('treats class instances as opaque', () => {
      class Foo { constructor(public x: number) {} }
      expect(deepEqual(new Foo(1), new Foo(1))).toBe(false);
    });

    it('does not recurse infinitely on circular references', () => {
      const a: any = { x: 1 };
      a.self = a;
      const b: any = { x: 1 };
      b.self = b;
      // Should terminate (return false) rather than hang.
      expect(() => deepEqual(a, b)).not.toThrow();
    });
  });

  describe('null / undefined handling', () => {
    it('treats null vs object as unequal', () => {
      expect(deepEqual(null, { a: 1 })).toBe(false);
      expect(deepEqual({ a: 1 }, null)).toBe(false);
    });

    it('treats undefined vs object as unequal', () => {
      expect(deepEqual(undefined, { a: 1 })).toBe(false);
    });
  });

  describe('deep depth', () => {
    it('builds a deeply nested identical structure', () => {
      const build = (n: number): any => (n === 0 ? 1 : { v: build(n - 1) });
      expect(deepEqual(build(5), build(5))).toBe(true);
      expect(deepEqual(build(5), build(4))).toBe(false);
    });
  });
});
