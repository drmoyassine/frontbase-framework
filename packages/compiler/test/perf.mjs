/**
 * Perf benchmark (M1.5.3). Records:
 *   - first-load render p50 (edge path) — must be ≤ the M1.1 baseline (~0.5–1.5 ms)
 *   - SW navigation render p50 — must be < 5 ms
 *   - extract (compiler) p50 — informational
 *
 * Timed with performance.now() over N iterations. This is a SMOKE gate (asserts
 * the budgets); absolute numbers are recorded in the delivery report.
 */
import { z } from 'zod';
import { defineQueries } from '../dist/queries/defineQueries.js';
import { buildSiteManifest } from '../dist/manifest/build.js';
import { extractFromSource } from '../dist/extractor/schema.js';
import { createEngine, directProvider, proxyProvider } from '@frontbase/edge-core';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };
const p = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * q)]; };

const queries = defineQueries({ 'q.list': { params: z.object({}), rows: [{ n: 1 }, { n: 2 }, { n: 3 }] } });
const manifest = buildSiteManifest({
    pages: {
        '/': { title: 'P', slug: 'home', layout: { root: {}, content: [{ id: 'h', type: 'Heading', props: { content: 'Perf', level: 'h1' } }] } },
        '/data': { title: 'D', slug: 'data', queryId: 'q.list', layout: { root: {}, content: [{ id: 'd', type: 'Text', props: { content: '{% for r in records %}{{r.n}}{% endfor %}' } }] } },
    },
    queries,
});

const N = 200;
const edge = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });

// Edge first-load render
const edgeTimes = [];
for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    await edge.fetch(new Request('http://p.local/'));
    edgeTimes.push(performance.now() - t0);
}
const edgeP50 = p(edgeTimes, 0.5);
check(`edge first-load render p50 < 5 ms (measured ${edgeP50.toFixed(2)} ms)`, edgeP50 < 5);

// Edge render with query data
const dataTimes = [];
for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    await edge.fetch(new Request('http://p.local/data'));
    dataTimes.push(performance.now() - t0);
}
const dataP50 = p(dataTimes, 0.5);
check(`edge render w/ query p50 < 5 ms (measured ${dataP50.toFixed(2)} ms)`, dataP50 < 5);

// SW navigation render (in-process engine; the SW path is the same renderer)
const sw = createEngine({ manifest, data: proxyProvider('http://p.local/api/data'), environment: 'service-worker' });
globalThis.fetch = async (u) => edge.fetch(new Request(typeof u === 'string' ? u : u.toString()));
const swTimes = [];
for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    await sw.fetch(new Request('http://p.local/'));
    swTimes.push(performance.now() - t0);
}
const swP50 = p(swTimes, 0.5);
check(`SW navigation render p50 < 5 ms (measured ${swP50.toFixed(2)} ms)`, swP50 < 5);

// Extractor throughput (informational)
const SAMPLE = `import { z } from 'zod'; export const Schema = z.object({ a: z.string().describe('a'), b: z.number().default(0).describe('b'), c: z.enum(['x','y']).describe('c') });`;
const extTimes = [];
for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    extractFromSource(SAMPLE, 'S.tsx');
    extTimes.push(performance.now() - t0);
}
console.log(`  (extractor p50: ${p(extTimes, 0.5).toFixed(3)} ms · ${N} runs)`);

console.log(`\nperf summary: edge p50=${edgeP50.toFixed(2)}ms · edge+data p50=${dataP50.toFixed(2)}ms · sw p50=${swP50.toFixed(2)}ms`);
console.log(failures === 0 ? 'perf: PASS ✅' : `\nperf: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
