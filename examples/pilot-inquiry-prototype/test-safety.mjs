import assert from 'node:assert/strict';
import { createFixtureState, startInquiryServer } from './inquiry-server.mjs';
import { issueInquiryContext } from './inquiry-context.mjs';
import { defaultInquiryConfiguration } from './inquiry-schema.mjs';
import { buildInquiryResultPage } from './inquiry-form-page.mjs';

let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`ok - ${name}`); }
function fixture(options = {}) {
    let time = 1700000000;
    const config = defaultInquiryConfiguration();
    config.consent.retentionDays = 1;
    const state = createFixtureState({ config, secret: 'synthetic-safety-key', nowSeconds: () => time,
        clockNow: () => time, ...options });
    const token = state.issueToken({ formId: state.config.formId, institution: 'inst-512', program: 'prog-46188' }).token;
    const request = { formId: state.config.formId, contextToken: token,
        values: { full_name: 'Synthetic Applicant', email: 'synthetic@example.test', consent: 'accepted' } };
    return { state, request, advance: seconds => { time += seconds; } };
}

await check('absent transport retains inquiry without claiming delivery', async () => {
    const { state, request } = fixture({ transport: null });
    const result = state.pipeline.submit(request);
    assert.equal(result.httpStatus, 202);
    assert.equal(result.deliveryState, 'degraded');
    const lead = state.store.getByReceipt(result.receiptId);
    assert.equal(lead.delivery.state, 'degraded');
    assert.equal(lead.delivery.deliveredAt, null);
    assert.equal(state.pipeline.submit(request).receiptId, result.receiptId);
    assert.match(await buildInquiryResultPage({ view: state.view, result }), /could not complete/);
});
await check('changed program relationship refuses before storing or dispatching', () => {
    const { state, request } = fixture();
    state.programs.get('prog-46188').institutionId = 'another-institution';
    assert.equal(state.pipeline.submit(request).status, 'context_invalid');
    assert.equal(state.store.counts().leads, 0);
    assert.equal(state.transport.calls.length, 0);
    const bare = issueInquiryContext(state.secret, { formId: state.config.formId, program: 'prog-46188' }).token;
    assert.equal(state.pipeline.submit({ ...request, contextToken: bare }).httpStatus, 403);
});
await check('throwing adapter keeps receipt and safe retry state', () => {
    const { state, request } = fixture({ transport: { deliver() { throw new Error('PRIVATE_PROVIDER_DETAIL'); } } });
    const result = state.pipeline.submit(request);
    assert.equal(result.deliveryState, 'pending_retry');
    assert.equal(result.deliveryError, 'adapter_failure');
    assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_DETAIL'));
    assert.equal(state.pipeline.submit(request).receiptId, result.receiptId);
    state.pipeline.retryPendingDeliveries(); state.pipeline.retryPendingDeliveries(); state.pipeline.retryPendingDeliveries();
    assert.equal(state.store.getByReceipt(result.receiptId).delivery.state, 'degraded');
});
await check('invalid or asynchronous fake adapter cannot claim success', () => {
    for (const outcome of [undefined, {}, { ok: 'yes' }, Promise.resolve({ ok: true })]) {
        const { state, request } = fixture({ transport: { deliver: () => outcome } });
        assert.equal(state.pipeline.submit(request).deliveryState, 'degraded');
        assert.equal(state.store.counts().leads, 1);
    }
});
await check('expiry removes lead, receipt, dedupe and retry eligibility together', () => {
    const { state, request, advance } = fixture({ transport: { deliver: () => ({ ok: false, retryable: true }) } });
    const result = state.pipeline.submit(request);
    const lead = state.store.getByReceipt(result.receiptId);
    assert.equal(lead.consent.retentionDays, 1);
    assert.equal(lead.consent.text, state.config.consent.text);
    advance(86399); assert.equal(state.store.purgeExpired(state.nowSeconds()), 0);
    advance(1); state.pipeline.retryPendingDeliveries();
    assert.equal(state.store.getByReceipt(result.receiptId), null);
    assert.equal(state.store.getByLeadId(lead.leadId), null);
    assert.deepEqual(state.store.counts(), { leads: 0, dedupeKeys: 0 });
    assert.equal(state.store.listPending().length, 0);
});
await check('HTTP status is bounded, rate limited, private and expires', async () => {
    const { state, request, advance } = fixture();
    const result = state.pipeline.submit(request);
    const server = startInquiryServer(state, { port: 0 });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}/inquiry/status?receipt=`;
    try {
        const response = await fetch(base + result.receiptId);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.match(response.headers.get('x-robots-tag'), /noindex/);
        const body = await response.json();
        assert.deepEqual(Object.keys(body).sort(), ['receivedAt', 'status']);
        for (let i = 0; i < 9; i++) assert.equal((await fetch(base + 'invalid')).status, 404);
        const limited = await fetch(base + result.receiptId);
        assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
        advance(86400);
        assert.equal((await fetch(base + result.receiptId)).status, 404);
        assert.equal(state.store.counts().leads, 0);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
console.log(`${checks} safety groups passed`);
