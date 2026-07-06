/**
 * M1.1 bundle-size gate: the full engine (router + renderer + providers + SW
 * attach), bundled for the browser, must stay under 70 KB min+gzip (CI-gated
 * acceptance criterion; spike baseline was 52.7 KB).
 */
import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BUDGET_KB = 70;

const result = await esbuild.build({
    entryPoints: [join(here, '..', 'src', 'index.ts')],
    bundle: true,
    minify: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
});

const bytes = result.outputFiles[0].contents;
const gz = gzipSync(bytes, { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1);

console.log(`engine bundle (browser, min):      ${kb(bytes.length)} KB`);
console.log(`engine bundle (browser, min+gzip): ${kb(gz)} KB  (budget: ${BUDGET_KB} KB — ${gz <= BUDGET_KB * 1024 ? 'PASS ✅' : 'FAIL ❌'})`);
process.exit(gz <= BUDGET_KB * 1024 ? 0 : 1);
