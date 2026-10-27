/**
 * SW bundle emitter test — emits a content-hash-versioned sw.js from a REAL SW
 * entry (imports @frontbase/edge-core, browser-safe). Asserts valid JS, deterministic
 * hash, content-sensitivity, and the < 150 KB budget.
 *
 * The SW entry mirrors examples/cf-worker/src/sw.ts: createEngine + proxyProvider
 * + attachServiceWorker, with the manifest baked in as a plain object (the
 * compiler's emit-sw bakes the browser-projected manifest; here it's inlined
 * for the test).
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitSwBundle, assertSwBudget } from '../dist/emit/swBundle.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const dir = mkdtempSync(join(tmpdir(), 'fb-sw-'));
const projectRoot = mkdtempSync(join(tmpdir(), 'fb-sw-proj-'));
const outDir = join(projectRoot, 'dist');
const edgeCore = process.cwd().replace(/\\/g, '/') + '/../edge-core/src/index.ts';

const SW_ENTRY = `import { createEngine, proxyProvider, attachServiceWorker } from '${edgeCore}';
const manifest = { version: 'test', pages: {}, queries: {} };
const engine = createEngine({ manifest, data: proxyProvider('/api/data'), environment: 'service-worker' });
attachServiceWorker(self, engine, manifest);
`;
writeFileSync(join(dir, 'sw.js'), SW_ENTRY);

const res = await emitSwBundle({ entry: join(dir, 'sw.js'), projectRoot, outDir });
check('emitted file exists', existsSync(res.path));
check('filename is content-hashed (sw.<hash>.js)', /^sw\.[0-9a-f]{12}\.js$/.test(res.filename));
check('bundle is substantial (>40KB — edge-core bundled)', res.bytesMin > 40 * 1024);
check('bundle contains SW primitives (addEventListener)', readFileSync(res.path, 'utf8').includes('addEventListener'));

const budget = assertSwBudget(res);
check('SW bundle under 150 KB gzip', budget.ok);

const res2 = await emitSwBundle({ entry: join(dir, 'sw.js'), projectRoot, outDir });
check('deterministic: same input → same hash', res2.hash === res.hash);

// A side-effecting change (tree-shaking won't drop it; minification won't strip it)
// must flip the hash.
writeFileSync(join(dir, 'sw.js'), SW_ENTRY + '\nself.__fb_marker = "content-changed-12345";\n');
const res3 = await emitSwBundle({ entry: join(dir, 'sw.js'), projectRoot, outDir });
check('content change → new hash', res3.hash !== res.hash);

console.log(`  (emitted gzip: ${budget.gzipKb.toFixed(1)} KB)`);
console.log(failures === 0 ? '\nsw-emit: PASS ✅' : `\nsw-emit: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
