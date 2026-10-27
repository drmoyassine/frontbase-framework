import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const glossary = new URL('../dist/compat/translation-glossary.js', import.meta.url),
    batches = new URL('../dist/compat/translation-batches.js', import.meta.url),
    routes = new URL('../dist/compat/routes/translation-glossary.js', import.meta.url), suite = 'translation-glossary.mjs';
const faults = [
    ['glossary occurrence filter', glossary,
        'term.locale === locale && sourceText.includes(term.source)', 'term.locale === locale && true'],
    ['glossary 64 cap', glossary, '.slice(0, 64);', '.slice(0, 65);'],
    ['project-over-catalog merge override', glossary,
        '[...catalog.value.terms, ...store.value.terms]', '[...store.value.terms, ...catalog.value.terms]'],
    ['batch context application', batches,
        'const glossary = applyTranslationGlossary(terms, locale, source.unit.text);', 'const glossary = undefined;'],
    ['publish tenant-role gate', routes,
        "!['tenant_admin', 'master_admin', 'master_admin_root'].includes(role)", 'false'],
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
console.log('translation-glossary: five in-memory faults caught; source unchanged');
