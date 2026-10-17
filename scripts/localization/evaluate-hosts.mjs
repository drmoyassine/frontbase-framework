/** Bundles pinned evaluation dependencies outside the product tree, then probes Node and local workerd. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const [dependencyArg, outputArg] = process.argv.slice(2);
if (!dependencyArg || !outputArg) throw Error('Usage: node --disallow-code-generation-from-strings scripts/localization/evaluate-hosts.mjs <isolated-dependencies> <private-output-directory>');
const dependencies = resolve(dependencyArg), output = resolve(outputArg);
const pinned = JSON.parse(await readFile(new URL('./runtime-evaluation/package.json', import.meta.url), 'utf8'));
for (const [name, version] of Object.entries(pinned.dependencies)) {
    const actual = JSON.parse(await readFile(join(dependencies, 'node_modules', name, 'package.json'), 'utf8'));
    assert.equal(actual.version, version, `Unexpected evaluation version: ${name}`);
}
await mkdir(output, { recursive: true });
const requireWrangler = createRequire(import.meta.resolve('wrangler'));
const miniflarePath = requireWrangler.resolve('miniflare');
const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(miniflarePath).href);
const fixture = resolve('scripts/localization/runtime-host-fixture.mjs');
const nodeFile = join(output, 'node-fixture.mjs');
const workerFile = join(output, 'worker-fixture.mjs');
const common = { bundle: true, platform: 'browser', target: 'es2022', format: 'esm', nodePaths: [join(dependencies, 'node_modules')], logLevel: 'silent' };
await build({ ...common, entryPoints: [fixture], outfile: nodeFile });
await build({ ...common, stdin: { contents: `import {runHostFixture} from ${JSON.stringify(fixture.replaceAll('\\', '/'))}; export default {async fetch(request) { const id = new URL(request.url).searchParams.get('id') || 'fixture'; return Response.json(await runHostFixture(id)); }};`, resolveDir: process.cwd(), sourcefile: 'localization-worker.mjs' }, outfile: workerFile });
const { runHostFixture } = await import(pathToFileURL(nodeFile).href);
const nodeResult = await runHostFixture();
await Promise.all(Array.from({ length: 8 }, (_, i) => runHostFixture(`node-${i}`)));
// Miniflare's programmatic API reads no Wrangler project config, .env, bindings or credentials.
const wrangler = JSON.parse(await readFile(resolve('node_modules/wrangler/package.json'), 'utf8'));
const miniflare = JSON.parse(await readFile(requireWrangler.resolve('miniflare/package.json'), 'utf8'));
const receipt = { node: process.version, execArgv: process.execArgv, platform: process.platform, wrangler: wrangler.version, packages: pinned.dependencies,
    miniflare: miniflare.version, compatibilityDate: '2026-09-14', nodeFixturesPass: true,
    nodeAndLocalWorkerdParity: false, concurrentNodeRequests: 8, concurrentWorkerRequests: 0, ...nodeResult,
    limitations: ['Local workerd is not a deployed Cloudflare acceptance test or actual browser proof', 'Native Intl reference uses hand-authored message functions; it has no interchangeable persisted message grammar', 'Native Text renderer escaping tested, not full rich-text/editor or HTML-shell direction integration', 'Catalog/fallback behavior for formatter-only candidates and native reference is supplied by the fixture', 'Worker lifecycle uses a memory test double; no persistent Worker SQL, AI or release/publication acceptance here'] };
async function withLocalWorker(source, probe) {
    const options = convertV4MiniflareOptions({ ...source, name: 'localization-fixture', modules: true, compatibilityDate: '2026-09-14', host: '127.0.0.1', port: 0,
        outboundService: () => new Response('Fixture network disabled', { status: 403 }) });
    const worker = new Miniflare({ ...options, telemetry: { enabled: false } });
    try { return await probe(worker); }
    finally {
        // Startup failures can also reject dispose(); preserve the original failed stage in the receipt.
        await worker.dispose().catch(error => { receipt.cleanupErrorCode = error.code ?? error.name; });
    }
}
let stage = 'minimal-worker-probe';
try {
    // Do not classify candidate compatibility when a dependency-free worker cannot start.
    await withLocalWorker({ script: 'export default {fetch(){return Response.json({ok:true})}}' }, async worker => {
        const response = await worker.dispatchFetch('http://fixture/');
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
    });
    stage = 'candidate-native-renderer-parity';
    await withLocalWorker({ script: await readFile(workerFile, 'utf8') }, async worker => {
        const response = await worker.dispatchFetch('http://fixture/');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), nodeResult, 'Node and local workerd fixtures differ');
        await Promise.all(Array.from({ length: 8 }, async (_, i) => {
            const concurrent = await worker.dispatchFetch(`http://fixture/?id=worker-${i}`);
            assert.equal(concurrent.status, 200); assert.deepEqual(await concurrent.json(), nodeResult);
        }));
    });
    receipt.nodeAndLocalWorkerdParity = true;
    receipt.concurrentWorkerRequests = 8;
} catch (error) {
    receipt.workerFailure = { stage, code: error.code ?? error.name,
        candidateCompatibilityEstablished: false,
        causeCode: error.cause?.code ?? null,
        explanation: stage === 'minimal-worker-probe' ? 'Dependency-free local worker failed; do not reject a localization candidate from this result' : 'Fixture failed; inspect the error before classifying any candidate' };
    console.error(error.message);
    if (error.cause) console.error(error.cause.message);
    process.exitCode = 1;
}
await writeFile(join(output, 'results-hosts.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(receipt, null, 2));
