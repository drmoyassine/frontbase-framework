/**
 * useIframeSelection — wires click / hover / dblclick on the iframe
 * `contentDocument` to the builder store.
 *
 * Mirrors the framework SelectionTracker._attachIframeListeners AND preserves
 * the legacy BuilderCanvas click semantics:
 *  - scroll-target selection mode redirects the click to its callback;
 *  - element-picker mode redirects to its callback;
 *  - preview mode ignores selection;
 *  - click on empty body clears the selection.
 *
 * INLINE-EDIT MODEL (canvas)
 * The editableText pass tags text elements (including nested prop text like a
 * Hero title or a Features card title) with `data-fb-edit-id`/`data-fb-edit-prop`.
 * Click resolution prefers those:
 *  - 1st click on a text affordance → SELECT its owning component,
 *  - 2nd click on the same text (selected, no active edit) → enter inline-edit
 *    for that prop (contentEditable, committed on blur/Enter),
 *  - double-click on a text affordance → select + edit immediately,
 *  - clicks INSIDE an active editor pass through natively (caret/word-select),
 *  - plain component click → SET selection (no toggle); empty body → clear.
 *
 * Listeners are attached on the CAPTURE phase so we intercept before any
 * in-page handler runs. Because every srcdoc swap replaces the document, this
 * attach function must be re-invoked from the iframe `load` handler; it
 * returns a cleanup that the caller stores and runs before re-attaching.
 */

import { INLINE_TEXT_TYPES } from '@/lib/builder/iframeTypes';
import { findComponentId } from '@/lib/builder/iframeBridge';
import { EDIT_ID_ATTR, EDIT_PROP_ATTR, findEditTarget } from '@/lib/builder/editableText';
import { useBuilderStore } from '@/stores/builder';
import { startInlineEdit } from './iframeInlineEdit';

export interface SelectionHandlers {
    /** Hovered component id (null when over empty canvas). Debounced ~50ms. */
    onHoveredId: (id: string | null) => void;
}

const HOVER_DEBOUNCE_MS = 50;

/**
 * Attach capture-phase click / mousemove / dblclick listeners to a document.
 * Returns a cleanup function. Pure (no React) — the store is read via
 * `useBuilderStore.getState()` so handlers always see fresh state without
 * re-binding.
 */
