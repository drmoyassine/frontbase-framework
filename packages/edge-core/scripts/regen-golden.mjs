/**
 * Regenerate the golden-corpus snapshots (pages/*.html + manifest SHAs) from the
 * current @frontbase/edge-core renderPage output.
 *
 * The corpus is deterministic body-HTML; run this ONLY after an INTENDED renderer
 * change (e.g. the lucide icon-resolution fix), then commit the updated snapshots.
 * Mirrors test/parity.mjs context exactly so the gate stays byte-identical.
 *
 * Run: node scripts/regen-golden.mjs   (after building edge-core)
 */
import { renderPage } from '../dist/index.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', '..', '..', 'golden-corpus');
const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8'));

function pinnedContext(name, title, records) {
    const ts = manifest.context.pinnedTimestamp;
    return {
        page: { id: name, title, url: `/${name}`, slug: name, description: '', published: true, createdAt: ts, updatedAt: ts, image: '', type: 'page', custom: {} },
        user: null, visitor: {}, url: {}, system: {}, cookies: {}, local: {}, session: {}, records, app: manifest.context.app,
    };
}

let changed = 0;
for (const entry of manifest.entries) {
    const { title, records, layout } = JSON.parse(readFileSync(join(corpus, 'layouts', `${entry.name}.json`), 'utf8'));
    const actual = await renderPage(layout, pinnedContext(entry.name, title, records));
    const sha = createHash('sha256').update(actual).digest('hex');
    const pagePath = join(corpus, 'pages', `${entry.name}.html`);
    const prev = readFileSync(pagePath, 'utf8');
    if (prev !== actual) {
        writeFileSync(pagePath, actual, 'utf8');
        changed++;
        console.log(`  ~ ${entry.name}: ${actual.length} B (was ${prev.length} B)`);
    }
    entry.sha256 = sha;
    entry.bytes = actual.length;
}

writeFileSync(join(corpus, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\nregen-golden: ${changed}/${manifest.entries.length} snapshots updated, manifest SHAs rewritten`);
