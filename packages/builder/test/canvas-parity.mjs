/**
 * Canvas parity gate (M3.0.2) — the layout a user builds on the CANVAS renders
 * byte-identically on the preview path (builder env) and the published edge path
 * (edge env), host label normalized. Proves the canvas model produces a layout
 * the engine renders identically whether previewing or publishing — the CF-8
 * extension of the existing parity guarantee to the real editing path.
 *
 * NOTE on the canvas model API: the canvas state IS a PageLayoutData
 * ({ content, root }). The model exports pure, immutable operators that each
 * return a NEW canvas: emptyCanvas(), addNode(canvas, parentId, component),
 * updateProps(canvas, id, props). There is no toLayout()/state wrapper — the
 * canvas returned by these helpers is itself the layout handed to the engine.
 */
import { emptyCanvas, addNode, updateProps } from '../dist/canvas/model.js';
import { createEngine, directProvider } from '@frontbase/edge-core';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// Build a layout on the canvas (as a user would: add nodes, edit props).
// addNode(canvas, parentId, component) — null parentId = root level.
let s = emptyCanvas();
s = addNode(s, null, { id: 'h1', type: 'Heading', props: { content: 'Built on the canvas', level: 'h1' } });
s = addNode(s, null, { id: 't1', type: 'Text', props: { content: 'Second node' } });
const headingId = s.content[0].id; // canvas.content IS the component list
s = updateProps(s, headingId, { content: 'Edited heading' });

// The canvas state is itself a PageLayoutData — hand it straight to the engine.
const layout = s;

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

// RULE 3 — the canvas operators are immutable: they return a fresh deep clone
// and never mutate the input canvas. Mutating a returned canvas cannot corrupt
// the prior state (the original toLayout-returns-a-copy guarantee, restated
// against the real model API).
const before = s;
const snapshot = JSON.stringify(before);
const mutated = updateProps(s, headingId, { content: 'THIS SHOULD NOT LEAK BACK' });
mutated.content[0].props.content = 'MUTATED IN PLACE';
check('canvas operators are immutable (input canvas untouched — RULE 3)', JSON.stringify(before) === snapshot);

console.log(failures === 0 ? '\ncanvas-parity: PASS ✅' : `\ncanvas-parity: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
