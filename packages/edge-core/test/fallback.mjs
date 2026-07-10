/**
 * SW-disabled / Safari-iOS fallback test (M3.0.7, CF-1). The Chimera is
 * fallback-by-design: when the service worker is absent (first load, iOS quirks,
 * SW-disabled browsers), the edge renders the page directly. This proves:
 *   - the edge path renders a full page WITHOUT any SW involvement;
 *   - the edge-rendered page is what a pre-SW / no-SW client receives;
 *   - the SW registration is progressive-enhancement only — its absence changes
 *     nothing about correctness, only about local-navigation latency.
 *
 * The complement (SW present → intercepts + renders locally) is proven in the
 * cf-worker smoke + e2e-parity; this asserts the FALLBACK leg specifically.
 */
import { createEngine, directProvider } from '../dist/index.js';

let failures = 0;
const check = async (label, fn) => {
    try { (await fn()) ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${e.message}`); }
};

const manifest = {
    version: 'fallback-1',
    queries: {},
    pages: {
        '/': { title: 'Home', slug: 'home', layout: { root: {}, content: [{ id: 'h', type: 'Heading', props: { content: 'Fallback Works', level: 'h1' } }] } },
    },
};

// The edge engine — this is exactly what a NO-SW client hits (no SW registered,
// no interception; the request goes straight to the edge worker).
const edge = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });

await check('SW-disabled client: edge renders the full page', async () => {
    const res = await edge.fetch(new Request('http://e.local/'));
    const html = await res.text();
    return res.status === 200 && html.includes('Fallback Works') && html.includes('<!DOCTYPE html>');
});

await check('edge page is self-contained HTML (no SW needed to display)', async () => {
    const html = await (await edge.fetch(new Request('http://e.local/'))).text();
    // A full document with the content inlined — a no-JS/no-SW browser shows it.
    return html.includes('<html') && html.includes('</html>') && html.includes('Fallback Works');
});

await check('edge path works with NO SW APIs present (Node has no navigator.serviceWorker)', async () => {
    // Node's runtime has no `navigator.serviceWorker` at all — so a green render
    // here IS proof the edge path never depends on a service worker existing.
    const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    const html = await (await edge.fetch(new Request('http://e.local/'))).text();
    return !hasSW && html.includes('Fallback Works');
});

await check('unknown route still 404s on the edge (no SW to mask it)', async () =>
    (await edge.fetch(new Request('http://e.local/nope'))).status === 404);

console.log(failures === 0 ? '\nfallback: PASS ✅' : `\nfallback: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
