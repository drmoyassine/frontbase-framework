/**
 * Canvas perf gate (M3.0.2, CF-8). The drag/drop → draft → preview-render loop
 * must be < 100 ms. Measured on the real editing path: mutate the model (add /
 * move / update) → toLayout → render through the engine (the preview path).
 * p95 over N iterations must stay under budget.
 */
import { emptyCanvas, addNode, moveNode, updateProps, toLayout } from '../dist/canvas/model.js';
import { createEngine, directProvider } from '@frontbase/edge-core';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };
const p = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * q)]; };

// Seed a realistic canvas (~10 nodes) — a page-sized layout.
let s = emptyCanvas();
for (let i = 0; i < 10; i++) s = addNode(s, i % 2 ? 'Text' : 'Heading', { content: `Node ${i}`, level: 'h2' }).state;

function renderPreview(layout) {
    const manifest = { version: 'canvas', queries: {}, pages: { '/preview': { title: 'P', slug: 'preview', layout } } };
    const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'builder' });
    return engine.fetch(new Request('http://b.local/preview'));
}

// THE loop: an edit → new draft layout → preview render.
const N = 100;
const times = [];
for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    // a representative edit (update props on a node — the common drag/panel action)
    s = updateProps(s, s.layout.content[i % s.layout.content.length].id, { content: `edited ${i}` });
    const layout = toLayout(s);
    await renderPreview(layout);
    times.push(performance.now() - t0);
}
const p50 = p(times, 0.5), p95 = p(times, 0.95);
check(`drag→draft→preview loop p50 < 100 ms (measured ${p50.toFixed(2)} ms)`, p50 < 100);
check(`drag→draft→preview loop p95 < 100 ms (measured ${p95.toFixed(2)} ms)`, p95 < 100);

// The edit actually took effect in the rendered preview.
const html = await (await renderPreview(toLayout(s))).text();
check('preview reflects the latest edit', html.includes('edited'));

// Reorder is also within budget (it's cheaper than a prop edit).
const t0 = performance.now();
const moved = moveNode(s, 0, 5);
await renderPreview(toLayout(moved));
check(`reorder→preview < 100 ms (${(performance.now() - t0).toFixed(2)} ms)`, (performance.now() - t0) < 100);

console.log(`\ncanvas loop: p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms`);
console.log(failures === 0 ? 'canvas-perf: PASS ✅' : `\ncanvas-perf: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
