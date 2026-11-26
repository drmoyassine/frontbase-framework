import { inlineMarkRuns, inlineTemplateSchema, type InlineMark, type InlineTemplate } from './inline-template.js';

export interface InlinePickerRequest {
    host: HTMLElement;
    outsideBoundary?: HTMLElement;
    arabic: boolean;
    onSelect(path: string): void;
    onClose(): void;
}

const bindingSelector = '[data-fb-binding-chip]';
const literalSelector = '[data-fb-inline-literal]';

function atPoint(doc: Document, x: number, y: number): Range | undefined {
    const position = doc.caretPositionFromPoint?.(x, y);
    if (!position) return doc.caretRangeFromPoint?.(x, y) ?? undefined;
    const range = doc.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
}

/** Shared label editor. Record references and text formatting serialize into the same layout draft. */
export function mountInlineComposer(options: {
    editor: HTMLElement; controls: HTMLElement; parts: InlineTemplate;
    openVariablePicker(request: InlinePickerRequest): () => void;
    values?: Record<string,string>; arabic?: boolean; preserveTranslationSlots?: boolean; onChange(parts: InlineTemplate): void;
    editValue?: (partIndex: number, variable: string) => boolean;
}): (() => void) & { selectBinding(index: number): void; openPicker(): void } {
    const { editor, controls, parts, values = {}, arabic, onChange, editValue } = options;
    const doc = editor.ownerDocument;
    const win = doc.defaultView!;
    const label = arabic ? {
        text:'نص التخطيط', add:'@ إدراج متغير', replace:'تغيير الارتباط',
        remove:'إزالة الارتباط', undo:'تراجع عن تغيير النص',
        grip:'اسحب لنقل الارتباط', actions:'خيارات الارتباط', move:'اختر مكانًا للارتباط', earlier:'نقل الارتباط للخلف', later:'نقل الارتباط للأمام',
        format:'تنسيق النص المحدد', bold:'عريض', italic:'مائل', edit:'تحرير قيمة السجل أو الترجمة',
    } : {
        text:'Layout text', add:'@ Insert variable', replace:'Change binding',
        remove:'Remove binding', undo:'Undo text change',
        grip:'Drag binding within text', actions:'Binding actions', move:'Choose a location for the binding', earlier:'Move binding earlier', later:'Move binding later',
        format:'Format selected text', bold:'Bold', italic:'Italic', edit:'Edit record or translation value',
    };
    const events = new AbortController();
    const signal = events.signal;
    const undo: InlineTemplate[] = [];
    let current = options.preserveTranslationSlots ? parts.map((part, index) => 'text' in part
        ? { ...part, translationSlot: part.translationSlot ?? String(index) } : part) : parts;
    let location: Range | undefined, selected: HTMLElement | undefined;
    let mode: 'picker' | 'binding' | 'format' | 'move' | undefined;
    let releasePicker: (() => void) | undefined;
    let dragging: { id: number; fromX: number; fromY: number; target?: Range } | undefined;
    editor.dataset.fbInlineComposer = '';
    editor.contentEditable = 'true';
    editor.tabIndex = 0;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-label', label.text);

    const button = (name: string, action: () => void, icon?: string) => {
        const control = doc.createElement('button');
        control.type = 'button';
        control.textContent = icon ?? name;
        if (icon) { control.title = name; control.setAttribute('aria-label', name); }
        control.onclick = action;
        return control;
    };
    const context = doc.createElement('div');
    context.dataset.fbComposerContext = '';
    context.dir = arabic ? 'rtl' : 'ltr';
    context.hidden = true;
    context.style.cssText = 'position:fixed;z-index:2147483646;max-width:calc(100vw - 16px);box-sizing:border-box;border:1px solid #94a3b8;border-radius:7px;padding:3px;background:#f8fafc;color:#0f172a;box-shadow:0 3px 12px #0003;font:13px/1.3 system-ui';
    const status = doc.createElement('span');
    status.setAttribute('role', 'status');
    status.style.cssText = 'position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden';
    const grip = button(label.grip, () => show('move'), '⠿');
    grip.dataset.fbBindingGrip = '';
    grip.style.cssText = 'touch-action:none;cursor:grab;background:#1e3a8a;color:white;user-select:none';
    const actions = button(label.actions, () => show(mode === 'binding' ? undefined : 'binding'), '▾');
    const badge = doc.createElement('div');
    badge.dataset.fbBindingBadge = '';
    badge.append(grip, actions);
    badge.style.cssText = 'display:flex;gap:3px';
    const bindingMenu = doc.createElement('div');
    bindingMenu.dataset.fbBindingActions = '';
    const edit = button(label.edit, () => {
        if (selected && editValue?.([...editor.children].indexOf(selected), selected.dataset.fbBindingChip!)) close();
    });
    edit.hidden = true;
    bindingMenu.append(edit, button(label.replace, () => openPicker(selected)),
        button(label.remove, () => {
            if (!selected) return;
            const range = doc.createRange();
            range.setStartBefore(selected);
            range.collapse(true);
            selected.remove();
            selected = undefined;
            commit(true);
            close(range);
        }), button(label.earlier, () => step(-1)), button(label.later, () => step(1)), button(label.move, () => show('move')));
    const picker = doc.createElement('div');
    picker.dataset.fbVariablePicker = '';
    const pickerResize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(position) : undefined;
    pickerResize?.observe(picker);
    const format = doc.createElement('div');
    format.dataset.fbSelectionToolbar = '';
    format.setAttribute('role', 'toolbar');
    format.setAttribute('aria-label', label.format);
    const formatButtons = (['bold', 'italic'] as const).map(mark => {
        const control = button(label[mark], () => applyMark(mark), mark === 'bold' ? 'B' : 'I');
        control.style[mark === 'bold' ? 'fontWeight' : 'fontStyle'] = mark === 'bold' ? '700' : 'italic';
        control.onmousedown = event => event.preventDefault();
        return control;
    });
    format.append(...formatButtons);
    formatButtons[1]!.tabIndex = -1;
    format.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - formatButtons.indexOf(event.target as HTMLButtonElement);
        formatButtons.forEach((control, index) => { control.tabIndex = index === next ? 0 : -1; });
        formatButtons[next]?.focus();
    };
    const moveHint = doc.createElement('span');
    moveHint.textContent = label.move;
    const bubble = doc.createElement('div');
    bubble.dataset.fbBindingDropCaret = '';
    bubble.hidden = true;
    bubble.style.cssText = 'position:fixed;z-index:2147483646;width:2px;background:#2563eb;pointer-events:none';
    context.append(badge, bindingMenu, picker, format, moveHint, status);
    const targetSize = win.matchMedia?.('(any-pointer:coarse)')?.matches ? '44px' : '24px';
    for (const control of context.querySelectorAll('button')) {
        control.style.minHeight = targetSize;
        control.style.minWidth = targetSize;
    }
    doc.body.append(context, bubble);
    const trigger = button(label.add, () => openPicker());
    const undoButton = button(label.undo, restore);
    undoButton.disabled = true;
    // A touch drag can suppress the next synthetic click. Commit a stationary
    // tap on pointerup and consume the compatibility click if it arrives.
    let undoTap: { id: number; x: number; y: number; handled: boolean } | undefined;
    undoButton.onpointerdown = event => {
        undoTap = event.pointerType === 'touch' ? { id: event.pointerId, x: event.clientX, y: event.clientY, handled: false } : undefined;
    };
    undoButton.onpointerup = event => {
        if (undoTap?.id !== event.pointerId || Math.hypot(event.clientX - undoTap.x, event.clientY - undoTap.y) > 10) return;
        undoTap.handled = true;
        restore();
    };
    undoButton.onpointercancel = () => { undoTap = undefined; };
    undoButton.onclick = event => {
        if (undoTap?.handled && event.detail) { undoTap = undefined; return; }
        restore();
    };
    controls.append(trigger, undoButton);

    function capture(): Range | undefined {
        const selection = doc.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer)) return range.cloneRange();
    }

    function displayMark(node: Node, marks: InlineMark[]) {
        for (const [mark, tag] of [['bold', 'strong'], ['italic', 'em']] as const) {
            if (!marks.includes(mark)) continue;
            const parent = doc.createElement(tag);
            parent.append(node);
            node = parent;
        }
        return node;
    }

    function chip(part: Extract<InlineTemplate[number], { variable: string }>) {
        const span = doc.createElement('span');
        span.contentEditable = 'false';
        span.dataset.fbBindingChip = part.variable;
        span.dataset.fbInlineMarks = (part.marks ?? []).join(' ');
        const name = part.variable;
        span.append(displayMark(doc.createTextNode(values[part.variable] || name), part.marks ?? []));
        span.title = name;
        span.style.cssText = 'background:#dbeafe;color:#1e3a8a;border:1px solid #3b82f6;border-radius:4px;box-decoration-break:clone;padding-inline:2px;cursor:pointer';
        return span;
    }

    function render(template: InlineTemplate) {
        editor.replaceChildren(...template.map(part => {
            if ('variable' in part) return chip(part);
            const literal = doc.createElement('span');
            literal.dataset.fbInlineLiteral = '';
            if (part.translationSlot) literal.dataset.fbTranslationSlot = part.translationSlot;
            literal.append(...inlineMarkRuns(part.text, part.emphasis).map(run => displayMark(doc.createTextNode(run.text), run.marks)));
            return literal;
        }));
        location = undefined;
        selected = undefined;
    }

    function read(): InlineTemplate {
        const next: InlineTemplate = [];
        let literal: Extract<InlineTemplate[number], { text: string }> = { text: '' };
        let literalNode: HTMLElement | undefined;
        const reserved = new Set([...editor.querySelectorAll<HTMLElement>('[data-fb-translation-slot]')].map(node => node.dataset.fbTranslationSlot));
        let slotIndex = 0;
        const flush = () => {
            if (literal.text) {
                if (!literal.translationSlot && reserved.has(String(next.length))) {
                    while (reserved.has('literal-' + slotIndex)) slotIndex++;
                    literal.translationSlot = 'literal-' + slotIndex++;
                    if (literalNode) literalNode.dataset.fbTranslationSlot = literal.translationSlot;
                }
                next.push(literal);
            }
            literal = { text: '' };
            literalNode = undefined;
        };
        const walk = (node: Node, marks: InlineMark[] = []) => {
            if (node.nodeType === 3) {
                const text = node.textContent ?? '';
                if (!text) return;
                if (marks.length) for (const mark of marks) (literal.emphasis ??= []).push({ start: literal.text.length, text, mark });
                literal.text += text;
                return;
            }
            if (!(node instanceof win.HTMLElement)) return;
            const variable = node.dataset.fbBindingChip;
            if (variable) {
                flush();
                const marks = (node.dataset.fbInlineMarks ?? '').split(' ').filter((mark): mark is InlineMark => mark === 'bold' || mark === 'italic');
                next.push(marks.length ? { variable, marks } : { variable });
                return;
            }
            const slot = node.dataset.fbTranslationSlot;
            if (slot) { flush(); literal.translationSlot = slot; }
            if (node.matches(literalSelector)) literalNode = node;
            const mark: InlineMark | undefined = node.matches('strong,b') ? 'bold' : node.matches('em,i') ? 'italic' : undefined;
            const nested = mark && !marks.includes(mark) ? [...marks, mark] : marks;
            for (const child of node.childNodes) walk(child, nested);
            if (slot) flush();
        };
        for (const child of editor.childNodes) walk(child);
        flush();
        return next;
    }

    function commit(rollback = false) {
        const next = read();
        if (JSON.stringify(next) === JSON.stringify(current)) return true;
        if (!inlineTemplateSchema.safeParse(next).success) {
            if (rollback) { render(current); close(); }
            return false;
        }
        undo.push(current);
        undoButton.disabled = false;
        current = next;
        onChange(next);
        return true;
    }

    function restore() {
        const previous = undo.pop();
        if (!previous) return;
        render(previous);
        close();
        onChange(current = previous);
        editor.focus();
        undoButton.disabled = !undo.length;
    }

    function position() {
        if (context.hidden) return;
        const rect = mode === 'format' ? location?.getBoundingClientRect() : selected?.getClientRects()[0] ?? location?.getBoundingClientRect();
        const anchor = rect && (rect.width || rect.height) ? rect : editor.getBoundingClientRect();
        const width = context.offsetWidth, height = context.offsetHeight;
        const x = arabic ? anchor.right - width : anchor.left;
        const above = anchor.top - height - 6, below = anchor.bottom + 6;
        const fitsBelow = below + height <= win.innerHeight - 8;
        const preferAbove = mode === 'format' || selected;
        const y = above >= 8 && (preferAbove || !fitsBelow) ? above : below;
        context.style.left = Math.max(8, Math.min(x, win.innerWidth - width - 8)) + 'px';
        context.style.top = Math.max(8, Math.min(y, win.innerHeight - height - 8)) + 'px';
    }

    function show(next?: typeof mode, announce = true) {
        if (next !== 'picker' && releasePicker) { releasePicker(); releasePicker = undefined; }
        mode = next;
        context.hidden = !selected && !mode;
        badge.hidden = !selected || mode === 'picker' || mode === 'format';
        badge.style.display = badge.hidden ? 'none' : 'flex';
        actions.setAttribute('aria-expanded', String(mode === 'binding'));
        bindingMenu.hidden = mode !== 'binding';
        edit.hidden = !editValue || !selected?.dataset.fbBindingChip?.startsWith('record.');
        picker.hidden = mode !== 'picker';
        format.hidden = mode !== 'format';
        moveHint.hidden = mode !== 'move';
        trigger.setAttribute('aria-expanded', String(mode === 'picker'));
        if (announce && !context.hidden) doc.dispatchEvent(new win.CustomEvent('frontbase:context-open', { detail: context }));
        position();
    }

    function select(element?: HTMLElement) {
        selected?.removeAttribute('data-selected');
        selected = element;
        selected?.setAttribute('data-selected', '');
        show();
    }

    function close(range?: Range) {
        select();
        if (!range || !editor.contains(range.commonAncestorContainer)) return;
        editor.focus();
        const selection = doc.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    }

    function openPicker(target?: HTMLElement) {
        location = capture() ?? location;
        selected = target;
        releasePicker?.();
        show('picker');
        releasePicker = options.openVariablePicker({ host: picker, arabic: !!arabic, onSelect: insert,
            onClose: () => { if (mode === 'picker') close(location); } });
    }

    function insert(path: string) {
        const element = chip({ variable: path });
        const range = doc.createRange();
        if (selected) selected.replaceWith(element);
        else {
            const insertion = location && editor.contains(location.commonAncestorContainer) ? location : range;
            if (insertion === range) { range.selectNodeContents(editor); range.collapse(false); }
            insertion.deleteContents();
            insertion.insertNode(element);
        }
        range.setStartAfter(element);
        range.collapse(true);
        if (commit(true)) close(range);
    }

    function moveTo(range: Range) {
        if (!selected || selected.contains(range.startContainer)) return;
        const binding = selected;
        const previous = current;
        range.insertNode(binding);
        normalizeLiterals();
        const after = doc.createRange();
        after.setStartAfter(binding);
        after.collapse(true);
        if (!commit(true)) return;
        if (current !== previous) status.textContent = arabic ? 'تم نقل الارتباط' : 'Binding moved';
        close(after);
        select(binding);
        grip.focus({ preventScroll: true });
    }

    // A pointer can land inside a formatted literal. Lift the moved atom out,
    // splitting that literal with a DOM range so its marks travel with its text.
    function normalizeLiterals() {
        if (!selected) return;
        const wrapper = selected.parentElement?.closest<HTMLElement>(literalSelector);
        if (!wrapper || !editor.contains(wrapper)) return;
        const suffix = doc.createRange();
        suffix.selectNodeContents(wrapper);
        suffix.setStartAfter(selected);
        const rest = suffix.extractContents();
        const next = doc.createElement('span');
        next.dataset.fbInlineLiteral = '';
        next.append(rest);
        wrapper.after(selected, next);
        if (!wrapper.textContent) {
            if (wrapper.dataset.fbTranslationSlot) next.dataset.fbTranslationSlot = wrapper.dataset.fbTranslationSlot;
            wrapper.remove();
        }
        if (!next.textContent) next.remove();
    }

    function step(direction: number) {
        if (!selected || !selected.parentNode) return;
        const sibling = direction < 0 ? selected.previousSibling : selected.nextSibling;
        if (!sibling) return;
        const range = doc.createRange();
        if (direction < 0) range.setStartBefore(sibling);
        else range.setStartAfter(sibling);
        range.collapse(true);
        moveTo(range);
    }

    function targetAt(event: PointerEvent | MouseEvent) {
        const node = doc.elementFromPoint?.(event.clientX, event.clientY);
        if (!node || !editor.contains(node)) return;
        const target = node.closest<HTMLElement>(bindingSelector);
        if (target) {
            if (target === selected) return;
            const rect = target.getBoundingClientRect();
            const range = doc.createRange();
            const left = event.clientX < (rect.left + rect.right) / 2;
            if (left !== (win.getComputedStyle(editor).direction === 'rtl')) range.setStartBefore(target);
            else range.setStartAfter(target);
            range.collapse(true);
            return range;
        }
        const range = atPoint(doc, event.clientX, event.clientY);
        if (range && editor.contains(range.startContainer)) return range;
    }

    function finishDrag(event?: PointerEvent) {
        if (!dragging || (event && event.pointerId !== dragging.id)) return;
        const { id, target } = dragging;
        dragging = undefined;
        bubble.hidden = true;
        if (grip.hasPointerCapture(id)) grip.releasePointerCapture(id);
        if (event?.type === 'pointerup' && target) moveTo(target);
    }

    grip.onpointerdown = event => {
        if (!selected || !event.isPrimary || event.button !== 0) return;
        grip.setPointerCapture(event.pointerId);
        dragging = { id: event.pointerId, fromX: event.clientX, fromY: event.clientY };
    };
    grip.onpointermove = event => {
        if (dragging?.id !== event.pointerId || Math.hypot(event.clientX - dragging.fromX, event.clientY - dragging.fromY) < 5) return;
        const range = dragging.target = targetAt(event);
        const rect = range?.getBoundingClientRect();
        bubble.hidden = !rect;
        if (rect) {
            bubble.style.left = (rect.height ? rect.left : event.clientX) + 'px';
            bubble.style.top = (rect.height ? rect.top : event.clientY - 9) + 'px';
            bubble.style.height = (rect.height || 18) + 'px';
        }
    };
    grip.onpointerup = event => {
        if (dragging?.target) grip.onclick = () => { grip.onclick = () => show('move'); };
        finishDrag(event);
    };
    grip.onpointercancel = finishDrag;
    grip.onlostpointercapture = finishDrag;
    grip.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        step((event.key === 'ArrowLeft') !== (win.getComputedStyle(editor).direction === 'rtl') ? -1 : 1);
    };

    function markTargets(range: Range): { node: Text | HTMLElement; start: number; end: number }[] {
        const walker = doc.createTreeWalker(editor, win.NodeFilter.SHOW_TEXT);
        const targets: { node: Text | HTMLElement; start: number; end: number }[] = [];
        const seen = new Set<HTMLElement>();
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            if (!range.intersectsNode(node)) continue;
            const binding = node.parentElement?.closest<HTMLElement>(bindingSelector);
            if (binding) {
                if (!seen.has(binding)) targets.push({ node: binding, start: 0, end: binding.textContent?.length ?? 0 });
                seen.add(binding);
                continue;
            }
            const start = range.startContainer === node ? range.startOffset : 0;
            const end = range.endContainer === node ? range.endOffset : node.length;
            if (start < end) targets.push({ node, start, end });
        }
        return targets;
    }

    const markSelector = (mark: InlineMark) => mark === 'bold' ? 'strong,b' : 'em,i';
    const hasMark = (node: Text | HTMLElement, mark: InlineMark) => node instanceof win.HTMLElement
        ? (node.dataset.fbInlineMarks ?? '').split(' ').includes(mark)
        : !!node.parentElement?.closest(markSelector(mark)) && editor.contains(node.parentElement.closest(markSelector(mark)));

    function applyMark(mark: InlineMark) {
        const highlighted = capture();
        const range = highlighted && !highlighted.collapsed ? highlighted : location;
        if (!range || range.collapsed || !editor.contains(range.commonAncestorContainer)) return;
        const targets = markTargets(range);
        if (!targets.length) return;
        const leadingText = doc.createRange();
        leadingText.selectNodeContents(editor);
        leadingText.setEnd(range.startContainer, range.startOffset);
        const startOffset = leadingText.toString().length, endOffset = startOffset + range.toString().length;
        const enable = !targets.every(({ node }) => hasMark(node, mark));
        for (const { node, start, end } of targets) {
            if (hasMark(node, mark) === enable) continue;
            if (node instanceof win.HTMLElement) {
                const marks = (node.dataset.fbInlineMarks ?? '').split(' ').filter(value => value && value !== mark) as InlineMark[];
                if (enable) marks.push(mark);
                node.dataset.fbInlineMarks = marks.join(' ');
                node.replaceChildren(displayMark(doc.createTextNode(node.textContent ?? ''), marks));
            } else {
                const selection = doc.createRange();
                selection.setStart(node, start);
                selection.setEnd(node, end);
                const text = selection.extractContents();
                if (enable) selection.insertNode(displayMark(text, [mark]));
                else {
                    const wrapper = node.parentElement?.closest(markSelector(mark));
                    if (!wrapper) continue;
                    const suffix = doc.createRange();
                    suffix.selectNodeContents(wrapper);
                    suffix.setStart(selection.startContainer, selection.startOffset);
                    const tail = suffix.extractContents();
                    const next = wrapper.cloneNode(false) as HTMLElement;
                    next.append(tail);
                    // Keep the other mark on the selected words.
                    const other = mark === 'bold' ? 'italic' : 'bold';
                    const keep = hasMark(node, other);
                    wrapper.after(displayMark(text, keep ? [other] : []), next);
                }
            }
        }
        if (!commit(true)) return;
        const walker = doc.createTreeWalker(editor, win.NodeFilter.SHOW_TEXT);
        const restored = doc.createRange();
        let offset = 0, started = false;
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            if (!started && offset + node.length >= startOffset) {
                restored.setStart(node, startOffset - offset);
                started = true;
            }
            if (started && offset + node.length >= endOffset) {
                restored.setEnd(node, endOffset - offset);
                editor.focus({ preventScroll: true });
                const selection = doc.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(restored);
                location = restored;
                break;
            }
            offset += node.length;
        }
    }

    context.onkeydown = event => {
        if (event.key === 'Escape' && mode !== 'picker') { event.preventDefault(); event.stopPropagation(); finishDrag(); close(location); editor.focus(); }
    };
    editor.oninput = () => commit(true);
    editor.onclick = event => {
        if (mode === 'move') {
            event.preventDefault();
            const range = targetAt(event);
            if (range) moveTo(range);
            return;
        }
        const target = (event.target as HTMLElement).closest<HTMLElement>(bindingSelector);
        if (target) { event.preventDefault(); select(target); }
        else if (!capture() || capture()?.collapsed) close();
    };
    editor.onkeydown = event => {
        if (event.isComposing) return;
        const modifier = (event.ctrlKey || event.metaKey) && !event.altKey;
        if (event.key === '@') { event.preventDefault(); openPicker(); }
        if (event.altKey && event.key === 'ArrowDown') {
            location = capture();
            const range = location;
            if (!range) return;
            const { startContainer, startOffset } = range;
            const node = startContainer.nodeType === 3
                ? (startOffset === 0 ? startContainer.previousSibling : startContainer.nextSibling)
                : startContainer.childNodes[startOffset] ?? startContainer.childNodes[startOffset - 1];
            const binding = node instanceof win.HTMLElement && node.matches(bindingSelector) ? node : selected;
            if (binding) { event.preventDefault(); select(binding); show('binding'); actions.focus(); }
        }
        if (modifier && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); restore(); }
        if (modifier && /^[bi]$/i.test(event.key)) { event.preventDefault(); applyMark(event.key.toLowerCase() === 'b' ? 'bold' : 'italic'); }
        if (event.key === 'Escape' && !context.hidden) { event.preventDefault(); event.stopPropagation(); finishDrag(); close(); }
    };
    editor.onbeforeinput = event => {
        const input = event as InputEvent;
        if (!input.isComposing && input.inputType === 'insertText' && input.data === '@' && input.cancelable) {
            input.preventDefault();
            openPicker();
        } else if (/^(format|insertParagraph|insertLineBreak|insertFromDrop)/.test(input.inputType)) event.preventDefault();
    };
    editor.onpaste = event => {
        event.preventDefault();
        const range = capture();
        if (!range) return;
        const text = doc.createTextNode(event.clipboardData?.getData('text/plain').replace(/\r?\n/g, ' ') ?? '');
        range.deleteContents();
        range.insertNode(text);
        range.setStartAfter(text);
        range.collapse(true);
        if (commit(true)) close(range);
    };
    editor.ondrop = event => event.preventDefault();
    doc.addEventListener('selectionchange', () => {
        if (context.contains(doc.activeElement) || dragging || mode === 'move' || mode === 'picker') return;
        const range = capture();
        if (range && !range.collapsed && editor.contains(doc.activeElement)) {
            location = range;
            selected?.removeAttribute('data-selected');
            selected = undefined;
            const targets = markTargets(range);
            formatButtons.forEach((control, index) => {
                control.setAttribute('aria-pressed', String(targets.length > 0 && targets.every(({ node }) => hasMark(node, index ? 'italic' : 'bold'))));
            });
            show('format', mode !== 'format');
        } else if (mode === 'format') close();
    }, { signal });
    doc.addEventListener('pointerdown', event => {
        const target = event.target as Node;
        if (!context.contains(target) && !editor.contains(target) && !controls.contains(target)) close();
    }, { signal });
    doc.addEventListener('frontbase:context-open', event => {
        if ((event as CustomEvent).detail !== context) close();
    }, { signal });
    win.addEventListener('scroll', position, { capture: true, passive: true, signal });
    win.addEventListener('resize', position, { passive: true, signal });
    win.addEventListener('blur', () => finishDrag(), { signal });
    render(current);
    return Object.assign(() => {
        events.abort();
        pickerResize?.disconnect();
        releasePicker?.();
        finishDrag();
        context.remove();
        bubble.remove();
        editor.replaceChildren();
        controls.replaceChildren();
    }, { selectBinding: (index: number) => select(editor.querySelectorAll<HTMLElement>(bindingSelector)[index]), openPicker: () => openPicker() });
}
