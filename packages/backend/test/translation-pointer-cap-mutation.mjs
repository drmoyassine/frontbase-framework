import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Mutation gate for the 16-pointer write-time fence (translation-homepage.ts):
//  - activation fence removed  → the 17th publish must refuse (suite pins 409 + code);
//  - off-by-one cap (17)       → the 17th publish must still refuse;
//  - wrong-quantity count      → dropping the surface-pointer key family must still refuse,
//                                proving the count mirrors publishedHomepageLocales' registry exactly.
const module = new URL('../dist/compat/translation-homepage.js', import.meta.url);
const faults = [
    ['activation pointer-cap fence', module, 'await assertLocalePointerCap(db, tenant, !!current);', ''],
    ['pointer cap headroom', module, 'const LOCALE_POINTER_CAP = 16;', 'const LOCALE_POINTER_CAP = 17;'],
    ['pointer count key families', module, "'translation_surface:active:v1:%'", "'translation_surface:none:v1:%'"],
];
const run = (suite, hook) => spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(hook ?? ''), fileURLToPath(new URL('./' + suite, import.meta.url))], { encoding: 'utf8', timeout: 600000 });
for (const suite of ['translation-pointer-cap.mjs', 'translation-page-publication.mjs']) {
    const clean = run(suite);
    assert.equal(clean.status, 0, suite + ' clean baseline: ' + clean.stdout.slice(-2000) + clean.stderr.slice(-2000));
}
for (const [name, url, from, to, suite = 'translation-pointer-cap.mjs'] of faults) {
    const original = readFileSync(url, 'utf8');
    assert.ok(original.includes(from), 'fault anchor ' + name);
    const hook = `import {registerHooks} from 'node:module';registerHooks({load(url,context,next){const result=next(url,context);return url===${JSON.stringify(url.href)}?{...result,source:String(result.source).replaceAll(${JSON.stringify(from)},${JSON.stringify(to)})}:result;}});`;
    const r = run(suite, hook);
    assert.ok(r.status !== 0 && /AssertionError/.test(r.stderr), 'behavioral fault ' + name + '\n' + r.stderr);
    assert.equal(readFileSync(url, 'utf8'), original);
    console.log('caught:', name);
}
console.log('translation-pointer-cap: three in-memory faults caught; source unchanged');
