#!/usr/bin/env node
/**
 * CF-22 P1 / D3 — emit the framework's product-compat OpenAPI spec.
 *
 * Reads the vendored product community spec + the IMPLEMENTED registry, and
 * writes `contracts/framework.openapi.json` — every vendored op declared, each
 * stamped `x-implemented` (true = real handler, false = 501 stub). Deterministic:
 * sorted top-level keys + stable op order, so two runs are byte-identical.
 *
 *   pnpm --filter @frontbase/backend run contracts:emit        # write
 *   pnpm --filter @frontbase/backend run contracts:check       # staleness gate
 *
 * Requires the backend built first (`tsc` → dist/), like the test suites.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildFrameworkSpec, IMPLEMENTED } from '../dist/compat/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../contracts/framework.openapi.json');

const spec = buildFrameworkSpec(IMPLEMENTED);
// Deterministic without a replacer: buildFrameworkSpec inserts paths in stable
// (sorted op) order and clones components verbatim. (An array-replacer would
// filter keys at every nesting level and empty the doc — do NOT use one.)
const serialized = JSON.stringify(spec, null, 2) + '\n';

if (process.argv.includes('--check')) {
    let committed;
    try { committed = readFileSync(OUT, 'utf-8'); }
    catch { console.error('contracts/framework.openapi.json missing — run contracts:emit'); process.exit(1); }
    if (committed !== serialized) {
        console.error('contracts/framework.openapi.json is stale — regenerate: pnpm --filter @frontbase/backend run contracts:emit');
        process.exit(1);
    }
    console.log('framework.openapi.json up to date');
} else {
    writeFileSync(OUT, serialized);
    let total = 0;
    for (const item of Object.values(spec.paths)) {
        for (const m of Object.keys(item)) if (['get', 'post', 'put', 'delete', 'patch', 'options'].includes(m)) total++;
    }
    console.log(`framework.openapi.json emitted: ${total} ops`);
}
