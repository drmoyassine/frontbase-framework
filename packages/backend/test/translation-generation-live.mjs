/**
 * Live gate: representative REAL provider output for the translation generation transport.
 * Credential-gated: self-skips without FRONTBASE_TRANSLATION_AI_LIVE=1 + FRONTBASE_TRANSLATION_AI_LIVE_KEY
 * + FRONTBASE_TRANSLATION_AI_LIVE_MODEL. Runs the production transport (httpTextInvoker over the fixed
 * OpenRouter origin) with the production prompt envelope (translationMessages) against the real network.
 *
 * No-paid-routing is enforced twice: the model id must be an OpenRouter `:free` selection (the gate
 * refuses otherwise) and the transport pins max_price 0 for free models with fallbacks disabled.
 *
 * Proves: a real free-provider completion round-trips; the text passes the production plain-revision
 * validator (no markup, fences or placeholder damage); usage accounting (when the provider reports it)
 * carries positive integer token counts.
 */
const { FRONTBASE_TRANSLATION_AI_LIVE, FRONTBASE_TRANSLATION_AI_LIVE_KEY, FRONTBASE_TRANSLATION_AI_LIVE_MODEL } = process.env;
if (FRONTBASE_TRANSLATION_AI_LIVE !== '1' || !FRONTBASE_TRANSLATION_AI_LIVE_KEY || !FRONTBASE_TRANSLATION_AI_LIVE_MODEL) {
    console.log('  (translation-generation-live: credential-gated — set FRONTBASE_TRANSLATION_AI_LIVE=1 + FRONTBASE_TRANSLATION_AI_LIVE_KEY + FRONTBASE_TRANSLATION_AI_LIVE_MODEL, an OpenRouter :free model, to run)');
    console.log('\ntranslation-generation-live: SKIP (no creds) ⏭️');
    process.exit(0);
}

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

if (!FRONTBASE_TRANSLATION_AI_LIVE_MODEL.endsWith(':free')) {
    console.log('  ❌ model must be an OpenRouter :free selection — no paid routing in the translation workflow');
    console.log('\ntranslation-generation-live: FAIL ❌ (1)');
    process.exit(1);
}

const [{ httpTextInvoker }, { translationMessages }, { validatePlainRevision }] = await Promise.all([
    import('@frontbase/edge-infra/ai'), import('../dist/compat/translation-generation.js'), import('@frontbase/edge-core/localization')]);

// Same envelope as the reviewed-batch path: system instruction + JSON user payload, target locale ar.
const unit = { version: 1, scope: { tenantId: 'live-probe', projectId: 'live-probe' }, sourceLocale: 'en', format: 'plain',
    text: 'International students can apply to universities in the United States through a simple online process.',
    segmenterVersion: 1, placeholders: [], resource: { kind: 'component', documentId: 'live-probe', blockId: 'probe',
        versionId: 'default', propertyPath: ['props', 'text'] } };
const context = { version: 1, role: 'Heading', resourceLabel: 'Live provider validation probe' };
const messages = translationMessages({ unit, context }, 'ar');

check('prompt envelope is system+user with the production instruction', messages.length === 2 && messages[0].role === 'system'
    && messages[0].content.startsWith('Translate only the text field') && typeof messages[1].content === 'string'
    && messages[1].content.includes('"targetLocale":"ar"'));

// Fixed provider origin, real fetch — no fixture transport anywhere in this file.
const invoke = httpTextInvoker({ baseUrl: 'https://openrouter.ai/api/v1', apiKey: FRONTBASE_TRANSLATION_AI_LIVE_KEY, protocol: 'openrouter' },
    (input, init) => fetch(input, init));

let result = null, failure = '';
try { result = await invoke({ model: FRONTBASE_TRANSLATION_AI_LIVE_MODEL, maxOutputTokens: 512, messages }); }
catch (error) { failure = error instanceof Error ? error.message : String(error); }
check('real free-provider completion returned', !!result);
if (!result) {
    console.log(`  ℹ️ transport failure: ${failure}`);
    console.log('\ntranslation-generation-live: FAIL ❌ (1)');
    process.exit(1);
}

check('output passes the production plain-revision validator', validatePlainRevision(unit, result.text) === null);
check('output is a real translation attempt (non-empty, not an echo)', result.text.trim().length >= 2 && result.text !== unit.text);
check('usage accounting present with positive integer tokens', result.usage === undefined
    || (Number.isInteger(result.usage.inputTokens) && result.usage.inputTokens > 0
        && Number.isInteger(result.usage.outputTokens) && result.usage.outputTokens > 0));

console.log(`  ℹ️ model: ${FRONTBASE_TRANSLATION_AI_LIVE_MODEL}; usage: ${result.usage ? JSON.stringify(result.usage) : 'not reported'}`);
console.log(failures === 0 ? '\ntranslation-generation-live: PASS ✅' : `\ntranslation-generation-live: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
