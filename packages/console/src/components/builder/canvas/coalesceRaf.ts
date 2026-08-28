/**
 * coalesceRaf — coalesce multiple `schedule()` calls into a single animation
 * frame on the given `win`.
 *
 * Used by the iframe canvas to debounce the burst of ResizeObserver / scroll /
 * resize notifications that fire together as the document settles, so the
 * measure + rect-query work runs at most once per frame instead of N times.
 *
 * Returns `{ schedule, cancel }`. `schedule()` is idempotent within a frame:
 * the first call books a rAF; subsequent calls before it fires are no-ops.
 * `cancel()` cancels a pending frame (safe to call when none is pending).
 */
export function coalesceRaf(
    win: Window,
    fn: () => void,
): { schedule: () => void; cancel: () => void } {
    let raf = 0;
    const schedule = () => {
        if (raf) return;
        raf = win.requestAnimationFrame(() => {
            raf = 0;
            fn();
        });
    };
    const cancel = () => {
        if (raf) {
            win.cancelAnimationFrame(raf);
            raf = 0;
        }
    };
    return { schedule, cancel };
}
