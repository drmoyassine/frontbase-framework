/**
 * Legacy layout migration test (M3.0.3, CF-9). Proves:
 *   - version detection (builder export v1, bare tree v1, current v2);
 *   - a v1 builder export migrates to the current format;
 *   - migration is idempotent (current → current byte-identical);
 *   - a migrated layout renders byte-identically to the golden-corpus snapshot
 *     (the layout the corpus was generated from IS the migrated form).
 */
import { migrateLayout, migrateAndStamp, detectLayoutVersion, CURRENT_LAYOUT_VERSION } from '../dist/manifest/migrate.js';
import { createEngine, directProvider } from '@frontbase/edge-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', '..', '..', 'golden-corpus');

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// 1. Version detection
const currentLayout = JSON.parse(readFileSync(join(corpus, 'layouts', 'homee.json'), 'utf8')).layout;
check('detects current (v2) bare {root,content}', detectLayoutVersion(currentLayout) === 2);
check('detects v1 builder export {version,page:{layoutData}}', detectLayoutVersion({ version: 1, page: { layoutData: { root: {}, content: [] } } }) === 1);
check('detects v1 bare early tree {content} (no root)', detectLayoutVersion({ content: [] }) === 1);
check('unknown shape → 0', detectLayoutVersion({ foo: 1 }) === 0);

// 2. Idempotency — current format migrates to itself, byte-identical
const migratedCurrent = migrateLayout(currentLayout);
check('current layout migrates to itself (byte-identical)', JSON.stringify(migratedCurrent) === JSON.stringify({ root: currentLayout.root ?? {}, content: currentLayout.content }));

// 3. A v1 builder export migrates to the SAME LayoutData as the current corpus form
const legacyExport = { version: 1, page: { title: 'Homee', slug: 'homee', layoutData: currentLayout } };
const migratedLegacy = migrateLayout(legacyExport);
check('v1 builder export migrates to the current LayoutData', JSON.stringify(migratedLegacy) === JSON.stringify(migrateLayout(currentLayout)));

// 4. migrateAndStamp adds the current version flag
const stamped = migrateAndStamp(legacyExport);
check('migrateAndStamp stamps CURRENT_LAYOUT_VERSION', stamped.layoutVersion === CURRENT_LAYOUT_VERSION);

// 5. THE gate: a migrated legacy layout renders BYTE-IDENTICALLY to the golden
//    corpus snapshot. The corpus HTML was generated from `homee`'s layout; a v1
//    export of the same layout, once migrated, must render the same body.
const manifestEntry = JSON.parse(readFileSync(join(corpus, 'layouts', 'homee.json'), 'utf8'));
const expectedHtml = readFileSync(join(corpus, 'pages', 'homee.html'), 'utf8');

const manifest = {
    version: 'migrate-1',
    queries: {},
    pages: { '/homee': { title: manifestEntry.title, slug: 'homee', layout: migratedLegacy } },
};
const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
const res = await engine.fetch(new Request('http://e.local/homee'));
const html = await res.text();
// The corpus snapshot is renderPage BODY; the engine wraps it in a document.
// Assert the corpus body appears verbatim inside the migrated render.
check('migrated legacy layout renders the corpus body byte-identically', html.includes(expectedHtml.trim()));

console.log(failures === 0 ? '\nmigrate: PASS ✅' : `\nmigrate: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
