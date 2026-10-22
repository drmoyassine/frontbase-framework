import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Mutation gate for the scalable publication registry (owner directive 2026-10-22):
//  - prefix strip dropped    → /xx/path URLs stop resolving (suite pins localized 200s + the 404 tightening);
//  - corrupt rows healthy    → the listing must flag an unreadable release available:false (suite pins the flag + 503);
//  - offset ignored          → the paginated listing walk must cover every pointer (suite pins the union);
//  - activation CAS removed  → the same-pointer race must admit exactly one winner (suite pins 200/409);
//  - per-path scoping broken → switcher/hreflang/sitemap stay scoped to each path's own releases.
const homepage = new URL('../dist/compat/translation-homepage.js', import.meta.url);
const serving = new URL('../dist/compat/translation-homepage-serving.js', import.meta.url);
const faults = [
    ['locale prefix strip', serving, "path.slice(prefix.length + 1) || '/'", 'path'],
    ['corrupt-row isolation', homepage, 'corrupt: true }', 'corrupt: false }'],
    ['listing pagination offset', homepage, 'options.offset ?? 0', '0'],
    ['activation CAS', homepage, 'JSON.stringify(current) !== JSON.stringify(pointerSchema.nullable().parse(expected))', 'false'],
    ['per-path language scoping', homepage, 'await surfaceHash(path)', "await surfaceHash('/about/')"],
];
const run = (suite, hook) => spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(hook ?? ''), fileURLToPath(new URL('./' + suite, import.meta.url))], { encoding: 'utf8', timeout: 900000 });
for (const suite of ['translation-publication-scale.mjs', 'translation-page-publication.mjs']) {
    const clean = run(suite);
    assert.equal(clean.status, 0, suite + ' clean baseline: ' + clean.stdout.slice(-2000) + clean.stderr.slice(-2000));
}
for (const [name, url, from, to, suite = 'translation-publication-scale.mjs'] of faults) {
    const original = readFileSync(url, 'utf8');
    assert.ok(original.includes(from), 'fault anchor ' + name);
    const hook = `import {registerHooks} from 'node:module';registerHooks({load(url,context,next){const result=next(url,context);return url===${JSON.stringify(url.href)}?{...result,source:String(result.source).replaceAll(${JSON.stringify(from)},${JSON.stringify(to)})}:result;}});`;
    const r = run(suite, hook);
    assert.ok(r.status !== 0 && /AssertionError/.test(r.stderr), 'behavioral fault ' + name + '\n' + r.stderr);
    assert.equal(readFileSync(url, 'utf8'), original);
    console.log('caught:', name);
}
console.log('translation-publication-scale: five in-memory faults caught; source unchanged');
