/**
 * THE headline builder gate (M2.3) — canvas↔preview parity. The draft layout
 * rendered through the SAME @frontbase/edge-core engine in the builder-preview
 * path == the edge-rendered (published) HTML, host label normalized. Reuses the
 * M1.1 byte-parity approach.
 */
import { createEngine, directProvider } from '@frontbase/edge-core';
import { localDraftProvider } from '../dist/draft/localDraftProvider.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const layout = {
    root: {},
    content: [
        { id: 'h', type: 'Heading', props: { content: 'Preview Parity', level: 'h1' } },
        { id: 't', type: 'Text', props: { content: 'same engine, builder + edge' } },
        { id: 'd', type: 'Text', props: { content: '{% for r in records %}{{ r.title }};{% endfor %}' } },
    ],
};
const rows = [{ id: '1', title: 'Draft doc' }];
const manifest = {
    version: 'parity',
    pages: { '/preview': { title: 'Preview', slug: 'preview', queryId: 'docs.list', layout } },
    queries: { 'docs.list': { queryId: 'docs.list', rows } },
};

// Edge path (published) — direct provider with the published rows
const edge = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
const edgeHtml = await (await edge.fetch(new Request('http://e.local/preview'))).text();

// Builder-preview path — the SAME engine, builder environment, draft provider
const builderManifest = { ...manifest, pages: { '/preview': { ...manifest.pages['/preview'] } } };
const builder = createEngine({ manifest: builderManifest, data: localDraftProvider({ 'docs.list': rows }), environment: 'builder' });
const previewHtml = await (await builder.fetch(new Request('http://b.local/preview'))).text();

check('preview renders the draft data', previewHtml.includes('Draft doc'));
check('edge renders the same data', edgeHtml.includes('Draft doc'));

// normalize the host label (the ONLY allowed difference)
const norm = (s) => s.replace(/chimera-rendered-by" content="(edge|builder|service-worker)"/g, 'chimera-rendered-by" content="X"');
check('preview HTML == published HTML (byte-identical, host label normalized)', norm(previewHtml) === norm(edgeHtml));

console.log(failures === 0 ? '\nparity: PASS ✅' : `\nparity: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
