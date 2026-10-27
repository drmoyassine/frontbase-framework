import assert from 'node:assert/strict';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { createCompatApp } from '../dist/compat/app.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { applyTranslationGlossary, readTranslationGlossaryTerms } from '../dist/compat/translation-glossary.js';
import { translationContextFingerprint } from '@frontbase/edge-core/localization';

const gRoot = '/api/project/translation-glossary/', root = '/api/project/translation-batches/';
const term = (source, target, locale = 'ar') => ({ locale, source, target });
const G1 = [term('Study', 'دراسة'), term('Unrelated', 'لا')], G2 = [term('Study', 'مطالعة'), term('Unrelated', 'لا')];
const pageContext = name => ({ version: 1, role: 'Text', resourceLabel: 'Page ' + name + ' / content' });
const expectedHash = (name, glossary) => translationContextFingerprint(glossary ? { ...pageContext(name), glossary } : pageContext(name));

{
    const f = await allowanceFixture(), pages = new PagesStore(f.db, 'alpha');
    const layout = text => ({ root: {}, content: [{ id: 'text', type: 'Text', props: { content: text } }] });
    await pages.create({ name: 'Discovery', slug: 'discovery', is_homepage: false, layout_data: layout('Study abroad programs') }, 'disc', now);
    await pages.create({ name: 'Manual', slug: 'manual', is_homepage: false, layout_data: layout('Study tips') }, 'manual', now);
    let role = 'owner', tenant = 'alpha', authenticated = true;
    const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now,
        externalFetch: f.host.externalFetch, translationExecutionEnabled: true,
        resolvePrincipal: async () => ({ user: authenticated ? { id: 'editor', role } : null, tenant }) });
    const request = (path = '', method = 'GET', body, base = gRoot) => app.request(base + path, { method,
        headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    async function json(path, method, body, status = 200, base = gRoot) {
        const r = await request(path, method, body, base);
        assert.equal(r.status, status, await r.clone().text());
        const value = await r.json();
        assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|serviceKey|api_key|data\.example/);
        return value;
    }
    try {
        // Default store: project-private, empty, no catalog.
        const initial = await json('');
        assert.deepEqual(initial, { version: 1, revision: 0, terms: [], shared: { enabled: false, revision: null }, catalog: null });
        // Shape refusals: missing revision, duplicate term, invalid locale, empty source.
        for (const body of [{}, { expectedRevision: 0, terms: [term('a', '1'), term('a', '2')] },
            { expectedRevision: 0, terms: [term('a', '1', 'not a locale')] }, { expectedRevision: 0, terms: [term('', '1')] },
            { expectedRevision: 0, terms: Array.from({ length: 257 }, (_, i) => term('t' + i, 'x')) }])
            await json('terms/', 'POST', body, 422);
        // Save + round-trip; stale revision refuses.
        const saved = await json('terms/', 'POST', { expectedRevision: 0, terms: G1 });
        assert.equal(saved.revision, 1);
        assert.deepEqual((await json('')).terms, G1);
        await json('terms/', 'POST', { expectedRevision: 0, terms: G2 }, 409);
        // Role and tenant fences; the foreign tenant sees an empty store (no leak).
        role = 'viewer'; await json('', 'GET', undefined, 403); role = 'owner';
        authenticated = false; await request('', 'GET').then(r => assert.equal(r.status, 401)); authenticated = true;
        await json('publish/', 'POST', { expectedRevision: 0, terms: [term('Guide', 'دليل')] }, 403);
        role = 'owner'; tenant = 'beta';
        await json('', 'GET', undefined, 422); // no language/storage settings for the foreign tenant: nothing, not even an empty store
        tenant = 'alpha';
        // Publish is a tenant-administrator action; adoption is per project at the CURRENT revision.
        role = 'tenant_admin';
        assert.deepEqual(await json('publish/', 'POST', { expectedRevision: 0, terms: [term('Guide', 'دليل')] }),
            { version: 1, revision: 1, terms: [term('Guide', 'دليل')] });
        await json('publish/', 'POST', { expectedRevision: 0, terms: [term('Guide', 'دليل')] }, 409);
        await json('adopt/', 'POST', { revision: 99 }, 409);
        const adopted = await json('adopt/', 'POST', { revision: 1 });
        assert.deepEqual(adopted.shared, { enabled: true, revision: 1 });
        const state = await json('');
        assert.deepEqual(state.shared, { enabled: true, revision: 1 });
        assert.deepEqual(state.catalog, { revision: 1, terms: [term('Guide', 'دليل')] });
        // Effective terms merge: adopted catalog first, project overrides on the same locale+source.
        await json('terms/', 'POST', { expectedRevision: 1, terms: [...G1, term('Guide', 'مرشد')] });
        assert.deepEqual(await readTranslationGlossaryTerms(f.db, 'alpha', f.scope.projectId),
            [term('Guide', 'مرشد'), ...G1]);
        await json('adopt/', 'POST', { revision: null });
        assert.deepEqual(await readTranslationGlossaryTerms(f.db, 'alpha', f.scope.projectId), [...G1, term('Guide', 'مرشد')]);
        // Re-adopt for the batch integration below.
        await json('adopt/', 'POST', { revision: 1 });
        await json('terms/', 'POST', { expectedRevision: 2, terms: G1 });
        role = 'owner';
        // Pure application: literal occurrence, term-asc order, target tiebreak, locale filter, 64 cap.
        assert.deepEqual(applyTranslationGlossary([term('b', '2'), term('a', '1'), term('zz', '3', 'fr'), term('Unrelated', 'لا')], 'ar', 'a b c'),
            [term('a', '1'), term('b', '2')]);
        assert.deepEqual(applyTranslationGlossary([term('x', '2'), term('x', '1')], 'ar', 'x'), [term('x', '1'), term('x', '2')]);
        assert.equal(applyTranslationGlossary(G1, 'ar', 'nothing applies here'), undefined);
        const alphabet = 'abcdefghijklmno', subs = [];
        for (let len = 1; len <= alphabet.length && subs.length < 65; len++)
            for (let start = 0; start + len <= alphabet.length && subs.length < 65; start++)
                subs.push(alphabet.slice(start, start + len));
        assert.equal(subs.length, 65);
        assert.equal(applyTranslationGlossary(subs.map(value => term(value, 'x')), 'ar', alphabet).length, 64);
        // Batch integration: plan preview applies exactly the occurring terms in order.
        const planInput = { targetLocale: 'ar', selections: [{ pageId: 'disc', blockId: 'text', field: 'content' }], limits: { maxRequests: 1, maxConcurrent: 1, maxMessageBytes: 65536 } };
        const plan = await json('plans/', 'POST', planInput, 201, root);
        assert.deepEqual(plan.items[0].context.glossary, [term('Study', 'دراسة')]);
        assert.equal(plan.items[0].context.resourceLabel, 'Page Discovery / content');
        // Manual flows stay glossary-free even with terms in force.
        const manualPreview = await json('page-preview/manual/?locale=ar', 'GET', undefined, 200, root);
        await json('page-preview/field/', 'POST', { selection: manualPreview.fields[0].selection, locale: 'ar',
            token: manualPreview.fields[0].token, text: 'نصائح الدراسة' }, 200, root);
        const manualHistory = await json('history/', 'POST', { selection: manualPreview.fields[0].selection, locale: 'ar' }, 200, root);
        assert.equal(manualHistory.source.contextFingerprint, await expectedHash('Manual', null), 'manual context carries no glossary');
        // Continue registers the glossary context and the prompt carries it.
        await json(plan.id + '/start/', 'POST', { reviewHash: plan.reviewHash, approveContentTransmission: true }, 200, root);
        await json(plan.id + '/continue/', 'POST', { reviewHash: plan.reviewHash }, 200, root);
        const batchHistory = await json('history/', 'POST', { selection: planInput.selections[0], locale: 'ar' }, 200, root);
        assert.equal(batchHistory.source.contextFingerprint, await expectedHash('Discovery', [term('Study', 'دراسة')]));
        assert.equal(batchHistory.source.sourceVersion, 1);
        await json(plan.id + '/continue/', 'POST', { reviewHash: plan.reviewHash }, 200, root);
        assert.equal(f.aiCalls(), 1);
        const sent = f.calls.filter(item => item.url.includes('api.openai.com'))[0];
        assert.deepEqual(JSON.parse(sent.body.messages[1].content).context.glossary, [term('Study', 'دراسة')]);
        assert.equal((await json(plan.id + '/', 'GET', undefined, 200, root)).items[0].state, 'completed');
        await json(plan.id + '/cancel/', 'POST', { reviewHash: plan.reviewHash }, 200, root); // close the allowance before re-planning
        // Invalidation: a terminology change re-syncs the context WITHOUT a text change, and the
        // regenerated prompt carries the new target.
        await json('terms/', 'POST', { expectedRevision: 3, terms: G2 });
        const replan = await json('plans/', 'POST', planInput, 201, root);
        await json(replan.id + '/start/', 'POST', { reviewHash: replan.reviewHash, approveContentTransmission: true }, 200, root);
        await json(replan.id + '/continue/', 'POST', { reviewHash: replan.reviewHash }, 200, root);
        const resynced = await json('history/', 'POST', { selection: planInput.selections[0], locale: 'ar' }, 200, root);
        assert.equal(resynced.source.sourceVersion, 2, 'glossary change bumps the source identity');
        assert.equal(resynced.source.text, 'Study abroad programs', 'source text is unchanged');
        assert.equal(resynced.source.contextFingerprint, await expectedHash('Discovery', [term('Study', 'مطالعة')]));
        await json(replan.id + '/continue/', 'POST', { reviewHash: replan.reviewHash }, 200, root);
        assert.equal(f.aiCalls(), 2);
        const resent = f.calls.filter(item => item.url.includes('api.openai.com'))[1];
        assert.deepEqual(JSON.parse(resent.body.messages[1].content).context.glossary, [term('Study', 'مطالعة')]);
        // The manual unit's stored context NEVER picked up the glossary across all of the above.
        const manualFinal = await json('history/', 'POST', { selection: manualPreview.fields[0].selection, locale: 'ar' }, 200, root);
        assert.equal(manualFinal.source.contextFingerprint, await expectedHash('Manual', null));
        console.log('translation-glossary: project-private CAS store, tenant catalog publish/adopt, deterministic'
            + ' literal application (order/cap), batch contexts carry terms, manual flows glossary-free,'
            + ' glossary change re-syncs context and regenerates with the new target PASS');
    } finally { f.close(); }
}
