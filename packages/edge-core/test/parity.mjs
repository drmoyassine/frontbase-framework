/**
 * M1.1 byte-parity gate (Decision A-15 §5).
 *
 * Renders every golden-corpus layout through @frontbase/edge-core (built dist)
 * with the engine's DEFAULT config — which reproduces the corpus generation
 * environment — and requires byte-identical output vs the committed snapshots
 * (verified against both the fixture file and the manifest SHA-256).
 */
import { renderPage } from '../dist/index.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', '..', '..', 'golden-corpus');
const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8'));

/** Rebuild the EXACT pinned context recorded in the corpus manifest. */
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

let pass = 0, fail = 0;
for (const entry of manifest.entries) {
    const { title, records, layout } = JSON.parse(readFileSync(join(corpus, 'layouts', `${entry.name}.json`), 'utf8'));
    const expected = readFileSync(join(corpus, 'pages', `${entry.name}.html`), 'utf8');
    const actual = await renderPage(layout, pinnedContext(entry.name, title, records));
    const sha = createHash('sha256').update(actual).digest('hex');
    if (actual === expected && sha === entry.sha256) {
        pass++;
        console.log(`  ✅ ${entry.name} (${entry.bytes} B, sha ok)`);
    } else {
        fail++;
        const firstDiff = [...actual].findIndex((c, i) => c !== expected[i]);
        console.log(`  ❌ ${entry.name}: bytes=${actual === expected} sha=${sha === entry.sha256} firstDiff@${firstDiff}`);
        if (firstDiff >= 0) {
            console.log(`     expected: …${JSON.stringify(expected.slice(Math.max(0, firstDiff - 40), firstDiff + 40))}…`);
            console.log(`     actual:   …${JSON.stringify(actual.slice(Math.max(0, firstDiff - 40), firstDiff + 40))}…`);
        }
    }
}

console.log(`\nbyte-parity: ${pass}/${pass + fail}${fail ? ' — M1.1 GATE FAILING' : ' — M1.1 gate GREEN ✅'}`);
process.exit(fail ? 1 : 0);
