/**
 * Engine router smoke — exercises every route class of createEngine() in-process,
 * plus environment gating (SW engines expose no proxy and no /sw.js).
 */
import { createEngine, directProvider } from '../dist/index.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const homee = JSON.parse(readFileSync(join(here, '..', '..', '..', 'golden-corpus', 'layouts', 'homee.json'), 'utf8'));

const manifest = {
    version: 'engine-smoke-1',
    queries: {
        'products.list': {
            queryId: 'products.list',
            params: z.object({ limit: z.number().optional() }),
            rows: [
                { name: 'Edge Widget', price: 19 },
                { name: 'Chimera Engine', price: 42 },
                { name: 'Filter Pack', price: 7 },
            ],
        },
    },
    pages: {
        '/': { title: homee.title, slug: 'homee', layout: homee.layout },
        '/products': {
            title: 'Products', slug: 'products', queryId: 'products.list',
            layout: {
                root: {},
                content: [{
                    id: 'p1', type: 'Text',
                    props: { content: '{% for r in records %}{{ r.name }};{% endfor %}' },
                }],
            },
        },
    },
};

const edge = createEngine({ manifest, data: directProvider(manifest), environment: 'edge', swBundle: '// sw' });
const sw = createEngine({ manifest, data: directProvider(manifest), environment: 'service-worker' });

const req = (app, path, init) => app.fetch(new Request('http://engine.local' + path, init));
let failures = 0;
const check = async (label, fn) => {
    try { (await fn()) ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${e.message}`); }
};

// eSSR catch-all
await check('GET / renders the real homepage (edge)', async () => {
    const r = await req(edge, '/');
    const html = await r.text();
    return r.status === 200 && r.headers.get('x-rendered-by') === 'edge'
        && html.includes('No-code Development for the Edge')
        && html.includes('chimera-rendered-by" content="edge"');
});
await check('GET /products renders registered-query records via Liquid', async () => {
    const r = await req(edge, '/products');
    return r.status === 200 && (await r.text()).includes('Edge Widget;Chimera Engine;Filter Pack;');
});
await check('GET /nope → 404', async () => (await req(edge, '/nope')).status === 404);

// Edge Data Proxy (A-16)
await check('POST /api/data/products.list → 200, 3 rows, proxy header', async () => {
    const r = await req(edge, '/api/data/products.list', { method: 'POST', body: '{}' });
    const rows = await r.json();
    return r.status === 200 && rows.length === 3 && r.headers.get('x-proxy') === 'edge-data-proxy';
});
await check('POST /api/data/evil.dropTables → 404 unknown_query', async () =>
    (await req(edge, '/api/data/evil.dropTables', { method: 'POST', body: '{}' })).status === 404);
await check('POST invalid params (Zod) → 400', async () =>
    (await req(edge, '/api/data/products.list', { method: 'POST', body: '{"limit":"x"}' })).status === 400);

// SW bundle route
await check('GET /sw.js served on edge', async () => {
    const r = await req(edge, '/sw.js');
    return r.status === 200 && r.headers.get('content-type') === 'text/javascript';
});

// Environment gating: the SW engine must not serve the proxy or /sw.js
await check('SW engine renders locally (rendered-by=service-worker)', async () => {
    const r = await req(sw, '/');
    return r.status === 200 && (await r.text()).includes('chimera-rendered-by" content="service-worker"');
});
await check('SW engine: /sw.js falls through (404 here → network in real SW)', async () =>
    (await req(sw, '/sw.js')).status === 404);
await check('SW engine: no data proxy exposed', async () =>
    (await req(sw, '/api/data/products.list', { method: 'POST', body: '{}' })).status === 404);

console.log(failures === 0 ? '\nengine smoke: PASS ✅' : `\nengine smoke: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
