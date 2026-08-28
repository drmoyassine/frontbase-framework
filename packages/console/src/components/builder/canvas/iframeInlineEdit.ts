/**
 * iframeInlineEdit — contentEditable text editing inside the iframe document.
 *
 * Used for BOTH the top-level text roots (Text/Heading/Button/Badge/Link) AND
 * any element the editableText pass has tagged with `data-fb-edit-id`/
 * `data-fb-edit-prop` (Hero `<h1 id="${id}-title">`, Features card titles,
 * Accordion item titles, …). The element is made contentEditable in-place and
 * its textContent is committed on blur / Enter via
 * `store.updateComponentText(id, property, ...)`, where `property` is the
 * dotted prop path recorded on the element (e.g. 'text', 'title',
 * 'features.0.title', 'badge.text'). The store already walks dotted/array-index
 * paths. An optional `data-fb-edit-trim` literal is stripped from the end of
 * the committed text so decoration like the Accordion chevron '▼' is not
 * written into the prop.
 *
 * On end (commit OR cancel) `onEnd` fires so callers can reset any "active
 * edit" bookkeeping regardless of outcome.
 */

import { EDIT_TRIM_ATTR } from '@/lib/builder/editableText';

export interface InlineEditCommit {
    componentId: string;
    /** Dotted prop path recorded on the element (e.g. 'features.0.title'). */
    property: string;
    text: string;
}

/**
 * Begin editing `root` (an HTMLElement inside the iframe document) for the
 * given component + property path.
 *
 * @returns a cleanup function that tears down listeners and clears the
 *          contentEditable attribute (idempotent — safe to call twice).
 */
export function startInlineEdit(
    root: HTMLElement,
    componentId: string,
    property: string,
    onCommit: (commit: InlineEditCommit) => void,
    onEnd?: () => void,
): () => void {
    const doc = root.ownerDocument;
    if (!doc) return () => {};

    root.setAttribute('contenteditable', 'true');
    root.focus();

    // Place the caret at the end of the existing text.
    const sel = doc.getSelection();
    if (sel) {
        const range = doc.createRange();
        range.selectNodeContents(root);
        range.collapse(false); // move end → caret at end
        sel.removeAllRanges();
        sel.addRange(range);
    }

    let committed = false;

    const finish = (doCommit: boolean) => {
        if (committed) return;
        committed = true;
        cleanup();
        if (doCommit) {
            let text = root.textContent ?? '';
            // Strip a single trailing decoration literal (e.g. the Accordion
            // chevron '▼') so it is not persisted into the prop.
            const trim = root.getAttribute(EDIT_TRIM_ATTR);
            if (trim && text.endsWith(trim)) {
                text = text.slice(0, text.length - trim.length);
            }
            onCommit({ componentId, property, text });
        }
        onEnd?.();
    };

    const commit = () => finish(true);
    const cancel = () => finish(false);

    const onKey = (e: KeyboardEvent) => {
        // Stop the iframe keydown from bubbling to parent shortcuts (Delete /
        // Backspace would otherwise delete the component while typing).
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    };

    const onBlur = () => commit();

    const onStopPropagation = (e: Event) => e.stopPropagation();

    root.addEventListener('keydown', onKey);
    root.addEventListener('blur', onBlur);
    // Prevent pointer interactions inside the editor from triggering selection.
    root.addEventListener('pointerdown', onStopPropagation, true);
    root.addEventListener('mousedown', onStopPropagation, true);

    function cleanup() {
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('blur', onBlur);
        root.removeEventListener('pointerdown', onStopPropagation, true);
        root.removeEventListener('mousedown', onStopPropagation, true);
        root.removeAttribute('contenteditable');
    }

    return cleanup;
}
