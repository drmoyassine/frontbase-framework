/** Evaluation only. This file is bundled for Node/local workerd; it is not a product adapter. */
import i18next from 'i18next';
import ICUModule from 'i18next-icu';
import { IntlMessageFormat } from 'intl-messageformat';
import { MessageFormat } from 'messageformat';
import { renderPage } from '../../packages/edge-core/src/ssr/PageRenderer.ts';
import { translationUnitId, messageSourceFingerprint, extractRichTextSegments, applyRichTextTranslations, TranslationLifecycle } from '../../packages/translation/dist/index.js';
import { MemoryPersistence } from '../../packages/translation/test/memory-persistence.mjs';
import { translationPersistenceFromSupabase } from '../../packages/edge-infra/dist/translation.js';

const ICU = ICUModule.default ?? ICUModule;
const categories = ['zero', 'one', 'two', 'few', 'many', 'other'];
const samples = [0, 1, 2, 3, 11, 100];
const arabic = ['لا نتائج', 'نتيجة واحدة', 'نتيجتان', 'نتائج قليلة', 'نتائج كثيرة', 'نتائج'];
const icuMessage = '{count, plural, ' + categories.map((key, i) => `${key} {${arabic[i]}}`).join(' ') + '}';
const mfMessage = '.input {$count :number}\n.match $count\n' + categories.map((key, i) => `${key === 'other' ? '*' : key} {{${arabic[i]}}}`).join('\n');
const normalize = value => value.replace(/[\u2066-\u2069]/g, '');
const equal = (actual, expected, label) => { if (actual !== expected) throw Error(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`); };

async function i18nAdapter(locale, marker, icu) {
    const instance = i18next.createInstance();
    if (icu) instance.use(ICU);
    await instance.init({ lng: locale, fallbackLng: 'en', initImmediate: false,
        interpolation: { escapeValue: false },
        i18nFormat: icu ? { bindI18nStore: 'added removed', parseErrorHandler: error => { throw error; } } : undefined,
        resources: { en: { translation: { marker, fallback: 'Fallback', greeting: icu ? 'Hello {name}' : 'Hello {{name}}' } },
            ar: { translation: { marker, greeting: icu ? 'مرحباً {name}' : 'مرحباً {{name}}',
                ...(icu ? { count: icuMessage } : Object.fromEntries(categories.map((key, i) => ['count_' + key, arabic[i]]))) } } } });
    return { count: count => instance.t('count', { count }), greeting: name => instance.t('greeting', { name }),
        marker: () => instance.t('marker'), fallback: () => instance.t('fallback'),
        replace: text => instance.addResourceBundle(locale, 'translation', { marker: text }, true, true) };
}

function formatterAdapter(locale, initialMarker, mf2) {
    let marker = initialMarker;
    const cache = new Map();
    const format = (text, values = {}) => {
        let formatter = cache.get(text);
        if (!formatter) { formatter = mf2 ? new MessageFormat(locale, text) : new IntlMessageFormat(text, locale); cache.set(text, formatter); }
        return mf2 ? formatter.format(values, error => { throw error; }) : formatter.format(values);
    };
    return { count: count => format(mf2 ? mfMessage : icuMessage, { count }),
        greeting: name => format(locale === 'ar' ? (mf2 ? 'مرحباً {$name}' : 'مرحباً {name}') : (mf2 ? 'Hello {$name}' : 'Hello {name}'), { name }),
        marker: () => format(marker), fallback: () => format('Fallback'), replace: text => { marker = text; } };
}

function nativeIntlReference(locale, initialMarker) {
    // Reference only: host-authored functions supply every message; Intl supplies no message parser/catalog.
    let marker = initialMarker;
    const rules = new Intl.PluralRules(locale);
    return { count: count => arabic[categories.indexOf(rules.select(count))],
        greeting: name => locale === 'ar' ? `مرحباً ${name}` : `Hello ${name}`,
        marker: () => marker, fallback: () => 'Fallback', replace: text => { marker = text; } };
}

const candidates = [
    ['i18next-json', (locale, marker) => i18nAdapter(locale, marker, false), 'library'],
    ['i18next-icu', (locale, marker) => i18nAdapter(locale, marker, true), 'library'],
    ['formatjs-icu', (locale, marker) => formatterAdapter(locale, marker, false), 'host fixture'],
    ['unicode-mf2', (locale, marker) => formatterAdapter(locale, marker, true), 'host fixture'],
    ['native-intl-reference', nativeIntlReference, 'host fixture (no message grammar)'],
];

export async function runHostFixture(requestId = 'fixture') {
    const httpScopes = [];
    const http = translationPersistenceFromSupabase({ url: 'https://fixture.invalid', restUrl: 'https://fixture.invalid', serviceKey: 'synthetic-host-jwt',
        fetchImpl: async (url, options) => {
            equal(String(url), 'https://fixture.invalid/rpc/translation_request', 'HTTP-only endpoint');
            const request = JSON.parse(options.body); httpScopes.push(request.p_scope.projectId);
            equal(new Headers(options.headers).get('content-profile'), 'translations', 'HTTP schema');
            return Response.json(request.p_operation === 'capabilities' ? { protocol: 'frontbase-translation-postgrest', version: 1 } : null);
        } });
    await http.initialize();
    await Promise.all(['project-a', 'project-b'].map(projectId => http.readJob({ tenantId: requestId, projectId }, 'fixture')));
    equal(httpScopes.sort().join(','), '__setup__,project-a,project-b', 'HTTP scope isolation');
    if (!/^[a-z0-9-]{1,64}$/.test(requestId)) throw Error('Invalid fixture request ID');
    const scope = { tenantId: 'tenant', projectId: 'site' };
    const resource = { kind: 'system', componentKind: 'Repeater', messageId: 'count' };
    const unitId = await translationUnitId(scope, resource);
    if (unitId === await translationUnitId({ ...scope, projectId: 'other' }, resource)) throw Error('Translation identity crossed projects');
    const unit = { version: 1, scope, resource, sourceLocale: 'en', format: 'plain', text: 'Results', segmenterVersion: 1, placeholders: [] };
    const fingerprint = await messageSourceFingerprint(unit);
    if (fingerprint === await messageSourceFingerprint({ ...unit, text: 'Matching results' })) throw Error('Source edit did not invalidate fingerprint');
    const rich = { version: 1, children: [{ kind: 'element', id: 'paragraph', tag: 'p', children: [{ kind: 'text', id: 'text', text: 'Hello {{record.name}}' }] }] };
    const translated = applyRichTextTranslations(rich, [{ id: 'text', text: 'مرحباً {{record.name}}' }]);
    equal(extractRichTextSegments(translated)[0].text, 'مرحباً {{record.name}}', 'Standalone rich-text patch');
    // The lifecycle is exercised on both hosts; this test double proves no persistence durability.
    const memory = new MemoryPersistence(), lifecycle = new TranslationLifecycle(memory);
    const source = await lifecycle.syncSource(scope, unit, null);
    const revision = { version: 1, unitId: source.unitId, locale: 'ar', sourceVersion: source.sourceVersion,
        sourceFingerprint: source.sourceFingerprint, expectedHead: null, text: 'نتائج' };
    const rivals = await Promise.all(['one', 'two'].map(revisionId => lifecycle.writeGenerated(scope, { ...revision, revisionId })));
    equal(rivals.filter(result => result.status === 'committed').length, 1, 'Lifecycle CAS winner');
    const head = (await memory.read(scope, source.unitId, 'ar')).head.revisionId;
    equal((await lifecycle.writeManual(scope, { ...revision, revisionId: 'human', expectedHead: head })).status, 'committed', 'Manual correction');
    equal((await lifecycle.writeGenerated(scope, { ...revision, revisionId: 'late', expectedHead: 'human' })).reason, 'manual-protected', 'Manual protection');
    equal((await lifecycle.writeGenerated(scope, { ...revision, revisionId: head })).status, 'already-committed', 'History retry');
    equal((await memory.read(scope, source.unitId, 'ar')).head.revisionId, 'human', 'History retry preserves head');
    const changedContext = await lifecycle.syncSource(scope, unit, source.sourceVersion, { version: 1, role: 'results label' });
    equal(changedContext.sourceVersion, 2, 'Context change invalidates registered input');
    equal((await memory.readSourceVersion(scope, source.unitId, 1)).context.version, 1, 'Original source/context history retained');
    const results = [];
    for (const [candidate, factory, fallbackProvidedBy] of candidates) {
        const ar = await factory('ar', requestId + '-AR'), en = await factory('en', requestId + '-EN');
        const counts = samples.map(count => ar.count(count));
        counts.forEach((text, i) => equal(normalize(text), arabic[i], candidate + ' plural'));
        // Real asynchronous interleaving; request/instance ownership still belongs to the host adapter.
        await Promise.all(Array.from({ length: 20 }, async (_, i) => {
            await Promise.resolve();
            equal((i % 2 ? ar : en).marker(), requestId + (i % 2 ? '-AR' : '-EN'), candidate + ' isolation');
        }));
        ar.replace(requestId + '-updated');
        equal(ar.marker(), requestId + '-updated', candidate + ' replacement');
        equal(en.marker(), requestId + '-EN', candidate + ' unchanged English instance');
        equal(ar.fallback(), 'Fallback', candidate + ' fallback');
        equal(normalize(ar.greeting('Ada')), 'مرحباً Ada', candidate + ' variable');
        const hostile = ar.greeting('<img src=x onerror=alert(1)>');
        const rendered = await renderPage({ content: [{ id: 'translated-text', type: 'Text', props: { text: hostile } }] }, {});
        if (rendered.includes('<img') || !rendered.includes('&lt;img')) throw Error(candidate + ' native Text renderer did not escape interpolation');
        results.push({ candidate, counts, greeting: ar.greeting('Ada'), fallbackProvidedBy,
            nativeTextRendererEscapesInterpolation: true,
            messageSyntaxProvidedBy: candidate === 'native-intl-reference' ? 'none; manually authored fixture functions' : 'candidate' });
    }
    return { results, standaloneFoundation: { unitId, fingerprint, richTextReferencesPreserved: true, projectIsolation: true,
        lifecycleCas: true, manualProtection: true, immutableRetry: true, contextInvalidation: true, sourceHistory: true,
        lifecyclePersistence: 'memory test double only; durable jobs verified separately on Node SQLite',
        httpBridge: 'shared PostgREST client; mocked fetch; no socket dependency', httpScopeIsolation: true },
        number: new Intl.NumberFormat('ar').format(12345.6), date: new Intl.DateTimeFormat('ar', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date('2026-10-16T00:00:00Z')) };
}
