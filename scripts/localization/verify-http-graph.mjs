/** Compile the actual serverless HTTP entry without Node compatibility or native DB drivers. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
const [receiptPath] = process.argv.slice(2);
if (!receiptPath) throw Error('Private receipt output path required');
const built = await build({ entryPoints: ['packages/edge-infra/dist/translation.js'], bundle: true, platform: 'browser', target: 'es2022',
    format: 'esm', write: false, metafile: true, logLevel: 'silent' });
const inputs = Object.keys(built.metafile.inputs).map(path => path.replaceAll('\\', '/'));
assert.ok(inputs.some(path => path.includes('supabase-http')));
assert.ok(inputs.some(path => path.includes('@supabase') && path.includes('postgrest-js')));
assert.ok(!inputs.some(path => /(?:^|\/)(?:pg|pg-pool|@libsql|@neondatabase)(?:\/|\+)|postgres-state|providers\/runners|adapters\/postgres\./.test(path)), 'Native driver entered HTTP dependency graph');
const receipt = { platform: 'browser-compatible serverless compilation', target: 'es2022', nodeCompatibilityRequired: false,
    nativeDatabaseDrivers: false, sharedSupabaseHttpClient: true, outputBytes: built.outputFiles[0].contents.length, inputs };
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log('Translation HTTP import graph: PASS (browser-compatible compilation, shared PostgREST client, no native DB driver)');
