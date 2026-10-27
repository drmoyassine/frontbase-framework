import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const batches = new URL('../dist/compat/translation-batches.js', import.meta.url), suite = 'translation-history.mjs';
const faults = [
    ['history unit ownership re-derivation', batches,
        'historyRequestSchema.parse(input), pin = await currentTranslationHostPin(host, db, tenant);\n    if (!pin.generation.targetLocales.includes(request.locale))\n        throw Error();\n    const source = await extract(host, db, tenant, request.selection, pin), unitId = await translationUnitId(pin.storage.scope, source.unit.resource);',
        'historyRequestSchema.parse(input), pin = await currentTranslationHostPin(host, db, tenant);\n    if (!pin.generation.targetLocales.includes(request.locale))\n        throw Error();\n    const unitId = request.unitId ?? "0".repeat(64);'],
    ['restore current-identity composition', batches,
        'sourceFingerprint: snapshot.source.fingerprint,\n        sourceVersion: snapshot.source.sourceVersion, contextFingerprint: snapshot.source.contextFingerprint,',
        'sourceFingerprint: target.sourceFingerprint,\n        sourceVersion: target.sourceVersion, contextFingerprint: target.contextFingerprint,'],
    ['restore head CAS', batches,
        'expectedHead: snapshot.head?.revisionId ?? null, text: target.text });',
        'expectedHead: null, text: target.text });'],
];
const run = hook => spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(hook ?? ''),
    fileURLToPath(new URL('./' + suite, import.meta.url))], { encoding: 'utf8', timeout: 120000 });
const clean = run();
assert.equal(clean.status, 0, clean.stdout + clean.stderr);
for (const [name, url, from, to] of faults) {
    const original = readFileSync(url, 'utf8');
    assert.ok(original.includes(from), 'fault anchor ' + name);
    const injected = `import {registerHooks} from 'node:module';registerHooks({load(url,context,next){const result=next(url,context);return url===${JSON.stringify(url.href)}?{...result,source:String(result.source).replaceAll(${JSON.stringify(from)},${JSON.stringify(to)})}:result;}});`;
    const r = run(injected);
    assert.ok(r.status !== 0 && /AssertionError/.test(r.stderr), 'behavioral fault ' + name + '\n' + r.stderr);
    assert.equal(readFileSync(url, 'utf8'), original);
    console.log('caught:', name);
}
console.log('translation-history: three in-memory faults caught; source unchanged');
