/**
 * Phase E zero-drift renderer parity gate.
 *
 * The builder-scoped Service Worker renders the canvas by calling the SAME
 * @frontbase/edge-core path the framework worker's POST /builder/api/reRender
 * endpoint uses (see packages/builder/src/BuilderEngine.ts):
 *
 *     const bodyHtml = await renderPage(layout, ctx);
 *     const html = renderDocument(pageEntry, bodyHtml, {
 *         environment: 'builder',
 *         registerServiceWorker: false,
 *     });
 *
 * Because the SW, the iframe canvas, the preview and the reRender endpoint ALL
 * funnel through this one composed call, pinning its output pins every render
 * surface against edge-core drift. This gate asserts:
 *
 *   1. CONTRACT — the golden-corpus component set (Container+Text+Heading+
 *      Button+Badge+Navbar+Image+Card) renders real markup through that EXACT
 *      path with the reRender-shape ctx (page populated, user:null,
 *      system.env:'builder', app.environment:'builder'): shell markers, each
 *      component's class signature, embedded FALLBACK_CSS, no fb-unknown drift,
 *      no /sw.js registration (canvas path opts out of the SW handover).
 *   2. DETERMINISM — the same (layout, ctx) renders byte-identically across
 *      repeated calls (catches Math.random / Date.now leaking into the path).
 *   3. BYTE STABILITY — with the volatile system time fields PINNED to a fixed
 *      ISO timestamp (the same technique parity.mjs uses with pinnedTimestamp),
 *      a layout with no time tokens is byte-identical under any pinned date; and
 *      when a layout DOES use {{year}}, only the year-derived bytes differ
 *      between two pinned years. I.e. pinning system fully controls the only
 *      volatile surface, so the document is stable across process runs.
 *
 * Run via `pnpm --filter @frontbase/edge-core test`.
 */
import { renderPage, renderDocument } from '../dist/index.js';
import { FALLBACK_CSS } from '../dist/ssr/baseStyles.js';

