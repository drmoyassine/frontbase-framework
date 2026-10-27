import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const batches = new URL('../dist/compat/translation-batches.js', import.meta.url), suite = 'translation-memory.mjs';
const attach = '...(memory ? { suggestion: { unitId: memory.unitId, revisionId: memory.revision.revisionId, provenance: memory.revision.provenance, text: memory.revision.text } } : {})';
const faults = [
    ['plan-surface lookup', batches,
        'const memory = await session.persistence.findApprovedHead(pin.storage.scope, request.targetLocale, fingerprint, unitId);', 'const memory = null;'],
    ['review-surface lookup', batches,
        'const memory = await session.persistence.findApprovedHead(b.review.pin.storage.scope, b.review.targetLocale, await messageSourceFingerprint(source.unit), item.intent.unitId);', 'const memory = null;'],
    ['suggestion attach', batches, attach, '...({})'],
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
console.log('translation-memory: three in-memory faults caught; source unchanged');
