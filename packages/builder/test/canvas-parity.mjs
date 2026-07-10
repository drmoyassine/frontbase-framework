/**
 * Canvas parity gate (M3.0.2) — the layout a user builds on the CANVAS renders
 * byte-identically on the preview path (builder env) and the published edge path
 * (edge env), host label normalized. Proves the canvas model produces a layout
 * the engine renders identically whether previewing or publishing — the CF-8
 * extension of the existing parity guarantee to the real editing path.
 */
import { emptyCanvas, addNode, updateProps, toLayout } from '../dist/canvas/model.js';
import { createEngine, directProvider } from '@frontbase/edge-core';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// Build a layout on the canvas (as a user would: add nodes, edit props).
let s = emptyCanvas();
s = addNode(s, 'Heading', { content: 'Built on the canvas', level: 'h1' }).state;
s = addNode(s, 'Text', { content: 'Second node' }).state;
const headingId = s.layout.content[0].id;
s = updateProps(s, headingId, { content: 'Edited heading' });
const layout = toLayout(s);

function render(env) {
    const manifest = { version: 'parity', queries: {}, pages: { '/p': { title: 'P', slug: 'p', layout } } };
    const engine = createEngine({ manifest, data: directProvider(manifest), environment: env });
    return engine.fetch(new Request('http://x.local/p'));
}

const preview = await (await render('builder')).text();
const published = await (await render('edge')).text();

check('preview renders the canvas layout', preview.includes('Edited heading') && preview.includes('Second node'));
check('published renders the canvas layout', published.includes('Edited heading') && published.includes('Second node'));

const norm = (h) => h.replace(/chimera-rendered-by" content="(edge|builder|service-worker)"/g, 'chimera-rendered-by" content="X"');
check('canvas preview HTML == published HTML (byte-identical, host label normalized)', norm(preview) === norm(published));

// toLayout returns a copy — mutating the returned layout doesn't corrupt the model (RULE 3).
layout.content[0].props.content = 'MUTATED';
const again = toLayout(s);
check('toLayout returns a copy (RULE 3)', again.content[0].props.content === 'Edited heading');

console.log(failures === 0 ? '\ncanvas-parity: PASS ✅' : `\ncanvas-parity: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
