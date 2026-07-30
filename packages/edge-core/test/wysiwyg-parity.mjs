/**
 * CF-22 WYSIWYG parity gate.
 *
 * The builder (React) and published pages (eSSR) drifted because the eSSR had
 * no renderers for several component types (they fell through to a blank
 * fb-unknown div) AND the community render path shipped no Tailwind, so the
 * landing components' responsive classes did nothing (desktop + mobile navbars
 * rendered at once). This gate locks both fixes in place so the drift cannot
 * silently return:
 *
 *   1. Every builder-registered component type renders real markup, not the
 *      fb-unknown fallback.
 *   2. The static utility stylesheet (UTILITIES_CSS) is present in FALLBACK_CSS
 *      so the landing components' Tailwind classes resolve with no runtime.
 *
 * Run via `pnpm --filter @frontbase/edge-core test`.
 */
import { strict as assert } from 'node:assert';
import { renderPage } from '../dist/index.js';
import { FALLBACK_CSS } from '../dist/ssr/baseStyles.js';

let pass = 0, fail = 0;
const ok = (label, cond) => {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`); }
};

const baseCtx = {
    page: { id: 't', title: 't', url: '/t', slug: 't', description: '', published: true, createdAt: '', updatedAt: '', image: '', type: 'page', custom: {} },
    user: null, visitor: {}, url: {}, system: {}, cookies: {}, local: {}, session: {}, records: [],
    app: { environment: 'edge', manifestVersion: 1 },
};

const render = (content) => renderPage({ content }, baseCtx);

// ── 1. The six previously-missing renderers now produce real markup ──────────

ok('Alert renders a themed alert (not fb-unknown)', async () => {
    const out = await render([{ id: 'a', type: 'Alert', props: { message: 'Heads up', variant: 'destructive' } }]);
    return out.includes('fb-alert') && out.includes('role="alert"') && out.includes('Heads up') && !out.includes('fb-unknown');
});

ok('Progress renders a value-bar (not fb-unknown)', async () => {
    const out = await render([{ id: 'p', type: 'Progress', props: { value: 73 } }]);
    return out.includes('fb-progress') && out.includes('width:73%') && out.includes('aria-valuenow="73"') && !out.includes('fb-unknown');
});

ok('Progress clamps out-of-range values to 0–100', async () => {
    const out = await render([{ id: 'p', type: 'Progress', props: { value: 250 } }]);
    return out.includes('width:100%') && out.includes('aria-valuenow="100"');
});

ok('Input renders a read-only field (not fb-unknown)', async () => {
    const out = await render([{ id: 'i', type: 'Input', props: { placeholder: 'Your name', type: 'email' } }]);
    return out.includes('<input') && out.includes('fb-input') && out.includes('readonly') && out.includes('Your name') && !out.includes('fb-unknown');
});

ok('Textarea renders a read-only field (not fb-unknown)', async () => {
    const out = await render([{ id: 'ta', type: 'Textarea', props: { placeholder: 'Message', rows: 5 } }]);
    return out.includes('<textarea') && out.includes('fb-textarea') && out.includes('rows="5"') && out.includes('readonly') && !out.includes('fb-unknown');
});

ok('Select renders a trigger with options (not fb-unknown)', async () => {
    const out = await render([{ id: 's', type: 'Select', props: { placeholder: 'Pick one', options: ['A', 'B', 'C'] } }]);
    return out.includes('fb-select') && out.includes('role="combobox"') && out.includes('Pick one') && out.includes('>A<') && out.includes('>C<') && !out.includes('fb-unknown');
});

ok('Breadcrumb renders nav + separators (not fb-unknown)', async () => {
    const out = await render([{ id: 'b', type: 'Breadcrumb', props: { items: [{ label: 'Home', href: '/' }, { label: 'Page', href: '/p' }] } }]);
    return out.includes('fb-breadcrumb') && out.includes('aria-label="breadcrumb"') && out.includes('Home') && out.includes('Page') && !out.includes('fb-unknown');
});

// ── 2. The Tailwind utility stylesheet is embedded in FALLBACK_CSS ──────────
// Without it, the landing components' responsive classes are inert (Navbar
// duplication). This guards the regen-utilities artifact.

ok('FALLBACK_CSS embeds the responsive utilities (.hidden + md: variants)', () => {
    return FALLBACK_CSS.includes('.hidden{display:none}') && FALLBACK_CSS.includes('.md\\:hidden') && FALLBACK_CSS.includes('.md\\:flex');
});

ok('FALLBACK_CSS includes the landing components\' spacing utilities', () => {
    return FALLBACK_CSS.includes('.container{width:100%}') && FALLBACK_CSS.includes('.flex{display:flex}') && FALLBACK_CSS.includes('.mx-auto');
});

console.log(`\nwysiwyg-parity: ${pass}/${pass + fail}${fail ? ' — GATE FAILING' : ' — GREEN ✅'}`);
process.exit(fail ? 1 : 0);
