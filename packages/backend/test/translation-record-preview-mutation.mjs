/** In-memory compiled faults; never rewrites a shared source/artifact. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const target = new URL('../dist/compat/translation-record-preview.js', import.meta.url);
const original = readFileSync(target, 'utf8');
const faults = [
 ['optimistic revision token', 'selected.value.token !== request.token', 'false'],
 ['configured target locale', 'generation.targetLocales.includes(locale)', 'false'],
 ['manual provenance/protection', 'lifecycle.writeManual(', 'lifecycle.writeGenerated('],
 ['configuration freshness', 'config: session.configHash,', 'config: null,'],
 ['source freshness', 'const fresh = current && !!head && head.sourceVersion === snapshot.source?.sourceVersion && head.sourceFingerprint === fingerprint && head.contextFingerprint === contextFingerprint;', 'const fresh = !!head;'],
 ['expected head guard', 'expectedHead: selected.snapshot.head?.revisionId ?? null', 'expectedHead: null'],
];
for (const [name, from, to] of faults) {
 assert.equal(original.split(from).length - 1, 1, 'unique fault anchor: ' + name);
 const hook = `import {registerHooks} from 'node:module';registerHooks({load(url,context,next){const value=next(url,context);if(url===${JSON.stringify(target.href)})return {...value,source:String(value.source).replace(${JSON.stringify(from)},${JSON.stringify(to)})};return value;}});`;
 const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(hook), fileURLToPath(new URL('./translation-record-preview.mjs', import.meta.url))], { encoding:'utf8', timeout:60000 });
 assert.ok(result.status !== 0 && /AssertionError/.test(result.stderr), 'fault must fail behaviorally: ' + name + '\n' + result.stderr);
 console.log('caught:', name);
}
assert.equal(readFileSync(target,'utf8'), original);
console.log('translation-record-preview: all 6 in-memory faults caught; compiled artifact unchanged');
