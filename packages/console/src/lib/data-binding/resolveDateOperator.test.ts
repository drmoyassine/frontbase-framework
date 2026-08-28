import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveDateOperator } from '@frontbase/types';

// Pin "now" to a fixed UTC instant so is_today / is_within_last_days are deterministic.
const NOW = new Date('2026-06-18T15:30:00.000Z');

describe('resolveDateOperator', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns null for non-date operators so the caller handles them normally', () => {
        for (const op of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null']) {
            expect(resolveDateOperator({ column: 'c', op, value: 'x' })).toBeNull();
        }
        expect(resolveDateOperator({ column: 'c', op: undefined, value: 'x' })).toBeNull();
    });

    it('maps absolute operators to their wire equivalents, preserving the value', () => {
        expect(resolveDateOperator({ column: 'created_at', op: 'is_before', value: '2026-01-01' }))
            .toEqual([{ column: 'created_at', op: 'lt', value: '2026-01-01' }]);
        expect(resolveDateOperator({ column: 'created_at', op: 'is_after', value: '2026-01-01' }))
            .toEqual([{ column: 'created_at', op: 'gt', value: '2026-01-01' }]);
        expect(resolveDateOperator({ column: 'created_at', op: 'is_on_or_before', value: '2026-01-01' }))
            .toEqual([{ column: 'created_at', op: 'lte', value: '2026-01-01' }]);
        expect(resolveDateOperator({ column: 'created_at', op: 'is_on_or_after', value: '2026-01-01' }))
            .toEqual([{ column: 'created_at', op: 'gte', value: '2026-01-01' }]);
    });

    it('drops absolute operators with an empty/whitespace/missing value', () => {
        expect(resolveDateOperator({ column: 'c', op: 'is_before', value: '' })).toEqual([]);
        expect(resolveDateOperator({ column: 'c', op: 'is_after', value: '   ' })).toEqual([]);
        expect(resolveDateOperator({ column: 'c', op: 'is_on_or_after', value: undefined })).toEqual([]);
        expect(resolveDateOperator({ column: 'c', op: 'is_on_or_before', value: null })).toEqual([]);
    });

    it('resolves is_within_last_days to a gte bound N days before now (UTC)', () => {
        // NOW − 7 days = 2026-06-11T15:30:00.000Z (setUTCDate keeps the time-of-day).
        expect(resolveDateOperator({ column: 'ts', op: 'is_within_last_days', value: '7' }))
            .toEqual([{ column: 'ts', op: 'gte', value: '2026-06-11T15:30:00.000Z' }]);
    });

    it('accepts a numeric day count for is_within_last_days', () => {
        expect(resolveDateOperator({ column: 'ts', op: 'is_within_last_days', value: 1 }))
            .toEqual([{ column: 'ts', op: 'gte', value: '2026-06-17T15:30:00.000Z' }]);
    });

    it('drops is_within_last_days when the day count is invalid or non-positive', () => {
        expect(resolveDateOperator({ column: 'ts', op: 'is_within_last_days', value: '0' })).toEqual([]);
        expect(resolveDateOperator({ column: 'ts', op: 'is_within_last_days', value: '-3' })).toEqual([]);
        expect(resolveDateOperator({ column: 'ts', op: 'is_within_last_days', value: 'abc' })).toEqual([]);
        expect(resolveDateOperator({ column: 'ts', op: 'is_within_last_days', value: '' })).toEqual([]);
    });

    it('expands is_today into a [start-of-day, start-of-next-day) UTC range, ignoring any value', () => {
        expect(resolveDateOperator({ column: 'ts', op: 'is_today', value: undefined })).toEqual([
            { column: 'ts', op: 'gte', value: '2026-06-18T00:00:00.000Z' },
            { column: 'ts', op: 'lt', value: '2026-06-19T00:00:00.000Z' },
        ]);
    });
});
