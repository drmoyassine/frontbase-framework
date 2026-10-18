/** Compile the actual serverless HTTP entry without Node compatibility or native DB drivers. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
const [receiptPath, mode] = process.argv.slice(2);
if (mode && !['--storage-host', '--allowance-host', '--batch-host'].includes(mode)) throw Error('Unknown graph mode');
const entryPoint = mode === '--batch-host' ? 'packages/backend/dist/compat/routes/translation-batches.js' : mode === '--allowance-host' ? 'packages/backend/dist/compat/translation-allowance.js' : mode === '--storage-host' ? 'packages/backend/dist/compat/translation-storage.js' : 'packages/edge-infra/dist/translation.js';
if (!receiptPath) throw Error('Private receipt output path required');
const built = await build({ entryPoints: [entryPoint], bundle: true, platform: 'browser', target: 'es2022',
    format: 'esm', write: false, metafile: true, logLevel: 'silent' });
const inputs = Object.keys(built.metafile.inputs).map(path => path.replaceAll('\\', '/'));
assert.ok(inputs.some(path => path.includes('supabase-http')));
assert.ok(inputs.some(path => path.includes('@supabase') && path.includes('postgrest-js')));
assert.ok(!inputs.some(path => /(?:^|\/)(?:pg|pg-pool|@libsql|@neondatabase)(?:\/|\+)|postgres-state|providers\/runners|adapters\/postgres\./.test(path)), 'Native driver entered HTTP dependency graph');
const receipt = { entryPoint, platform: 'browser-compatible serverless compilation', target: 'es2022', nodeCompatibilityRequired: false,
    nativeDatabaseDrivers: false, sharedSupabaseHttpClient: true, outputBytes: built.outputFiles[0].contents.length, inputs };
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log('Translation HTTP import graph: PASS (browser-compatible compilation, shared PostgREST client, no native DB driver)');
