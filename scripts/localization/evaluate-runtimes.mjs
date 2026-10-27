/** Run with --disallow-code-generation-from-strings. Dependencies stay outside the workspace. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const directory = process.argv[2];
if (!directory) throw Error('Usage: node --disallow-code-generation-from-strings scripts/localization/evaluate-runtimes.mjs <isolated-dependency-directory>');
const deps = resolve(directory), requireCandidate = createRequire(join(deps, 'package.json'));
const load = async name => import(pathToFileURL(requireCandidate.resolve(name)).href);
const i18next = (await load('i18next')).default;
const icuModule = await load('i18next-icu');
const ICU = icuModule.default?.default ?? icuModule.default;
const { IntlMessageFormat } = await load('intl-messageformat');
const { MessageFormat } = await load('messageformat');
const arabic = ['لا نتائج', 'نتيجة واحدة', 'نتيجتان', 'نتائج قليلة', 'نتائج كثيرة', 'نتائج'];
const categories = ['zero', 'one', 'two', 'few', 'many', 'other'];
const samples = [0, 1, 2, 3, 11, 100];
const icuCount = '{count, plural, ' + categories.map((category, i) => `${category} {${arabic[i]}}`).join(' ') + '}';
const mfCount = '.input {$count :number}\n.match $count\n' + categories.map((category, i) => `${category === 'other' ? '*' : category} {{${arabic[i]}}}`).join('\n');
const cleanBidi = text => text.replace(/[\u2066-\u2069]/g, '');
const forms = Object.fromEntries(categories.map((category, i) => ['count_' + category, arabic[i]]));

async function i18nFactory(locale, icu = false) {
    const instance = i18next.createInstance();
    if (icu) instance.use(ICU);
    await instance.init({ lng: locale, fallbackLng: 'en', initImmediate: false,
        interpolation: { escapeValue: false },
        i18nFormat: icu ? { bindI18nStore: 'added removed', parseErrorHandler: error => { throw error; } } : undefined,
        resources: { en: { translation: { marker: 'EN', fallback: 'Fallback', greeting: icu ? 'Hello {name}' : 'Hello {{name}}' } },
            ar: { translation: { marker: 'AR', greeting: icu ? 'مرحباً {name}' : 'مرحباً {{name}}', ...(icu ? { count: icuCount } : forms) } } } });
    return {
        count: count => instance.t('count', { count }), greeting: name => instance.t('greeting', { name }),
        marker: () => instance.t('marker'), fallback: () => instance.t('fallback'),
        replace: text => { instance.addResourceBundle(locale, 'translation', { marker: text }, true, true); },
        invalid: () => { instance.addResource(locale, 'translation', 'invalid', '{count, plural,'); return instance.t('invalid', { count: 2 }); },
        missing: () => instance.t('greeting', {}),
    };
}
function messageFactory(locale, mf2 = false) {
    let marker = locale === 'ar' ? 'AR' : 'EN';
    const cache = new Map();
    const format = (text, values = {}) => {
        let formatter = cache.get(text);
        if (!formatter) { formatter = mf2 ? new MessageFormat(locale, text) : new IntlMessageFormat(text, locale); cache.set(text, formatter); }
        return mf2 ? formatter.format(values, error => { throw error; }) : formatter.format(values);
    };
    return { count: count => format(mf2 ? mfCount : icuCount, { count }),
        greeting: name => format(locale === 'ar' ? (mf2 ? 'مرحباً {$name}' : 'مرحباً {name}') : (mf2 ? 'Hello {$name}' : 'Hello {name}'), { name }),
        marker: () => format(marker), fallback: () => format('Fallback'), replace: text => { marker = text; },
        invalid: () => format(mf2 ? '{$broken' : '{count, plural,', { count: 2 }),
        missing: () => format(mf2 ? 'مرحباً {$name}' : 'مرحباً {name}') };
}
const candidates = [
    { name: 'i18next-json', factory: locale => i18nFactory(locale), imports: "import i18next from 'i18next'; export const create = () => i18next.createInstance();" },
    { name: 'i18next-icu', factory: locale => i18nFactory(locale, true), imports: "import i18next from 'i18next'; import ICU from 'i18next-icu'; export const create = () => i18next.createInstance().use(ICU);" },
    { name: 'formatjs-icu', factory: locale => messageFactory(locale), imports: "import {IntlMessageFormat} from 'intl-messageformat'; export const create = (locale,text) => new IntlMessageFormat(text,locale);" },
    { name: 'unicode-mf2', factory: locale => messageFactory(locale, true), imports: "import {MessageFormat} from 'messageformat'; export const create = (locale,text) => new MessageFormat(locale,text);" },
];
const expectedPackage = JSON.parse(await readFile(new URL('./runtime-evaluation/package.json', import.meta.url), 'utf8'));
for (const [name, version] of Object.entries(expectedPackage.dependencies)) {
    const actual = JSON.parse(await readFile(join(deps, 'node_modules', name, 'package.json'), 'utf8'));
    assert.equal(actual.version, version, `Pinned evaluation version changed: ${name}`);
}
const results = [];
for (const candidate of candidates) {
    const started = performance.now();
    const ar = await candidate.factory('ar'), en = await candidate.factory('en');
    samples.forEach((count, index) => assert.equal(cleanBidi(ar.count(count)), arabic[index], candidate.name + ' plural ' + count));
    assert.equal(cleanBidi(ar.greeting('Ada')), 'مرحباً Ada');
    assert.equal(cleanBidi(en.greeting('Ada')), 'Hello Ada');
    await Promise.all(Array.from({ length: 100 }, async (_, index) => assert.equal((index % 2 ? ar : en).marker(), index % 2 ? 'AR' : 'EN')));
    ar.replace('AR updated'); assert.equal(ar.marker(), 'AR updated'); assert.equal(en.marker(), 'EN');
    assert.equal(ar.fallback(), 'Fallback');
    let rejectsMalformed = false, rejectsMissingValue = false;
    try { ar.invalid(); } catch { rejectsMalformed = true; }
    try { ar.missing(); } catch { rejectsMissingValue = true; }
    const rawMarkup = ar.greeting('<img src=x onerror=alert(1)>');
    assert.ok(cleanBidi(rawMarkup).includes('<img'), 'Rendering escape/safe parts must remain a separate contract');
    const bidiIsolation = /[\u2066-\u2069]/.test(rawMarkup);
    const readyMs = performance.now() - started;
    const hotStart = performance.now();
    for (let i = 0; i < 10_000; i++) ar.count(samples[i % samples.length]);
    const format10000Ms = performance.now() - hotStart;
    const bundle = await build({ stdin: { contents: candidate.imports, resolveDir: deps, sourcefile: candidate.name + '.mjs' },
        platform: 'browser', target: 'es2022', format: 'esm', bundle: true, minify: true, write: false, logLevel: 'silent' });
    const output = bundle.outputFiles[0].contents;
    const bundleText = new TextDecoder().decode(output);
    const dynamicCodePatterns = /\beval\s*\(|\bnew\s+Function\s*\(/.test(bundleText);
    results.push({ candidate: candidate.name, passesArabicPluralFixtures: true, passesInstanceIsolation: true,
        passesDynamicReplacement: true, fallbackProvidedBy: candidate.name.startsWith('i18next') ? 'library' : 'host wrapper fixture',
        rejectsMalformedMessageSyntax: candidate.name === 'i18next-json' ? 'not-applicable-plain-json' : rejectsMalformed,
        rejectsMissingValue, bidiIsolation, browserBundleBytes: output.length, gzipBytes: gzipSync(output).length,
        dynamicCodePatterns, readyMs: +readyMs.toFixed(2), format10000Ms: +format10000Ms.toFixed(2) });
}
const receipt = { node: process.version, execArgv: process.execArgv, platform: process.platform, architecture: process.arch,
    packages: expectedPackage.dependencies, results,
    limitations: ['Node and browser-target bundle probes only; not actual Cloudflare/browser rendering acceptance', 'Rich-text roundtrip, provider storage, publication and full cold-start/performance matrix remain open',
        'Single-run timings are indicative, not production benchmarks', 'Message-only libraries use host-owned catalog/fallback wrappers in these fixtures', 'Static dynamic-code scan is heuristic; not a security proof'] };
const json = JSON.stringify(receipt, null, 2);
if (process.argv[3]) await writeFile(resolve(process.argv[3]), json + '\n', 'utf8');
console.log(json);
