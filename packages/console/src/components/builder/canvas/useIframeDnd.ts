/**
 * useIframeDnd — pointer-event routing between the parent overlay and the
 * iframe during an @dnd-kit drag.
 *
 * The DndContext lives in CustomBuilder (outside this phase's allowlist), so
 * all drag mechanics stay in @dnd-kit. The overlay registers droppables with
 * the exact data shapes CustomBuilder.handleDragEnd reads (see CanvasOverlay).
 *
 * Problem: while a drag is active, pointermove events over the iframe are
 * captured by the iframe's own document and never reach the parent window —
 * @dnd-kit (which listens on the parent) would lose the pointer and the drag
 * would stutter whenever the cursor crossed onto the canvas.
 *
 * Fix: while `active` is non-null, set `iframe.style.pointerEvents = 'none'`
 * so pointermove passes through to the parent. Restored on drag end / cancel
 * via the effect cleanup (also runs on unmount), so an interrupted drag never
 * leaves the iframe unclickable.
 */

import { useEffect, type RefObject } from 'react';
import { useDndContext } from '@dnd-kit/core';

export function useIframePointerRouting(
    iframeRef: RefObject<HTMLIFrameElement | null>,
): void {
    const { active } = useDndContext();

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        iframe.style.pointerEvents = active ? 'none' : '';
        return () => {
            // Always restore on change / unmount — never leave the iframe dead.
            if (iframeRef.current) iframeRef.current.style.pointerEvents = '';
        };
    }, [active, iframeRef]);
}
