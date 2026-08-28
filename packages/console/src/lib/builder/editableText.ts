/**
 * editableText — discovers and stamps inline-editable text elements inside
 * the eSSR iframe canvas.
 *
 * WHY THIS EXISTS
 * The canvas is a same-origin <iframe> whose srcdoc is the framework's eSSR
 * HTML. Selection (`useIframeSelection`) resolves clicks via
 * `closest('[data-fb-id]')`, and inline-edit (`iframeInlineEdit`) turns the
 * target element into a contentEditable. That loop only works when the
 * clicked text lives inside a top-level Text/Heading/Button/Badge/Link root,
 * because `stampComponentIds` only marks layout-tree nodes with `data-fb-id`.
 *
 * Compound components (Hero, Features, Pricing, Card, Accordion, …) render
 * their text from PROPS (title, subtitle, features[].title, items[].title, …),
 * not from child component nodes. The framework either emits a synthesised id
 * (Hero: `<h1 id="${id}-title">`), a per-item id (Features card:
 * `id="${featureId}"`), or no id at all (section headers). None are layout
 * tree nodes, so `stampComponentIds` never marks them. A click on their text
 * therefore resolves to the compound ROOT, whose type is not an inline-text
 * type, so inline-edit never engages. THIS is the root cause of "nested text
 * won't enter edit mode".
 *
 * THE FIX
 * After every srcdoc swap (in `IframeCanvas.handleLoad`, right after
 * `stampComponentIds`), this module walks the SAME layout tree and, for each
 * component with known text props, locates the rendered element(s) inside the
 * iframe DOM and stamps them with:
 *   data-fb-edit-id   = the component id (which component to mutate)
 *   data-fb-edit-prop = the dotted prop path (e.g. 'features.0.title')
 *   data-fb-edit-trim = optional trailing literal to strip at commit (chevrons)
 *   class fb-editable-text (+ a once-per-doc hover/cursor affordance style)
 * `useIframeSelection` then resolves clicks on `[data-fb-edit-id]` FIRST and
 * routes a second click (or a double-click) into `iframeInlineEdit`, which
 * commits the edited text back through `updateComponentText` to the exact
 * prop path (the store already handles dotted/array-index paths).
 *
 * FORWARD COMPATIBILITY
 * If a future framework change emits `data-fb-edit="<prop>"` directly on a
 * text element, that is honoured with the highest priority and no heuristic
 * lookup is needed — a trivial per-renderer framework change makes editing
 * fully robust. Until then, the per-type locators below are coupled to the
 * framework's current HTML structure and silently no-op when the structure
 * changes (worst case: no edit affordance, never a wrong edit).
 */
import type { ComponentData } from '@/types/builder';
import { walkLayout } from './iframeBridge';

export const EDIT_ID_ATTR = 'data-fb-edit-id';
export const EDIT_PROP_ATTR = 'data-fb-edit-prop';
export const EDIT_TRIM_ATTR = 'data-fb-edit-trim';
export const EDIT_CLASS = 'fb-editable-text';
const STYLE_ID = 'fb-builder-edit-affordance';
/** A future framework-emitted marker (`data-fb-edit="<prop>"`); honoured first. */
const FW_MARKER_ATTR = 'data-fb-edit';

function ensureAffordanceStyle(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    // cursor-text wins over e.g. Button cursor:pointer so users see that the
    // text is editable. The hover affordance mirrors the legacy React
    // createEditableText (`cursor-text hover:bg-accent/20`).
    style.textContent =
        `.${EDIT_CLASS}{cursor:text !important}` +
        `.${EDIT_CLASS}:hover{background-color:rgba(59,130,246,0.10);box-shadow:0 0 0 2px rgba(59,130,246,0.18);border-radius:2px}`;
    (doc.head || doc.documentElement).appendChild(style);
}

function mark(
    el: HTMLElement | null,
    componentId: string,
    prop: string | null,
    trim?: string,
): void {
    if (!el || !prop) return;
    el.setAttribute(EDIT_ID_ATTR, componentId);
    el.setAttribute(EDIT_PROP_ATTR, prop);
    if (trim) el.setAttribute(EDIT_TRIM_ATTR, trim);
    el.classList.add(EDIT_CLASS);
}

/** Honour framework-emitted `data-fb-edit` markers on or under the root. */
function stampFwMarkers(root: HTMLElement, componentId: string): void {
    if (root.hasAttribute(FW_MARKER_ATTR)) {
        mark(root, componentId, root.getAttribute(FW_MARKER_ATTR));
    }
    const marked = root.querySelectorAll(`[${FW_MARKER_ATTR}]`);
    marked.forEach((el) => {
        const prop = el.getAttribute(FW_MARKER_ATTR);
        if (prop) mark(el as HTMLElement, componentId, prop);
    });
}

