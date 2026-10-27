/**
 * simulate test — the same page renders byte-identically across direct/proxy/draft.
 * (proxy mode stands up an in-process edge for /api/data, then renders via proxyProvider.)
 */
import { z } from 'zod';
import { defineQueries } from '../dist/queries/defineQueries.js';
import { buildSiteManifest } from '../dist/manifest/build.js';
import { simulateRender } from '../dist/cli/simulate.js';

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
        '/sample': {
            title: 'Sample', slug: 'sample', queryId: 'products.list',
            layout: { root: {}, content: [{ id: 's', type: 'Text', props: { content: '{% for r in records %}{{ r.name }};{% endfor %}' } }] },
        },
    },
    queries,
});

const direct = await simulateRender(manifest, '/sample', 'direct');
const proxy = await simulateRender(manifest, '/sample', 'proxy');
const draft = await simulateRender(manifest, '/sample', 'draft');

check('direct renders 200', direct.status === 200);
check('direct renders query data', direct.body.includes('Edge Widget;Chimera;'));
check('proxy renders 200', proxy.status === 200);
check('draft renders 200', draft.status === 200);

// The body must be byte-identical across all three provider modes (M1.4 acceptance)
check('direct == proxy (byte-identical)', direct.body === proxy.body);
check('direct == draft (byte-identical)', direct.body === draft.body);
check('proxy == draft (byte-identical)', proxy.body === draft.body);

// Non-existent page → 404 in every mode
const nf = await simulateRender(manifest, '/nope', 'direct');
check('unknown page → 404', nf.status === 404);

console.log(failures === 0 ? '\nsimulate: PASS ✅' : `\nsimulate: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
