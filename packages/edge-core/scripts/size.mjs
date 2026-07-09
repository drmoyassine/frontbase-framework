/**
 * M1.1 bundle-size gates:
 *   engine    — full engine (router + renderer + providers + SW attach), < 70 KB
 *   behaviors — published-page client JS (no React), < 12 KB target
 */
import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const kb = (n) => (n / 1024).toFixed(1);

function GATE(name, bytes, budget) {
    const gz = gzipSync(bytes, { level: 9 }).length;
    const ok = gz <= budget * 1024;
    console.log(`${name.padEnd(36)} min ${kb(bytes.length)} KB · gzip ${kb(gz)} KB  (budget ${budget} KB — ${ok ? 'PASS ✅' : 'FAIL ❌'})`);
    return ok;
}

async function bundle(opts) {
    const r = await esbuild.build({ ...opts, minify: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
    return r.outputFiles[0].contents;
}

const engine = await bundle({ entryPoints: [join(root, 'src', 'index.ts')], bundle: true, format: 'esm' });
const behaviors = await bundle({
    stdin: { contents: `import { startBehaviors } from './behaviors.ts'; startBehaviors();`, resolveDir: join(root, 'src'), loader: 'ts' },
    bundle: true, format: 'iife',
});
const workflow = await bundle({ entryPoints: [join(root, 'src', 'workflow', 'index.ts')], bundle: true, format: 'esm' });

const engineOk = GATE('engine (index.ts, SW bundle)', engine, 70);
const behaviorsOk = GATE('behaviors runtime (autostart iife)', behaviors, 12);
GATE('workflow (edge-only subpath)', workflow, 40); // informational — not in the SW bundle

// The workflow engine must NOT leak into the SW/engine bundle (edge-only).
// esbuild tree-shakes it because index.ts never imports ./workflow.
const engineText = Buffer.from(engine).toString('utf8');
const leaked = engineText.includes('executeWorkflow') || engineText.includes('defaultExecutorRegistry');
const isolationOk = !leaked;
console.log(`workflow isolation from SW bundle          ${isolationOk ? 'PASS ✅ (not bundled)' : 'FAIL ❌ (leaked into engine bundle)'}`);

const allOk = engineOk && behaviorsOk && isolationOk;
console.log(`\nverdict: ${allOk ? 'ALL GATES GREEN ✅' : 'GATE(S) FAILING ❌'}`);
process.exit(allOk ? 0 : 1);