function byId(doc: Document, id: string): HTMLElement | null {
    return id ? doc.getElementById(id) : null;
}

/**
 * Stamp editable text elements for every node in the layout tree. No-op in
 * preview mode (so no affordance leaks into preview) and when the doc/body is
 * absent. Idempotent — safe to re-run on every srcdoc swap (each swap yields a
 * fresh document anyway).
 */
export function stampEditableText(
    doc: Document,
    nodes: ComponentData[],
    isPreviewMode: boolean,
): void {
    if (isPreviewMode || !doc || !doc.body) return;
    ensureAffordanceStyle(doc);
    walkLayout(nodes, (node) => {
        if (!node.id) return;
        stampComponent(doc, node);
    });
}

/** Resolve the nearest stamped editable-text element for a click target. */
export function findEditTarget(el: Element | null): HTMLElement | null {
    if (!el) return null;
    const hit = el.closest(`[${EDIT_ID_ATTR}]`) as HTMLElement | null;
    return hit;
}

/**
 * Remove every inline-edit affordance marker (attributes + class) from the
 * document. Used when toggling INTO preview (so no cursor-text / hover
 * affordance leaks into the preview), and before re-stamping when toggling
 * BACK to edit (so a fresh, deterministic pass replaces the previous one).
 *
 * The affordance `<style>` (cursor-text + hover ring) is LEFT in place — it
 * only targets `.fb-editable-text`, so once the class is removed the style has
 * no effect. Idempotent.
 */
export function clearEditableText(doc: Document): void {
    if (!doc) return;
    const stamped = doc.querySelectorAll<HTMLElement>(`[${EDIT_ID_ATTR}]`);
    stamped.forEach((el) => {
        el.removeAttribute(EDIT_ID_ATTR);
        el.removeAttribute(EDIT_PROP_ATTR);
        el.removeAttribute(EDIT_TRIM_ATTR);
        el.classList.remove(EDIT_CLASS);
    });
}

function stampComponent(doc: Document, node: ComponentData): void {
    const id = node.id;
    const type = node.type;
    const props = (node.props || {}) as Record<string, any>;
    const root = byId(doc, id);

    // Future framework-emitted markers win and short-circuit heuristic lookup.
    if (root) stampFwMarkers(root, id);

    switch (type) {
        case 'Text':
        case 'Heading':
        case 'Button':
        case 'Badge':
        case 'Link':
            // The root element itself is the text node. Stamping the root in
            // addition to its data-fb-id makes the click→edit escalation in
            // useIframeSelection uniform with compound text.
            mark(root, id, 'text');
            break;

        case 'Hero':
            stampHero(doc, id, props);
            break;

        case 'Features':
        case 'FeatureSection':
            stampFeatures(doc, id, props);
            break;

        case 'Pricing':
            stampSectionHeader(byId(doc, id), id, 'title', 'subtitle');
            // plan card fields are intentionally NOT stamped: the framework
            // emits no stable ids on plan cards and the card structure relies
            // on Tailwind classes, making lookup fragile / error-prone. Use the
            // properties panel for plan fields until the framework tags them.
            break;

        case 'LogoCloud':
            stampLogoCloud(byId(doc, id), id, props);
            break;

        case 'Card':
            stampCard(root, id, props);
            break;

        case 'Accordion':
            stampAccordion(root, id, props, 'title', 'content', true);
            break;

        case 'FAQ':
            stampFaq(root, id, props);
            break;

        default:
            break;
    }
}

/** Hero sub-parts carry synthesised ids: `${id}-title|subtitle|badge`. */
function stampHero(doc: Document, id: string, props: Record<string, any>): void {
    if (props.title != null) mark(byId(doc, `${id}-title`), id, 'title');
    if (props.subtitle != null) mark(byId(doc, `${id}-subtitle`), id, 'subtitle');
    if (props.badge != null) {
        const prop = typeof props.badge === 'object' ? 'badge.text' : 'badge';
        mark(byId(doc, `${id}-badge`), id, prop);
    }
    // ctaText / secondaryCtaText are NOT stamped: the CTA <a>/<button> has no
    // id and no stable selector. Edit those via the properties panel.
}

/**
 * Features cards are reliable: the framework stamps each card root with
 * `id="${featureId}"` where featureId = feature.id || `${id}-feature-${index}`.
 * Section header is best-effort (first <h2> + its sibling <p>).
 */
