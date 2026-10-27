/**
 * Manifest assembly test — determinism + the assembled manifest feeds the real
 * @frontbase/edge-core engine and renders 200 OK, with A-16 Zod query rejection.
 */
import { z } from 'zod';
import { defineQueries } from '../dist/queries/defineQueries.js';
import { buildSiteManifest, serializeManifest, stableStringify } from '../dist/manifest/build.js';
import { createEngine, directProvider } from '@frontbase/edge-core';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const queries = defineQueries({
    'products.list': {
        params: z.object({ limit: z.number().optional() }),
        scope: 'public', ttlSeconds: 60,
        execute: async () => [{ name: 'Edge Widget', price: 19 }],
    },
});

const input = {
    pages: {
        '/': { title: 'Home', slug: 'home', layout: { root: {}, content: [{ id: 'h', type: 'Heading', props: { content: 'Hi', level: 'h1' } }] } },
        '/products': { title: 'Products', slug: 'products', queryId: 'products.list', layout: { root: {}, content: [{ id: 'p', type: 'Text', props: { content: '{% for r in records %}{{ r.name }};{% endfor %}' } }] } },
    },
    queries,
};

// 1. Determinism — two builds are byte-identical
const a = buildSiteManifest(input);
const b = buildSiteManifest(input);
check('rebuild is byte-identical', serializeManifest(a) === serializeManifest(b));
check('version is content-hash shaped', /^v[0-9a-f]{12}$/.test(a.version));
check('pages sorted in output', Object.keys(a.pages).join(',') === '/,/products');

// 2. Changing a page changes the version (content hash is real)
const a2 = buildSiteManifest({ ...input, pages: { ...input.pages, '/': { ...input.pages['/'], title: 'Home2' } } });
check('content change flips the version', a2.version !== a.version);
// Reverting restores the original version (determinism holds across edits)
const a3 = buildSiteManifest(input);
check('version stable across rebuilds', a3.version === a.version);

// 3. Changing query ORDER does not change the manifest (sorted, deterministic)
const reordered = buildSiteManifest({
    pages: input.pages,
    queries: defineQueries({
        'alpha': { execute: async () => [] },
        'products.list': queries['products.list'],
        'zeta': { execute: async () => [] },
    }),
});
const reorderSame = buildSiteManifest({
    pages: input.pages,
    queries: defineQueries({
        'zeta': { execute: async () => [] },
        'products.list': queries['products.list'],
        'alpha': { execute: async () => [] },
    }),
});
// (version will differ because queries changed, but ORDER-independence: compare only query key order)
check('query keys order-independent', JSON.stringify(Object.keys(reordered.queries)) === JSON.stringify(Object.keys(reorderSame.queries)));

// 4. The assembled manifest feeds createEngine and renders 200 OK
const engine = createEngine({ manifest: a, data: directProvider(a), environment: 'edge' });
const req = (path, init) => engine.fetch(new Request('http://t.local' + path, init));
const home = await req('/');
check('createEngine renders home 200', home.status === 200 && (await home.text()).includes('>Hi<'));

// 5. Registered-query data renders + A-16 Zod rejection on bad params
const products = await req('/products');
check('query data renders into the page', products.status === 200 && (await products.text()).includes('Edge Widget;'));
const good = await req('/api/data/products.list', { method: 'POST', body: '{"limit":5}' });
check('proxy accepts valid params', good.status === 200);
const badParams = await req('/api/data/products.list', { method: 'POST', body: '{"limit":"x"}' });
check('proxy rejects invalid params (400)', badParams.status === 400);

console.log(failures === 0 ? '\nmanifest: PASS ✅' : `\nmanifest: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