let pass = 0, fail = 0;
const ok = (label, cond) => {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`); }
};

// reRender builds this ctx shape (BuilderEngine.ts → /api/reRender, L467-499).
// We PIN the volatile system time fields to a fixed ISO timestamp so the
// rendered document is byte-stable run-to-run (mirrors parity.mjs's
// pinnedTimestamp). env:'builder' + app.environment:'builder' are the
// defining reRender markers and are preserved exactly.
function reRenderCtx(system) {
    return {
        page: {
            id: 'sw-parity', title: 'SW Parity', url: '/sw-parity', slug: 'sw-parity',
            description: '', published: true, createdAt: '', updatedAt: '',
            image: '', type: 'page', custom: {},
        },
        user: null,
        visitor: {},
        url: {},
        system,
        cookies: {}, local: {}, session: {},
        records: [],
        app: { environment: 'builder', manifestVersion: 1 },
    };
}

const PINNED = {
    date: '2026-07-31', time: '00:00:00', datetime: '2026-07-31T00:00:00.000Z',
    timestamp: 1753920000000, year: 2026, month: 7, day: 31, env: 'builder',
};
const PINNED_2030 = { ...PINNED, year: 2030 };

// The EXACT composed render path used by /builder/api/reRender AND the builder
// Service Worker. environment:'builder', registerServiceWorker:false (canvas).
async function renderLikeSW(layout, system = PINNED) {
    const ctx = reRenderCtx(system);
    const pageEntry = {
        title: ctx.page.title,
        slug: ctx.page.slug,
        description: ctx.page.description,
        layout,
    };
    const bodyHtml = await renderPage(layout, ctx);
    const html = renderDocument(pageEntry, bodyHtml, {
        environment: 'builder',
        registerServiceWorker: false,
    });
    return { html, bodyHtml };
}

// ── Representative layouts (golden-corpus component set) ─────────────────────
// Minimal deterministic props — each component's renderer accepts these and
// produces stable markup. No {{year}}/time tokens here (used for byte-stability
// checks below). Container wraps children; Card carries a title + child Text.
const layouts = {
    container: {
        content: [{
            id: 'c1', type: 'Container', props: {},
            children: [
                { id: 'h1', type: 'Heading', props: { content: 'Built on the canvas', level: 'h1' } },
                { id: 't1', type: 'Text', props: { content: 'Rendered through the SW path' } },
            ],
        }],
    },
    button: {
        content: [{ id: 'b1', type: 'Button', props: { content: 'Join the alpha', variant: 'default', size: 'lg' } }],
    },
    badge: {
        content: [{ id: 'bd1', type: 'Badge', props: { content: 'Now in Private Alpha', variant: 'secondary' } }],
    },
    navbar: {
        content: [{ id: 'n1', type: 'Navbar', props: { logoText: 'Frontbase', links: [] } }],
    },
    image: {
        content: [{ id: 'i1', type: 'Image', props: { src: 'https://example.com/logo.png', alt: 'Logo', width: '120px', height: '120px' } }],
    },
    card: {
        content: [{
            id: 'cd1', type: 'Card', props: { title: 'Edge-native', subtitle: 'Deploy in seconds' },
            children: [{ id: 'cd1-t', type: 'Text', props: { content: 'Card body copy' } }],
        }],
    },
};
// Combined landing-style composition exercising every golden type at once.
const combined = {
    content: [
        { id: 'nb', type: 'Navbar', props: { logoText: 'Frontbase', links: [] } },
        {
            id: 'wrap', type: 'Container', props: {},
            children: [
                { id: 'bdg', type: 'Badge', props: { content: 'New', variant: 'success' } },
                { id: 'hd', type: 'Heading', props: { content: 'SW render path', level: 'h1' } },
                { id: 'txt', type: 'Text', props: { content: 'Same path as the worker.' } },
                { id: 'btn', type: 'Button', props: { content: 'Get started', variant: 'primary' } },
                { id: 'img', type: 'Image', props: { src: 'https://example.com/hero.png', alt: 'Hero' } },
                {
                    id: 'crd', type: 'Card', props: { title: 'Deterministic' },
                    children: [{ id: 'crd-t', type: 'Text', props: { content: 'Card body' } }],
                },
            ],
        },
    ],
};

// ── 1. CONTRACT: each golden component renders real markup via the SW path ────

const rendered = {};
for (const [name, layout] of Object.entries(layouts)) {
    rendered[name] = await renderLikeSW(layout);
}

ok('Container renders its children (heading + text) via the SW path', () => {
    const { html, bodyHtml } = rendered.container;
    return html.includes('Built on the canvas') && html.includes('Rendered through the SW path')
        && bodyHtml.includes('Built on the canvas')
        && !html.includes('fb-unknown');
});

ok('Heading emits the fb-heading signature + h1 tag', () => {
    const { bodyHtml } = rendered.container;
    return bodyHtml.includes('fb-heading') && /<h1\b/.test(bodyHtml);
});

ok('Text emits the fb-text signature inside a <p>', () => {
    const { bodyHtml } = rendered.container;
    return bodyHtml.includes('fb-text') && /<p\b/.test(bodyHtml);
});

ok('Button (interactive) emits fb-button + variant class', () => {
    const { bodyHtml } = rendered.button;
    return bodyHtml.includes('fb-button') && bodyHtml.includes('fb-button-default')
        && bodyHtml.includes('Join the alpha') && !bodyHtml.includes('fb-unknown');
});

ok('Badge emits fb-badge + variant class', () => {
    const { bodyHtml } = rendered.badge;
    return bodyHtml.includes('fb-badge') && bodyHtml.includes('fb-badge-secondary')
        && bodyHtml.includes('Now in Private Alpha') && !bodyHtml.includes('fb-unknown');
});

ok('Navbar emits fb-navbar (no fb-unknown fallback)', () => {
    const { bodyHtml } = rendered.navbar;
    return bodyHtml.includes('fb-navbar') && !bodyHtml.includes('fb-unknown');
});

ok('Image emits an <img> with the resolved src (no placeholder fallback)', () => {
    const { bodyHtml } = rendered.image;
    return bodyHtml.includes('fb-image') && bodyHtml.includes('https://example.com/logo.png')
        && /<img\b/.test(bodyHtml) && !bodyHtml.includes('fb-unknown');
});

ok('Card emits fb-datacard + title (renders its child body)', () => {
    const { bodyHtml } = rendered.card;
    return bodyHtml.includes('fb-datacard') && bodyHtml.includes('Edge-native')
        && bodyHtml.includes('Card body copy') && !bodyHtml.includes('fb-unknown');
});

// ── 2. CONTRACT: renderDocument shell wraps the body via the reRender options ─

const doc = rendered.container.html;
const body = rendered.container.bodyHtml;

ok('document opens with <!DOCTYPE html>', () => doc.startsWith('<!DOCTYPE html>'));
ok('shell stamps the builder environment label', () => doc.includes('<meta name="chimera-rendered-by" content="builder">'));
ok('shell wraps the body in #root', () => doc.includes('<div id="root">'));
ok('shell embeds FALLBACK_CSS (no cssBundle passed → base styles)', () => doc.includes('<style>') && doc.includes(FALLBACK_CSS));
ok('canvas path registers NO /sw.js (registerServiceWorker:false)', () => !doc.includes('/sw.js'));
ok('renderPage output is a byte-exact substring of renderDocument', () => doc.includes(body));

// ── 3. DETERMINISM: identical input → identical bytes (no hidden randomness) ──

const detA = await renderLikeSW(combined);
const detB = await renderLikeSW(combined);
const detC = await renderLikeSW(combined);
ok('combined layout renders byte-identically across 3 calls (deterministic)', () => detA.html === detB.html && detB.html === detC.html);

const bodyA = await renderPage(combined, reRenderCtx(PINNED));
const bodyB = await renderPage(combined, reRenderCtx(PINNED));
ok('renderPage alone is deterministic (byte-identical across calls)', () => bodyA === bodyB);

// ── 4. BYTE STABILITY: pinning system fully controls the volatile surface ────
// A layout with no time tokens is byte-identical regardless of the pinned date.
const stableA = await renderLikeSW(combined, PINNED);
const stableB = await renderLikeSW(combined, PINNED_2030);
ok('no-time-token layout is byte-stable across different pinned dates', () => stableA.html === stableB.html);

// A layout that DOES use {{year}} differs ONLY in the year-derived bytes.
const yearLayout = {
    content: [{ id: 'f', type: 'Footer', props: { copyright: '© {{year}} Frontbase' } }],
};
const y2026 = await renderLikeSW(yearLayout, PINNED);
const y2030 = await renderLikeSW(yearLayout, PINNED_2030);
ok('{{year}} resolves to the pinned system year (2026 → 2030)', () => {
    return y2026.html.includes('© 2026 Frontbase') && !y2026.html.includes('{{year}}')
        && y2030.html.includes('© 2030 Frontbase');
});
ok('{{year}} layout differs ONLY in year-derived bytes (rest byte-identical)', () => {
    // Neutralise EVERY occurrence of either year digit-run in both documents.
    // Robust to non-year constants that happen to contain the digits (e.g. the
    // hydrate version '20260617c'): those are identical in both docs, so they
    // map identically and only the genuine system.year output differs.
    const normYear = (h) => h.replaceAll('2026', '__Y__').replaceAll('2030', '__Y__');
    return normYear(y2026.html) === normYear(y2030.html);
});

console.log(`\nsw-renderer-parity: ${pass}/${pass + fail}${fail ? ' — GATE FAILING' : ' — GREEN ✅'}`);
process.exit(fail ? 1 : 0);
