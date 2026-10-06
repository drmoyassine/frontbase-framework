import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { ColumnResizeHandle, useTableColumnWidths } from './resizable-table-columns';

const columns = [
    { id: 'title', label: 'Title', minWidth: 120, maxWidth: 1200 },
    { id: 'slug', label: 'Slug', minWidth: 100, maxWidth: 1200 },
];
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
describe('persistent column preferences', () => {
    it('restores widths after remount and removes preferences on reset', () => {
        const first = renderHook(() => useTableColumnWidths('owner:a', columns));
        act(() => first.result.current.update([300, 240]));
        first.unmount();
        const second = renderHook(() => useTableColumnWidths('owner:a', columns));
        expect(second.result.current.widths).toEqual([300, 240]);
        act(() => second.result.current.reset());
        second.unmount();
        expect(renderHook(() => useTableColumnWidths('owner:a', columns)).result.current.widths).toBeNull();
    });
    it('does not transfer widths when user/workspace changes', () => {
        const hook = renderHook(({ owner }) => useTableColumnWidths(owner, columns), { initialProps: { owner: 'owner:a' } });
        act(() => hook.result.current.update([300, 240]));
        hook.rerender({ owner: 'owner:b' });
        expect(hook.result.current.widths).toBeNull();
        act(() => hook.result.current.update([400, 250]));
        hook.rerender({ owner: 'owner:a' });
        expect(hook.result.current.widths).toEqual([300, 240]);
    });
    it('ignores corrupt, obsolete and unbounded stored values', () => {
        for (const value of ['not json', '{"version":2,"widths":[300,240]}', '{"version":1,"widths":[0,100000]}', '{"version":1,"widths":[300]}']) {
            localStorage.setItem('bad', value);
            const hook = renderHook(() => useTableColumnWidths('bad', columns));
            expect(hook.result.current.widths).toBeNull(); hook.unmount();
        }
    });
    it('keeps resizing and reset usable when storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
        const hook = renderHook(() => useTableColumnWidths('owner', columns));
        act(() => hook.result.current.update([30, 20000]));
        expect(hook.result.current.widths).toEqual([120, 1200]);
        act(() => hook.result.current.reset()); expect(hook.result.current.widths).toBeNull();
    });
    it('supports keyboard resizing without changing adjacent columns', () => {
        const change = vi.fn();
        render(<table><thead><tr><th><ColumnResizeHandle column={columns[0]} index={0} width={200} onChange={change} /></th><th>Slug</th></tr></thead></table>);
        const cells = screen.getByRole('table').querySelectorAll('th');
        vi.spyOn(cells[0], 'getBoundingClientRect').mockReturnValue({ width: 200 } as DOMRect);
        vi.spyOn(cells[1], 'getBoundingClientRect').mockReturnValue({ width: 150 } as DOMRect);
        const handle = screen.getByRole('separator', { name: 'Resize Title column' });
        fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
        expect(change).toHaveBeenLastCalledWith([250, 150]);
        fireEvent.keyDown(handle, { key: 'Home' });
        expect(change).toHaveBeenLastCalledWith([120, 150]);
        fireEvent.keyDown(handle, { key: 'End' });
        expect(change).toHaveBeenLastCalledWith([1200, 150]);
    });
});
