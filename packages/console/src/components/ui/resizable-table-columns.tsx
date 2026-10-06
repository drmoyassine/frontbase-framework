import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface ResizableColumn { id: string; label: string; minWidth: number; maxWidth: number }

/** Browser-only, versioned preferences. Storage failures never prevent table use. */
export function useTableColumnWidths(key: string | null, columns: readonly ResizableColumn[]) {
    const initial = useMemo(() => {
        if (!key) return null;
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            if (value?.version !== 1 || !Array.isArray(value.widths) || value.widths.length !== columns.length) return null;
            return value.widths.every((n: unknown, i: number) => typeof n === 'number' && Number.isFinite(n) && n >= columns[i].minWidth && n <= columns[i].maxWidth)
                ? value.widths as number[] : null;
        } catch { return null; }
    }, [key, columns]);
    const [state, setState] = useState<{ key: string | null; widths: number[] | null } | null>(null);
    const widths = state?.key === key ? state.widths : initial;
    const update = (next: number[] | null) => {
        if (next && (next.length !== columns.length || next.some(n => !Number.isFinite(n)))) return;
        const bounded = next?.map((n, i) => Math.round(Math.max(columns[i].minWidth, Math.min(columns[i].maxWidth, n)))) ?? null;
        setState({ key, widths: bounded });
        if (!key) return;
        try {
            if (bounded) localStorage.setItem(key, JSON.stringify({ version: 1, widths: bounded }));
            else localStorage.removeItem(key);
        } catch { /* Session resizing still works when browser storage is disabled/full. */ }
    };
    return { widths, update, reset: () => update(null) };
}

/** Captured pointer drag, plus keyboard arrows/Home/End for accessible resizing. */
export function ColumnResizeHandle({ column, index, width, onChange }: {
    column: ResizableColumn; index: number; width?: number;
    onChange: (widths: number[]) => void;
}) {
    const drag = useRef<{ x: number; widths: number[]; pointer: number } | null>(null);
    const handle = useRef<HTMLDivElement>(null);
    const [measuredWidth, setMeasuredWidth] = useState<number>();
    useEffect(() => {
        const cell = handle.current?.closest('th');
        if (!cell) return;
        const measureWidth = () => {
            const size = Math.round(cell.getBoundingClientRect().width);
            if (size > 0) setMeasuredWidth(size);
        };
        measureWidth();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measureWidth);
        observer.observe(cell);
        return () => observer.disconnect();
    }, []);
    const measure = (element: HTMLElement) => Array.from(element.closest('tr')?.children ?? [])
        .map(cell => cell.getBoundingClientRect().width);
    const move = (event: PointerEvent<HTMLDivElement>) => {
        if (!drag.current || drag.current.pointer !== event.pointerId) return;
        const next = [...drag.current.widths];
        next[index] = Math.max(column.minWidth, Math.min(column.maxWidth, next[index] + event.clientX - drag.current.x));
        onChange(next);
    };
    const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = measure(event.currentTarget);
        next[index] = event.key === 'Home' ? column.minWidth : event.key === 'End' ? column.maxWidth
            : Math.max(column.minWidth, Math.min(column.maxWidth, next[index] + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10)));
        onChange(next);
    };
    return <div
        ref={handle} role="separator" aria-orientation="vertical" aria-label={`Resize ${column.label} column`}
        aria-valuemin={column.minWidth} aria-valuemax={column.maxWidth} aria-valuenow={measuredWidth ?? width ?? column.minWidth}
        tabIndex={0} title="Drag to resize. Use arrow keys, or Shift + arrows for larger steps."
        className="absolute inset-y-0 right-0 w-3 cursor-col-resize touch-none select-none flex items-center justify-center hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        onKeyDown={keyboard}
        onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            drag.current = { x: event.clientX, widths: measure(event.currentTarget), pointer: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={event => { move(event); drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
    ><span aria-hidden="true" className="h-5 w-px bg-gray-300 dark:bg-gray-600" /></div>;
}
