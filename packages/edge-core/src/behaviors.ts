/**
 * Frontbase Behaviors Runtime — the ONE piece of client JS the Chimera ships
 * on published pages (~10 KB). No React, no hydration, no virtual DOM.
 *
 * Reads the `data-*` attributes the SSR components emit (interactive.ts) and
 * wires them to vanilla handlers. Navigation is anchor-based by default
 * (Phase 1 input #3: `<a href>` → the service worker intercepts); this runtime
 * only steps in for button-styled navigations and non-nav interactivity.
 *
 * Scopes mirror the ported store.ts: `page` (in-memory) / `session`
 * (localStorage) / `cookie` (document.cookie). `local` is an alias for `page`.
 *
 * The compiler (M1.4) inlines the minified bundle into the document shell.
 */

export type VarScope = 'page' | 'local' | 'session' | 'cookie';

interface BehaviorsOptions {
    /** Edge Data Proxy base URL for workflow execution. Default '/api/data'. */
    proxyBaseUrl?: string;
    /** Host-provided auth toggle (sign-in/out UI). Default: no-op. */
    onAuthToggle?: () => void;
    /** Host-provided toast renderer. Default: console. */
    toast?: (message: string) => void;
}

const pageVars = new Map<string, unknown>();

function getVar(scope: string, name: string): unknown {
    switch (scope) {
        case 'session': {
            const raw = localStorage.getItem('fb:session:' + name);
            return raw == null ? undefined : safeJsonParse(raw);
        }
        case 'cookie': return cookieMap()[name];
        case 'page':
        case 'local':
        default: return pageVars.get(name);
    }
}

function setVar(scope: string, name: string, value: unknown): void {
    switch (scope) {
        case 'session': localStorage.setItem('fb:session:' + name, JSON.stringify(value)); break;
        case 'cookie': document.cookie = `${name}=${encodeURIComponent(String(value))};path=/;max-age=31536000;SameSite=Lax`; break;
        case 'page':
        case 'local':
        default: pageVars.set(name, value);
    }
    reevaluateShowIf();
}

function cookieMap(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of document.cookie.split(';')) {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1));
    }
    return out;
}

function safeJsonParse(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }

// ── handlers ──────────────────────────────────────────────────────────────

function navigate(to: string, newTab?: boolean): void {
    if (!to) return;
    if (newTab) window.open(to, '_blank', 'noopener');
    else window.location.href = to; // an <a href> normally handles this; runtime covers button-styled nav
}

function scrollToSection(target: string): void {
    if (!target) return;
    const el = target.startsWith('#') ? document.querySelector(target) : document.getElementById(target);
    el?.scrollIntoView({ behavior: 'smooth' });
}

function toggle(target: Element): void {
    // Tabs
    const tabId = target.getAttribute('data-tab-id');
    if (tabId) {
        const group = target.closest('[data-fb-tabs]') ?? document;
        group.querySelectorAll('[data-tab-id]').forEach((t) => t.setAttribute('aria-selected', String(t === target)));
        document.querySelectorAll(`[data-tab-panel="${tabId}"]`).forEach((p) => ((p as HTMLElement).hidden = false));
        return;
    }
    // Accordion
    const accId = target.getAttribute('data-accordion-id');
    if (accId) {
        const allowMultiple = target.getAttribute('data-allow-multiple') === 'true';
        if (!allowMultiple) {
            document.querySelectorAll(`[data-accordion-id]`).forEach((a) => { if (a !== target) a.setAttribute('aria-expanded', 'false'); });
        }
        const open = target.getAttribute('aria-expanded') === 'true';
        target.setAttribute('aria-expanded', String(!open));
        return;
    }
}

// `data-show-if="varName:value"` — visible only when the named var equals value
function reevaluateShowIf(): void {
    document.querySelectorAll<HTMLElement>('[data-show-if]').forEach((el) => {
        const [name, value] = el.dataset.showIf!.split(':');
        el.hidden = String(getVar('page', name)) !== value;
    });
}

async function runWorkflow(el: Element, opts: BehaviorsOptions): Promise<void> {
    const workflowId = el.getAttribute('data-action-run-workflow');
    if (!workflowId) return;
    try {
        const res = await fetch(`${opts.proxyBaseUrl ?? '/api/data'}/${encodeURIComponent(workflowId)}`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        });
        const result = res.ok ? await res.json() : null;
        handleWorkflowSuccess(el, result, opts);
    } catch (e) {
        console.error('[frontbase:behaviors] workflow failed', workflowId, e);
    }
}

function handleWorkflowSuccess(el: Element, result: unknown, opts: BehaviorsOptions): void {
    const type = el.getAttribute('data-action-onsuccess');
    if (!type) return;
    if (type === 'toast') {
        (opts.toast ?? ((m: string) => console.log('[toast]', m)))(el.getAttribute('data-action-onsuccess-toast-message') ?? '');
    } else if (type === 'redirect') {
        navigate(el.getAttribute('data-action-onsuccess-redirect-url') ?? '');
    } else if (type === 'setVariable') {
        const path = el.getAttribute('data-action-onsuccess-result-path') ?? '';
        const value = path ? getPath(result, path) : result;
        setVar(
            el.getAttribute('data-action-onsuccess-var-scope') ?? 'local',
            el.getAttribute('data-action-onsuccess-var-name') ?? '',
            value,
        );
    }
}

function getPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

// ── dispatch ──────────────────────────────────────────────────────────────

function dispatch(el: Element, opts: BehaviorsOptions): void {
    const navTo = el.getAttribute('data-navigate-to');
    if (navTo) { navigate(navTo, el.getAttribute('data-navigate-new-tab') === 'true'); return; }

    const scrollTo = el.getAttribute('data-scroll-to');
    if (scrollTo) { scrollToSection(scrollTo); return; }

    if (el.hasAttribute('data-tab-id') || el.hasAttribute('data-accordion-id')) { toggle(el); return; }

    if (el.hasAttribute('data-action-set-var-name')) {
        setVar(
            el.getAttribute('data-action-set-var-scope') ?? 'local',
            el.getAttribute('data-action-set-var-name')!,
            el.getAttribute('data-action-set-var-value'),
        );
        return;
    }

    if (el.hasAttribute('data-action-run-workflow')) { void runWorkflow(el, opts); return; }
}

/**
 * Attach the behaviors runtime to the document. Idempotent. The compiler
 * inlines a call to this at the end of the body.
 */
export function startBehaviors(opts: BehaviorsOptions = {}): void {
    if (typeof document === 'undefined') return;
    if ((document as Document & { __frontbaseBehaviors?: boolean }).__frontbaseBehaviors) return;
    (document as Document & { __frontbaseBehaviors?: boolean }).__frontbaseBehaviors = true;

    reevaluateShowIf();

    document.addEventListener('click', (e) => {
        const target = (e.target as Element | null)?.closest<HTMLElement>(
            '[data-navigate-to],[data-scroll-to],[data-tab-id],[data-accordion-id],[data-action-set-var-name],[data-action-run-workflow],[data-fb-toggle-auth]',
        );
        if (!target) return;
        if (target.hasAttribute('data-fb-toggle-auth')) { e.preventDefault(); (opts.onAuthToggle ?? (() => {}))(); return; }
        if (!target.closest('a[href]')) e.preventDefault(); // don't fight a real <a href>
        dispatch(target, opts);
    });

    // SPA-style navigation via the service worker: browsers without the SW
    // installed still get full-page loads, so no extra wiring is required.
}
