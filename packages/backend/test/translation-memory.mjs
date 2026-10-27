import assert from 'node:assert/strict';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { createCompatApp } from '../dist/compat/app.js';
import { PagesStore } from '../dist/compat/pages-store.js';

const root = '/api/project/translation-batches/';
const layout = text => ({ root: {}, content: [{ id: 'text', type: 'Text', props: { content: text } }] });
{
    const f = await allowanceFixture(), pages = new PagesStore(f.db, 'alpha');
    // Three surfaces share one source text (one message fingerprint); one differs.
    await pages.create({ name: 'First', slug: 'first', is_homepage: false, layout_data: layout('Study abroad programs') }, 'first', now);
    await pages.create({ name: 'Second', slug: 'second', is_homepage: false, layout_data: layout('Study abroad programs') }, 'second', now);
    await pages.create({ name: 'Third', slug: 'third', is_homepage: false, layout_data: layout('Study abroad programs') }, 'third', now);
    await pages.create({ name: 'Other', slug: 'other', is_homepage: false, layout_data: layout('Campus life guide') }, 'other', now);
    let tenant = 'alpha', authenticated = true;
    const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now,
        externalFetch: f.host.externalFetch, translationExecutionEnabled: true,
        resolvePrincipal: async () => ({ user: authenticated ? { id: 'editor', role: 'owner' } : null, tenant }) });
    const request = (path = '', method = 'GET', body) => app.request(root + path, { method,
        headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    async function json(path, method, body, status = 200) {
        const r = await request(path, method, body);
        assert.equal(r.status, status, await r.clone().text());
        const value = await r.json();
        assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|serviceKey|api_key|data\.example/);
        return value;
    }
    try {
        const sel = pageId => ({ pageId, blockId: 'text', field: 'content' });
        const limits = maxRequests => ({ maxRequests, maxConcurrent: 1, maxMessageBytes: 65536 });
        // Approve one surface manually; its head becomes exact translation memory for the others.
        const firstPreview = await json('page-preview/first/?locale=ar', 'GET');
        await json('page-preview/field/', 'POST', { selection: firstPreview.fields[0].selection, locale: 'ar',
            token: firstPreview.fields[0].token, text: 'برامج الدراسة في الخارج' });
        const firstHistory = await json('history/', 'POST', { selection: sel('first'), locale: 'ar' });
        assert.equal(firstHistory.revisions[0].provenance, 'manual');
        // Plan two same-text surfaces and one different: suggestions only across units, never for a foreign text.
        const plan = await json('plans/', 'POST', { targetLocale: 'ar',
            selections: [sel('second'), sel('third'), sel('other')], limits: limits(3) }, 201);
        const item = pageId => plan.items.find(entry => entry.selection.pageId === pageId);
        assert.deepEqual(item('second').suggestion, { unitId: firstHistory.unitId,
            revisionId: firstHistory.revisions[0].revisionId, provenance: 'manual', text: 'برامج الدراسة في الخارج' });
        assert.deepEqual(item('third').suggestion, item('second').suggestion);
        assert.equal(item('other').suggestion, undefined);
        // Re-read surface: the review derives the same suggestion from storage, fresh.
        const review = await json(plan.id + '/review/', 'GET');
        assert.deepEqual(review.items.find(entry => entry.selection.pageId === 'second').suggestion, item('second').suggestion);
        assert.equal(review.items.find(entry => entry.selection.pageId === 'other').suggestion, undefined);
        // Execute an AI batch on Second; its newer head then wins deterministically over the manual one.
        const aiPlan = await json('plans/', 'POST', { targetLocale: 'ar', selections: [sel('second')], limits: limits(1) }, 201);
        await json(aiPlan.id + '/start/', 'POST', { reviewHash: aiPlan.reviewHash, approveContentTransmission: true });
        await json(aiPlan.id + '/continue/', 'POST', { reviewHash: aiPlan.reviewHash });
        await json(aiPlan.id + '/continue/', 'POST', { reviewHash: aiPlan.reviewHash });
        const secondHistory = await json('history/', 'POST', { selection: sel('second'), locale: 'ar' });
        assert.equal(secondHistory.revisions[0].provenance, 'ai');
        const replan = await json('plans/', 'POST', { targetLocale: 'ar', selections: [sel('third')], limits: limits(1) }, 201);
        assert.deepEqual(replan.items[0].suggestion, { unitId: secondHistory.unitId,
            revisionId: secondHistory.revisions[0].revisionId, provenance: 'ai', text: secondHistory.revisions[0].text });
        assert.notEqual(replan.items[0].suggestion.text, 'برامج الدراسة في الخارج');
        // The foreign tenant cannot plan at all without its own language/storage settings (no leak).
        tenant = 'beta';
        await request('plans/', 'POST', { targetLocale: 'ar', selections: [sel('second')], limits: limits(1) })
            .then(r => assert.equal(r.status, 422));
    } finally { f.close(); }
}
console.log('translation memory: cross-surface suggestions exact, newest-head deterministic, tenant-bounded PASS');
