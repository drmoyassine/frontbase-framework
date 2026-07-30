/**
 * M1.5.1 — E2E edge render + service-worker contract.
 *
 * The edge worker is the single source of truth for published pages. The service
 * worker is DELIBERATELY non-intercepting: `attachServiceWorker` (edge-core/src/
 * sw.ts) registers only install/activate lifecycle hooks so an updated sw.js
 * neutralises any previously-installed intercepting version. Rendering navigations
 * locally in the SW was removed because it shadowed real DB-published pages with
 * frozen demo pages (the dynamic-CMS bug — a visitor saw a stale "A whole CMS…"
 * demo instead of their homepage until a hard-refresh bypassed the SW).
 *
 * This test therefore asserts the CURRENT contract, not the old SW-renders-locally
 * one:
 *   - the edge engine renders the page + its registered-query data, and
 *   - the SW fetch handler does NOT intercept a navigation (respondWith is never
 *     called → every navigation falls through to the edge), and
 *   - the SW lifecycle hooks fire (install → skipWaiting, activate → clients.claim).
 *
 * When the local-first/offline-rendering milestone re-imports createEngine into
 * the SW, a SW-render parity path returns here; until then there is no SW render
 * output to byte-compare, so the old edge==SW parity assertion is intentionally
 * gone.
 */
import { z } from 'zod';
import { defineQueries } from '../dist/queries/defineQueries.js';
import { buildSiteManifest } from '../dist/manifest/build.js';
import { createEngine, directProvider, attachServiceWorker } from '@frontbase/edge-core';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const queries = defineQueries({
    'products.list': {
        params: z.object({ limit: z.number().optional() }), scope: 'public', ttlSeconds: 60,
        rows: [{ name: 'Edge Widget', price: 19 }, { name: 'Chimera', price: 42 }],
    },
});
const manifest = buildSiteManifest({
    pages: {
        '/': { title: 'E2E', slug: 'home', layout: { root: {}, content: [{ id: 'h', type: 'Heading', props: { content: 'End-to-End Parity', level: 'h1' } }] } },
        '/products': {
            title: 'Products', slug: 'products', queryId: 'products.list',
            layout: { root: {}, content: [{ id: 'p', type: 'Text', props: { content: '{% for r in records %}{{ r.name }}=${{ r.price }};{% endfor %}' } }] },
        },
    },
    queries,
});

// --- edge path: the worker renders the page + registered-query data ---
const edge = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
const edgeHome = await (await edge.fetch(new Request('http://e.local/'))).text();
const edgeProducts = await (await edge.fetch(new Request('http://e.local/products'))).text();
check('edge: home renders', edgeHome.includes('End-to-End Parity'));
check('edge: products renders registered-query data', edgeProducts.includes('Edge Widget=$19;Chimera=$42;'));

// --- SW contract: a non-intercepting lifecycle-only worker ---
let skipWaitingCalled = false;
let claimCalled = false;
const swListeners = {};
const sw = {
    location: { origin: 'http://sw.local' },
    skipWaiting: () => { skipWaitingCalled = true; return Promise.resolve(); },
    clients: { claim: () => { claimCalled = true; return Promise.resolve(); } },
    addEventListener(type, fn) { (swListeners[type] ||= []).push(fn); },
};
attachServiceWorker(sw);

// Fire the lifecycle events the SW registers for.
(swListeners.install || []).forEach((fn) => fn({ waitUntil: () => {} }));
(swListeners.activate || []).forEach((fn) => fn({ waitUntil: () => {} }));

// Fire a navigation fetch event and confirm the SW does NOT intercept it — the
// core dynamic-CMS guarantee that every navigation reaches the edge worker.
let respondWithCalled = false;
const navRequest = new Request('http://sw.local/', { headers: {} });
Object.defineProperty(navRequest, 'mode', { value: 'navigate' });
const navEvent = { request: navRequest, respondWith: () => { respondWithCalled = true; }, waitUntil: () => {} };
(swListeners.fetch || []).forEach((fn) => fn(navEvent));

check('SW: install calls skipWaiting (immediate take-over)', skipWaitingCalled === true);
check('SW: activate claims clients', claimCalled === true);
check('SW: fetch handler does NOT intercept navigations (respondWith never called)', respondWithCalled === false);

console.log(failures === 0 ? '\ne2e-parity: PASS ✅' : `\ne2e-parity: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
