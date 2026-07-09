/**
 * M1.5.1 — E2E edge + SW byte-parity. Renders the same compiled project page:
 *   - edge path: createEngine(environment:'edge') → HTTP GET
 *   - SW path:   createEngine(environment:'service-worker') driven through a
 *                jsdom-hosted ServiceWorkerGlobalScope with attachServiceWorker,
 *                the navigation fetch event responded to by the engine.
 * Both paths render the SAME layout via the SAME engine. The only difference is
 * the `chimera-rendered-by` host label, which is normalized before comparison
 * (it identifies the host, not the page content) — exactly as the Phase 0 spike
 * parity test did ("same-env-label").
 *
 * The compiler assembles a manifest with a registered query, so the records
 * (data) path is exercised on both paths too.
 */
import { z } from 'zod';
import { JSDOM } from 'jsdom';
import { defineQueries } from '../dist/queries/defineQueries.js';
import { buildSiteManifest } from '../dist/manifest/build.js';
import { createEngine, directProvider, proxyProvider, attachServiceWorker } from '@frontbase/edge-core';

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

// --- edge path ---
const edge = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
const edgeHome = await (await edge.fetch(new Request('http://e.local/'))).text();
const edgeProducts = await (await edge.fetch(new Request('http://e.local/products'))).text();
check('edge: home renders', edgeHome.includes('End-to-End Parity'));
check('edge: products renders registered-query data', edgeProducts.includes('Edge Widget=$19;Chimera=$42;'));

// --- SW path (jsdom-hosted SW global + attachServiceWorker) ---
const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://sw.local/' });
const { window } = dom;

// A minimal ServiceWorkerGlobalScope backed by the engine, exercising attachServiceWorker.
function makeSwGlobal(engine, manifest) {
    const listeners = {};
    const sw = {
        location: { origin: 'http://sw.local' },
        skipWaiting: () => Promise.resolve(),
        clients: { claim: () => Promise.resolve() },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        __fire(type, event) { (listeners[type] || []).forEach((fn) => fn(event)); },
    };
    attachServiceWorker(sw, engine, manifest);
    return sw;
}

const swEngine = createEngine({ manifest, data: proxyProvider('http://sw.local/api/data'), environment: 'service-worker' });
// proxyProvider needs fetch to reach the edge engine; route in-process.
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.startsWith('http://sw.local/api/data')) return edge.fetch(new Request(u, init));
    return origFetch(url, init);
};
const sw = makeSwGlobal(swEngine, manifest);

async function renderViaSw(path) {
    const request = new Request('http://sw.local' + path, { headers: {} });
    // simulate Request.mode = 'navigate' (the SW fetch handler checks this)
    Object.defineProperty(request, 'mode', { value: 'navigate' });
    let response;
    const event = {
        request,
        respondWith(r) { response = r; },
        waitUntil() {},
    };
    sw.__fire('fetch', event);
    const res = await response;
    return res.text();
}
const swHome = await renderViaSw('/');
const swProducts = await renderViaSw('/products');
globalThis.fetch = origFetch;

check('SW: home renders', swHome.includes('End-to-End Parity'));
check('SW: products renders registered-query data', swProducts.includes('Edge Widget=$19;Chimera=$42;'));

// --- byte-parity (normalize the host label, which is the only allowed diff) ---
const norm = (s) => s.replace(/chimera-rendered-by" content="(edge|service-worker)"/g, 'chimera-rendered-by" content="X"')
    .replace(/x-rendered-by:\s*(edge|service-worker)/g, 'x-rendered-by: X');
check('home: edge == SW (byte-identical, host label normalized)', norm(edgeHome) === norm(swHome));
check('products: edge == SW (byte-identical, host label normalized)', norm(edgeProducts) === norm(swProducts));

console.log(failures === 0 ? '\ne2e-parity: PASS ✅' : `\ne2e-parity: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
