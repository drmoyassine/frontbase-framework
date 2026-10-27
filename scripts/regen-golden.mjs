/**
 * Regenerate the golden-corpus page snapshots after an INTENTIONAL renderer change.
 *
 * Restores the tooling lost after 920289f (which set the precedent: corpus regen +
 * reviewed attr-level diff is the sanctioned repair when snapshots predate deliberate
 * renderer behavior). Renders every corpus layout through @frontbase/edge-core with
 * the manifest's pinned context — the exact recipe test/parity.mjs verifies — then
 * rewrites pages/<name>.html and the per-entry sha256/bytes.
 *
 * ALWAYS review `git diff golden-corpus/` afterwards: the delta must be exactly the
 * intended renderer change, never incidental text drift.
 */
import { renderPage } from '../packages/edge-core/dist/index.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', 'golden-corpus');
const manifestPath = join(corpus, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function pinnedContext(name, title, records) {
    const ts = manifest.context.pinnedTimestamp;
    return {
        page: {
            id: name, title, url: `/${name}`, slug: name,
            description: '', published: true, createdAt: ts, updatedAt: ts,
            image: '', type: 'page', custom: {},
        },
        user: null, visitor: {}, url: {}, system: {},
        cookies: {}, local: {}, session: {},
        records,
        app: manifest.context.app,
    };
}

for (const entry of manifest.entries) {
    const { title, records, layout } = JSON.parse(readFileSync(join(corpus, 'layouts', `${entry.name}.json`), 'utf8'));
    const html = await renderPage(layout, pinnedContext(entry.name, title, records));
    writeFileSync(join(corpus, 'pages', `${entry.name}.html`), html);
    entry.sha256 = createHash('sha256').update(html).digest('hex');
    entry.bytes = Buffer.byteLength(html);
    console.log(`regenerated ${entry.name} (${entry.bytes} B)`);
}

manifest.regenerations = [...(manifest.regenerations ?? []), { at: new Date().toISOString(), via: 'scripts/regen-golden.mjs' }];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`corpus regenerated: ${manifest.entries.length} snapshots`);
