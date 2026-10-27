/**
 * Equality utilities for React.memo comparators and render optimization.
 *
 * These are tuned for comparing builder component data (props, styles,
 * stylesData) — plain JSON-like structures produced by the Zustand + Immer
 * store. They deliberately bail out (return false) on non-comparable values
 * such as functions, class instances, and React elements, which should instead
 * be compared by reference.
 */

/**
 * Structural deep-equality for plain data (primitives, plain objects, arrays).
 *
 * - Fast path: referential equality (including NaN-aware primitive checks).
 * - Recurses into arrays and plain objects only.
 * - Treats functions, symbols, class instances, and React elements as
 *   opaque — they must be compared by reference at the call site.
 * - Bounded recursion via a max depth guard so a malformed (e.g. circular)
 *   payload can never hang the comparator.
 *
 * @returns true when `a` and `b` are structurally identical plain data.
 */
export function deepEqual(a: unknown, b: unknown, maxDepth = 12): boolean {
    // Fast path: identical reference (covers primitives, null, undefined, and
    // already-memoized object references from structural sharing).
    if (a === b) return true;

    // NaN awareness (NaN === NaN is false, but they are equal for our purposes).
    if (a !== a && b !== b) return true;

    // Either is null/undefined but not both (reference check already handled
    // the both-null case above).
    if (a == null || b == null) return false;

    if (maxDepth <= 0) return false;

    const typeA = typeof a;
    const typeB = typeof b;

    // Different primitive types cannot be equal.
    if (typeA !== typeB) return false;

    // Functions and symbols are opaque — compare by reference (already failed
    // the fast path, so they differ).
    if (typeA === 'function' || typeA === 'symbol') return false;

    // From here both are non-null objects.
    const isArrayA = Array.isArray(a);
    const isArrayB = Array.isArray(b);
    if (isArrayA !== isArrayB) return false;

    // Reject class instances, Dates, Maps, RegExps, React elements, etc. —
    // only compare plain objects and arrays structurally. These exotic objects
    // are compared by reference (which already failed above).
    if (!isPlainObject(a) && !isArrayA) return false;

    if (isArrayA) {
        const arrA = a as unknown[];
        const arrB = b as unknown[];
        if (arrA.length !== arrB.length) return false;
        for (let i = 0; i < arrA.length; i++) {
            if (!deepEqual(arrA[i], arrB[i], maxDepth - 1)) return false;
        }
        return true;
    }

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
        if (!deepEqual(objA[key], objB[key], maxDepth - 1)) return false;
    }

    return true;
}

/**
 * True when `value` is a plain object literal (created via {} or new Object()),
 * not a class instance, Date, Map, React element, etc.
 */
function isPlainObject(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;

    const proto = Object.getPrototypeOf(value);
    // Object.create(null) has no prototype; treat it as plain too.
    if (proto === null) return true;

    // Plain objects have Object.prototype as their direct prototype.
    return proto === Object.prototype;
}