function stampFeatures(doc: Document, id: string, props: Record<string, any>): void {
    const section = byId(doc, id);
    stampSectionHeader(section, id, 'title', 'subtitle');
    const features = Array.isArray(props.features) ? props.features : [];
    features.forEach((feature: any, index: number) => {
        if (!feature) return;
        // Match the framework's featureId resolution EXACTLY (Features.ts).
        const featureId = feature.id || `${id}-feature-${index}`;
        const card = byId(doc, featureId);
        if (!card) return;
        const content = card.querySelector('.fb-datacard-content') || card;
        if (feature.title != null) {
            mark(content.querySelector('h4'), id, `features.${index}.title`);
        }
        if (feature.description != null) {
            mark(content.querySelector('p'), id, `features.${index}.description`);
        }
    });
}

/** Section header is rendered as `<div><h2>title</h2><p>subtitle</p></div>`. */
function stampSectionHeader(
    section: HTMLElement | null,
    sectionId: string,
    titleProp: string,
    subtitleProp: string,
): void {
    if (!section) return;
    const h2 = section.querySelector('h2');
    if (h2) mark(h2 as HTMLElement, sectionId, titleProp);
    // `h2 + p` matches the subtitle <p> that immediately follows the title;
    // ignores card titles (which are <h4>).
    const sub = section.querySelector('h2 + p');
    if (sub) mark(sub as HTMLElement, sectionId, subtitleProp);
}

function stampLogoCloud(
    section: HTMLElement | null,
    id: string,
    props: Record<string, any>,
): void {
    if (!section) return;
    if (props.title != null) {
        // LogoCloud renders the title as the first <p> in the section.
        const titleEl = section.querySelector('p');
        if (titleEl) mark(titleEl as HTMLElement, id, 'title');
    }
    // text-logo values are not stamped: logos intermix <img>/<span> and the
    // index→DOM mapping depends on render order (and marquee duplication).
}

/** Card (feature mode): title in <h4>, description in <p> under .fb-datacard-content. */
function stampCard(root: HTMLElement | null, id: string, props: Record<string, any>): void {
    if (!root) return;
    // Only stamp when the card is in feature/header mode (has a title prop).
    // Container-mode cards (children instead of title) have no h4/p to bind.
    if (props.title == null && props.description == null) return;
    const content = root.querySelector('.fb-datacard-content') || root;
    if (props.title != null) mark(content.querySelector('h4'), id, 'title');
    if (props.description != null) mark(content.querySelector('p'), id, 'description');
}

/**
 * Interactive Accordion (`renderAccordion`): each `.fb-accordion-item` has a
 * `.fb-accordion-trigger` (title text + a chevron `<span>▼</span>`) and a
 * `.fb-accordion-content`. The chevron is a separate span so the trigger's
 * textContent is `title + '▼'`; we strip the trailing '▼' at commit via the
 * trim marker rather than mutating the framework DOM.
 */
function stampAccordion(
    root: HTMLElement | null,
    id: string,
    props: Record<string, any>,
    titleProp: string,
    contentProp: string,
    trimChevron: boolean,
): void {
    if (!root) return;
    const items = Array.isArray(props.items) ? props.items : [];
    const itemEls = Array.from(root.querySelectorAll('.fb-accordion-item'));
    items.forEach((item: any, index: number) => {
        if (!item) return;
        const itemEl = itemEls[index];
        if (!itemEl) return;
        if (item.title != null) {
            const trigger = itemEl.querySelector('.fb-accordion-trigger') as HTMLElement | null;
            mark(trigger, id, `items.${index}.${titleProp}`, trimChevron ? '▼' : undefined);
        }
        if (item.content != null) {
            const content = itemEl.querySelector('.fb-accordion-content') as HTMLElement | null;
            mark(content, id, `items.${index}.${contentProp}`);
        }
    });
}

/**
 * FAQ (`renderFAQ`): each `[data-fb-accordion-item]` has a trigger whose
 * question lives in a `<span class="text-lg">` (chevron is an SVG, which
 * contributes no text) and an answer in `[data-fb-accordion-content] <p>`.
 */
function stampFaq(root: HTMLElement | null, id: string, props: Record<string, any>): void {
    if (!root) return;
    const items = Array.isArray(props.items) ? props.items : [];
    const itemEls = Array.from(root.querySelectorAll('[data-fb-accordion-item]'));
    items.forEach((item: any, index: number) => {
        if (!item) return;
        const itemEl = itemEls[index];
        if (!itemEl) return;
        if (item.question != null) {
            const trigger = itemEl.querySelector('[data-fb-accordion-trigger]') as HTMLElement | null;
            const qSpan = (trigger?.querySelector('span') || trigger) as HTMLElement | null;
            mark(qSpan, id, `items.${index}.question`);
        }
        if (item.answer != null) {
            const content = itemEl.querySelector('[data-fb-accordion-content]') as HTMLElement | null;
            const p = (content?.querySelector('p') || content) as HTMLElement | null;
            mark(p, id, `items.${index}.answer`);
        }
    });
}