export function attachIframeSelection(
    doc: Document,
    handlers: SelectionHandlers,
): () => void {
    const cleanups: Array<() => void> = [];
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * The element currently being inline-edited (contentEditable), or null.
     * Tracked in this closure so:
     *  - we don't preventDefault/stopPropagation on clicks INSIDE the active
     *    editor (which would break native caret placement / word selection),
     *  - we can blur-commit a previous edit before starting/switching another,
     *    avoiding two simultaneous contentEditables.
     * Reset to null by the edit's onEnd (fires on both commit and cancel).
     * Each srcdoc swap re-invokes attachIframeSelection → fresh closure.
     */
    let activeEdit: HTMLElement | null = null;
    // Teardown for the currently-active inline edit. Captured so an editor that
    // is detached WITHOUT a blur (srcdoc swap, mode toggle, unmount) can still
    // tear down its keydown/blur/pointer listeners and clear contentEditable,
    // instead of leaking them on a document about to be replaced.
    let editCleanup: (() => void) | null = null;

    const commitText = (commit: { componentId: string; property: string; text: string }) => {
        useBuilderStore.getState().updateComponentText(commit.componentId, commit.property, commit.text);
    };

    const beginEdit = (el: HTMLElement, componentId: string, prop: string) => {
        activeEdit = el;
        editCleanup = startInlineEdit(
            el,
            componentId,
            prop,
            commitText,
            () => {
                if (activeEdit === el) activeEdit = null;
                editCleanup = null;
            },
        );
    };

    /** Blur a contentEditable to force its blur→commit. Safe on detached nodes. */
    const tryBlur = (el: HTMLElement | null) => {
        if (!el) return;
        try {
            el.blur();
        } catch {
            // ignore — detached/foreign element
        }
    };

    const onClick = (e: Event) => {
        const target = e.target as HTMLElement | null;
        const state = useBuilderStore.getState();

        // 1. Scroll-target selection mode: hand the id + type to the callback.
        if (state.scrollTargetSelectionMode && state.scrollTargetCallback) {
            const id = findComponentId(target);
            if (id) {
                e.preventDefault();
                e.stopPropagation();
                const el = doc.getElementById(id);
                const type = el?.getAttribute('data-fb-component') || 'Section';
                state.scrollTargetCallback(id, type);
                state.exitScrollTargetMode();
            } else {
                // Click on empty canvas (no component hit) exits scroll-target
                // mode instead of stranding the user in it.
                state.exitScrollTargetMode();
            }
            return;
        }

        // 2. Element-picker mode: redirect to its callback.
        if (state.elementPickerMode?.active && state.elementPickerMode.callback) {
            const id = findComponentId(target);
            if (id) {
                e.preventDefault();
                e.stopPropagation();
                state.elementPickerMode.callback(id);
                state.cancelElementPicker();
            }
            return;
        }

        // 3. Preview mode: no selection, no editing.
        if (state.isPreviewMode) return;

        // 4. Click INSIDE the active editor — let the contentEditable handle it
        //    natively (caret placement / word select). The capture-phase
        //    preventDefault/stopPropagation below would otherwise swallow it.
        if (activeEdit && target && activeEdit.contains(target as Node)) {
            return;
        }

        // 5. Inline-editable text target (data-fb-edit-id), takes priority over
        //    plain component selection. Implements the click→select→edit model:
        //      • first click selects the owning component,
        //      • second click on the same text (component already selected, no
        //        active edit) enters inline-edit for that specific prop.
        const editEl = findEditTarget(target);
        if (editEl) {
            const editCid = editEl.getAttribute(EDIT_ID_ATTR);
            const editProp = editEl.getAttribute(EDIT_PROP_ATTR);
            if (editCid && editProp) {
                e.preventDefault();
                e.stopPropagation();
                if (state.selectedComponentId === editCid && activeEdit === null) {
                    // Escalation click → edit this text prop.
                    beginEdit(editEl, editCid, editProp);
                } else {
                    // First click (or switching between text props): commit any
                    // in-flight edit, then SELECT the component. We do NOT enter
                    // edit on this same click — that avoids racing the 120ms
                    // re-render triggered by the previous commit (which would
                    // swap the iframe and abort the new edit). One more click edits.
                    if (activeEdit && activeEdit !== editEl) tryBlur(activeEdit);
                    state.setSelectedComponentId(editCid);
                }
                return;
            }
        }

        // 6. Plain component hit (no editable text under the cursor).
        e.preventDefault();
        e.stopPropagation();
        if (activeEdit) tryBlur(activeEdit); // leaving an edit → commit it
        const id = findComponentId(target);
        if (id) {
            // SET selection (do not toggle). Clicking an already-selected
            // component keeps it selected so the user can then click a text
            // affordance to edit it. Click empty canvas to clear.
            state.setSelectedComponentId(id);
        } else {
            state.setSelectedComponentId(null);
        }
    };

    const onMouseMove = (e: Event) => {
        const target = e.target as HTMLElement | null;
        const id = findComponentId(target);
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => handlers.onHoveredId(id), HOVER_DEBOUNCE_MS);
    };

    const onDblClick = (e: Event) => {
        const target = e.target as HTMLElement | null;
        const state = useBuilderStore.getState();
        if (state.isPreviewMode) return;

        // Native word-select inside the active editor.
        if (activeEdit && target && activeEdit.contains(target as Node)) {
            return;
        }

        // Priority 1: an editable-text element (covers nested prop text:
        // Hero title, Features card title, Accordion item, … AND the simple
        // text-component roots, which the editableText pass stamps too).
        const editEl = findEditTarget(target);
        if (editEl) {
            const editCid = editEl.getAttribute(EDIT_ID_ATTR);
            const editProp = editEl.getAttribute(EDIT_PROP_ATTR);
            if (editCid && editProp) {
                e.preventDefault();
                e.stopPropagation();
                if (activeEdit && activeEdit !== editEl) tryBlur(activeEdit);
                state.setSelectedComponentId(editCid);
                beginEdit(editEl, editCid, editProp);
                return;
            }
        }

        // Priority 2 (fallback): a top-level INLINE_TEXT_TYPES root whose
        // stamping was skipped (e.g. older framework build without the
        // editableText affordance). Edits the whole root as 'text'.
        const id = findComponentId(target);
        if (!id) return;
        const root = doc.getElementById(id);
        if (!root) return;
        const type = root.getAttribute('data-fb-component') || '';
        if (!INLINE_TEXT_TYPES.has(type)) return;

        e.preventDefault();
        e.stopPropagation();
        if (activeEdit && activeEdit !== root) tryBlur(activeEdit);
        state.setSelectedComponentId(id);
        beginEdit(root, id, 'text');
    };

    // Capture phase → intercept before in-page handlers.
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('dblclick', onDblClick, true);

    cleanups.push(() => {
        doc.removeEventListener('click', onClick, true);
        doc.removeEventListener('mousemove', onMouseMove, true);
        doc.removeEventListener('dblclick', onDblClick, true);
    });
    cleanups.push(() => {
        if (hoverTimer) clearTimeout(hoverTimer);
    });
    // Tear down a dangling inline edit (editor detached without blur) so its
    // listeners/contentEditable cannot leak onto a stale document.
    cleanups.push(() => {
        editCleanup?.();
    });

    return () => cleanups.forEach((fn) => fn());
}
