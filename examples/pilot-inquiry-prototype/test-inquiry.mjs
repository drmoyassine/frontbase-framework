/**
 * Inquiry fixture prototype tests — run: node test-inquiry.mjs
 *
 * Deterministic, dependency-free. Unit tests drive the pipeline directly with
 * injected clocks and scripted fake transports; the integration section starts
 * the fixture HTTP server on the assigned port (4394) and exercises the real
 * render/submit/status loop. Nothing here touches networks, databases or real
 * delivery; everything is synthetic.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    inquiryConfigurationSchema,
    inquiryConfigurationIssues,
    inquiryConfigurationReadiness,
    validateSubmissionValues,
    publicFormView,
    defaultInquiryConfiguration,
} from './inquiry-schema.mjs';
import { issueInquiryContext, verifyInquiryContext } from './inquiry-context.mjs';
import { createFakeLeadStore } from './inquiry-store.mjs';
import { createFakeTransport, createFakeRateLimiter } from './inquiry-adapters.mjs';
import { createInquiryPipeline } from './inquiry-pipeline.mjs';
import { createFixtureState, startInquiryServer } from './inquiry-server.mjs';
import { buildInquiryFormPage } from './inquiry-form-page.mjs';

const PASS = [];
function ok(name, fn) {
    try {
        fn();
        PASS.push(name);
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`FAIL - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
}
async function okAsync(name, fn) {
    try {
        await fn();
        PASS.push(name);
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`FAIL - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
}

const SECRET = 'fixture-secret-not-a-credential';
const T0 = 1_700_000_000;

function baseState(options = {}) {
    return createFixtureState({
        secret: SECRET,
        nowSeconds: () => T0,
        clockNow: () => T0,
        ...options,
    });
}

function validValues(overrides = {}) {
    return {
        full_name: 'Test Applicant',
        email: 'applicant@example.com',
        message: 'Please send details.',
        consent: 'accepted',
        ...overrides,
    };
}

function validToken(state, overrides = {}) {
    return state.issueToken({
        formId: state.config.formId,
        institution: 'inst-512',
        program: 'prog-46188',
        originalPath: '/explore/program/dmd-synthetic/',
        ...overrides,
    }).token;
}

// ---------------------------------------------------------------------------
// 1. Context tokens: issuance, verification, tamper behavior
// ---------------------------------------------------------------------------

ok('context token verifies and round-trips', () => {
    const state = baseState();
    const { token, payload } = state.issueToken({
        formId: state.config.formId,
        institution: 'inst-512',
        program: 'prog-46188',
        originalPath: '/explore/program/dmd-synthetic/',
    });
    const verified = verifyInquiryContext(SECRET, token, { nowSeconds: T0, expectedFormId: state.config.formId });
    assert.equal(verified.ok, true);
    assert.equal(verified.payload.institution, 'inst-512');
    assert.equal(verified.payload.program, 'prog-46188');
    assert.equal(verified.payload.originalPath, '/explore/program/dmd-synthetic/');
    assert.equal(payload.jti.length > 0, true);
    // A context-less token (no institution/program) is also valid and round-trips nulls.
    const bare = state.issueToken({ formId: state.config.formId });
    const bareVerified = verifyInquiryContext(SECRET, bare.token, { nowSeconds: T0 });
    assert.equal(bareVerified.ok, true);
    assert.equal(bareVerified.payload.institution, null);
});

ok('tampered payload is refused (signature mismatch)', () => {
    const state = baseState();
    const token = validToken(state);
    const [encoded] = token.split('.');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    payload.institution = 'inst-999'; // attacker changes the record
    const forged = `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${token.split('.')[1]}`;
    const verified = verifyInquiryContext(SECRET, forged, { nowSeconds: T0 });
    assert.equal(verified.ok, false);
    assert.equal(verified.reason, 'tampered');
});

ok('expired token is refused', () => {
    const state = baseState();
    const token = validToken(state);
    const verified = verifyInquiryContext(SECRET, token, { nowSeconds: T0 + 3601 });
    assert.equal(verified.ok, false);
    assert.equal(verified.reason, 'expired');
});

ok('token issued for another form is refused at submit', () => {
    const state = baseState();
    const otherToken = state.issueToken({ formId: 'other_form' }).token;
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: otherToken,
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'context_invalid');
    assert.equal(result.httpStatus, 403);
});

ok('token with unknown institution id is refused server-side at submit', () => {
    // Issued WITHOUT record resolution (simulates a stale or foreign token),
    // then refused by the pipeline's server-side context re-resolution.
    const state = baseState();
    const stale = issueInquiryContext(SECRET, {
        formId: state.config.formId,
        institution: 'inst-404',
        program: null,
        originalPath: null,
    }, { nowSeconds: T0 });
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: stale.token,
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'context_invalid');
    assert.equal(result.reason, 'unknown_institution');
});

ok('token referencing an ineligible (inactive) record is refused', () => {
    const state = baseState();
    const token = validToken(state, { institution: 'inst-999' });
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: token,
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'context_invalid');
    assert.equal(result.reason, 'unknown_institution');
});

// ---------------------------------------------------------------------------
// 2. Configuration contract refusals
// ---------------------------------------------------------------------------

ok('configuration refuses an inline URL in a destination', () => {
    const config = defaultInquiryConfiguration();
    config.destinations.push({ key: 'hook', kind: 'webhook', connectionRef: 'https://attacker.example/collect', enabled: true });
    assert.ok(inquiryConfigurationIssues(config).some(i => i.includes('connectionRef')));
    // and the proposed contract never accepts arbitrary URLs as references
    assert.ok(inquiryConfigurationSchema.safeParse(config).success === false);
});

ok('configuration refuses credential material in free text', () => {
    const config = defaultInquiryConfiguration();
    // Sanitizer notice: the value below is a deliberately fabricated,
    // non-functional credential-shaped fixture with obviously fake sequential
    // filler. It must match a CREDENTIAL_PATTERNS regex to prove the guard
    // rail refuses such material; it is not a real secret and never was.
    config.fields[0].label = 'sk_live_BCkXyZ1234567890abcdef name';
    assert.ok(inquiryConfigurationIssues(config).length > 0);
});

ok('configuration refuses duplicate field keys and consent without field', () => {
    const config = defaultInquiryConfiguration();
    config.fields.push({ ...config.fields[0] });
    assert.ok(inquiryConfigurationIssues(config).some(m => m.includes('duplicate field key')));
    const config2 = JSON.parse(JSON.stringify(defaultInquiryConfiguration()));
    config2.fields = config2.fields.filter(f => f.type !== 'consent');
    assert.ok(inquiryConfigurationIssues(config2).some(m => m.includes('consent')));
});

ok('draft configurations stay representable; readiness is a separate check', () => {
    // The default draft (disabled, no enabled destination) is VALID data.
    const draft = defaultInquiryConfiguration();
    assert.deepEqual(inquiryConfigurationIssues(draft), []);
    // Readiness names what an administrator must still complete.
    const missing = inquiryConfigurationReadiness(draft);
    assert.ok(missing.includes('enabled'));
    assert.ok(missing.some(m => m.startsWith('destinations')));
    // Completing it clears readiness without changing the schema.
    const ready = JSON.parse(JSON.stringify(draft));
    ready.enabled = true;
    ready.destinations[0].enabled = true; // lead_store
    assert.deepEqual(inquiryConfigurationReadiness(ready), []);
});

ok('public view never contains destinations, connection refs or rate settings', () => {
    const state = baseState();
    const view = JSON.stringify(state.view);
    assert.equal(view.includes('destinations'), false);
    assert.equal(view.includes('connectionRef'), false);
    assert.equal(view.includes('rateLimit'), false);
    assert.equal(view.includes('admissions_mail'), false);
    assert.equal(view.includes('crm'), false);
    assert.equal(view.includes('windowSeconds'), false);
    // The honeypot field NAME is public by design (the HTML field must exist);
    // everything else about abuse controls stays server-side.
    assert.equal(view.includes('office_fax'), true);
});

// ---------------------------------------------------------------------------
// 3. Field validation (server-side; browser never trusted)
// ---------------------------------------------------------------------------

ok('missing required fields are refused with per-field errors', () => {
    const state = baseState();
    const token = validToken(state);
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: token,
        values: { full_name: '', email: '', consent: '' },
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'validation_error');
    assert.equal(result.errors.full_name, 'this field is required');
    assert.equal(result.errors.email, 'this field is required');
    assert.equal(result.errors.consent, 'consent is required');
    assert.equal(state.store.counts().leads, 0);
});

ok('invalid email, over-length and unknown fields are refused', () => {
    const state = baseState();
    const token = validToken(state);
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: token,
        values: validValues({ email: 'not-an-email', message: 'x'.repeat(3000), extra_field: 'junk' }),
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'validation_error');
    assert.match(result.errors.email, /valid email/);
    assert.match(result.errors.message, /at most/);
    assert.equal(result.errors.extra_field, 'unknown field');
    assert.equal(state.store.counts().leads, 0);
});

ok('honeypot content is refused without a record', () => {
    const state = baseState();
    const token = validToken(state);
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: token,
        values: validValues({ office_fax: 'spammy content' }),
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'spam_refused');
    assert.equal(state.store.counts().leads, 0);
});

ok('select options enforce membership', () => {
    const state = baseState();
    state.config.fields.push({ key: 'intake', label: 'Intake', type: 'select', required: false, maxLength: 500, options: ['Fall 2027', 'Spring 2028'] });
    const values = validateSubmissionValues(state.config, validValues({ intake: 'Never 1999' }));
    assert.equal(values.ok, false);
    assert.match(values.errors.intake, /listed options/);
    const good = validateSubmissionValues(state.config, validValues({ intake: 'Fall 2027' }));
    assert.equal(good.ok, true);
    assert.equal(good.values.intake, 'Fall 2027');
});

// ---------------------------------------------------------------------------
// 4. Store, retry dedupe, rate limit, delivery states
// ---------------------------------------------------------------------------

ok('valid submission stores exactly one lead with context', () => {
    const state = baseState();
    const token = validToken(state);
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: token,
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'stored');
    assert.equal(result.deliveryState, 'delivered');
    const lead = state.store.getByReceipt(result.receiptId);
    assert.equal(lead.context.institution, 'inst-512');
    assert.equal(lead.context.program, 'prog-46188');
    assert.equal(lead.context.originalPath, '/explore/program/dmd-synthetic/');
    assert.equal(lead.values.email, 'applicant@example.com');
    assert.equal(state.store.counts().leads, 1);
});

ok('repeated clicks (identical double submit) create no duplicate', () => {
    const state = baseState();
    const token = validToken(state);
    const request = { formId: state.config.formId, contextToken: token, values: validValues() };
    const first = state.pipeline.submit(request, { clientKey: 'ip-1' });
    const second = state.pipeline.submit(request, { clientKey: 'ip-1' });
    assert.equal(first.status, 'stored');
    assert.equal(second.status, 'already_received');
    assert.equal(second.receiptId, first.receiptId);
    assert.equal(state.store.counts().leads, 1);
    assert.equal(state.store.counts().dedupeKeys, 1);
});

ok('lost-response retry (fresh token, same submission) returns the original receipt', () => {
    const state = baseState();
    const first = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues(),
    }, { clientKey: 'ip-1' });
    // The response was lost; the visitor reloads the page (new token/jti) and
    // resubmits the same values.
    const second = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues({ message: 'Please send details.' }),
    }, { clientKey: 'ip-2' });
    assert.equal(first.status, 'stored');
    assert.equal(second.status, 'already_received');
    assert.equal(second.receiptId, first.receiptId);
    assert.equal(state.store.counts().leads, 1);
});

ok('a genuinely different submission is a separate lead', () => {
    const state = baseState();
    state.pipeline.submit({ formId: state.config.formId, contextToken: validToken(state), values: validValues() }, { clientKey: 'ip-1' });
    const other = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues({ email: 'other.person@example.com' }),
    }, { clientKey: 'ip-3' });
    assert.equal(other.status, 'stored');
    assert.equal(state.store.counts().leads, 2);
});

ok('rate-limit refusal keeps no record and reports retry window', () => {
    let now = T0;
    const state = baseState({
        rateLimiter: createFakeRateLimiter({ windowSeconds: 300, maxSubmissions: 2, now: () => now }),
    });
    const submit = (n) => state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues({ email: `person${n}@example.com` }),
    }, { clientKey: 'ip-9' });
    assert.equal(submit(1).status, 'stored');
    assert.equal(submit(2).status, 'stored');
    const refused = submit(3);
    assert.equal(refused.status, 'rate_limited');
    assert.ok(refused.retryAfterSeconds > 0);
    assert.equal(state.store.counts().leads, 2);
    // Window passes: allowed again.
    now = T0 + 301;
    assert.equal(submit(4).status, 'stored');
    assert.equal(state.store.counts().leads, 3);
});

ok('transient adapter failure stores pending, retries once, never duplicates', () => {
    const state = baseState({
        transport: createFakeTransport('flaky', [{ ok: false, retryable: true, error: 'transport_unavailable' }, { ok: true }]),
    });
    const first = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(first.status, 'stored');
    assert.equal(first.deliveryState, 'pending_retry');
    // Same-inquiry retry during the outage: no duplicate record, original receipt.
    const retrySubmit = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(retrySubmit.status, 'already_received');
    // The sweep delivers.
    const swept = state.pipeline.retryPendingDeliveries();
    assert.equal(swept.length, 1);
    assert.equal(swept[0].state, 'delivered');
    assert.equal(state.store.counts().leads, 1);
    const transport = state.transport;
    assert.equal(transport.calls.length, 2);
    assert.equal(transport.calls[0].leadId, transport.calls[1].leadId); // same leadId downstream
});

ok('permanent adapter refusal degrades honestly and keeps the lead', () => {
    const state = baseState({
        transport: createFakeTransport('rejector', [{ ok: false, retryable: false, error: 'rejected_by_destination' }]),
    });
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'stored');
    assert.equal(result.deliveryState, 'degraded');
    assert.equal(result.deliveryError, 'rejected_by_destination');
    const lead = state.store.getByReceipt(result.receiptId);
    assert.equal(lead.delivery.state, 'degraded');
    assert.equal(state.store.counts().leads, 1);
});

ok('exhausted retries degrade instead of retrying forever', () => {
    const state = baseState({
        transport: createFakeTransport('always_down', [{ ok: false, retryable: true, error: 'transport_unavailable' }]),
    });
    const first = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(first.deliveryState, 'pending_retry');
    assert.equal(state.pipeline.retryPendingDeliveries()[0].state, 'pending_retry'); // attempt 2
    assert.equal(state.pipeline.retryPendingDeliveries()[0].state, 'pending_retry'); // attempt 3
    // Fourth sweep exceeds maxAttempts: degraded, no further transport call.
    const exhausted = state.pipeline.retryPendingDeliveries();
    assert.equal(exhausted.length, 1);
    assert.equal(exhausted[0].state, 'degraded');
    assert.equal(state.pipeline.retryPendingDeliveries().length, 0); // nothing pending anymore
    const lead = state.store.getByReceipt(first.receiptId);
    assert.equal(lead.delivery.state, 'degraded');
    assert.equal(state.transport.calls.length, 3);
});

// ---------------------------------------------------------------------------
// 5. Rendered page safety
// ---------------------------------------------------------------------------

await okAsync('form page renders through the engine and leaks nothing', async () => {
    const state = baseState();
    const token = validToken(state);
    const html = await buildInquiryFormPage({
        view: state.view,
        token,
        contextLabels: { institution: 'Muhlenberg College (synthetic)', program: 'DMD program (synthetic)' },
    });
    assert.ok(html.includes('Request information'));
    assert.ok(html.includes('Muhlenberg College (synthetic)'));
    assert.ok(html.includes('name="contextToken"'));
    assert.ok(html.includes('name="office_fax"')); // honeypot present in HTML
    assert.ok(html.includes('type="email"'));
    assert.ok(!html.includes('connectionRef'));
    assert.ok(!html.includes('admissions_mail'));
    assert.ok(!html.includes('crm'));
    assert.ok(!html.includes(SECRET));
    assert.ok(!html.includes('rateLimit'));
    // Engine-rendered pieces present (class prefixes come from the engine's
    // static/interactive renderers; verified against packages/edge-core source).
    assert.ok(html.includes('fb-heading'));
    assert.ok(html.includes('fb-label'));
    assert.ok(html.includes('fb-button'));
    // No status alert on the clean form.
    assert.ok(!html.includes('Inquiry received'));
    assert.ok(!html.includes('Already received'));
});

await okAsync('disabled form refuses submission', async () => {
    const state = baseState({ enabled: false });
    const result = state.pipeline.submit({
        formId: state.config.formId,
        contextToken: validToken(state),
        values: validValues(),
    }, { clientKey: 'tester' });
    assert.equal(result.status, 'form_disabled');
    assert.equal(result.httpStatus, 409);
});

// ---------------------------------------------------------------------------
// 6. HTTP integration on port 4394
// ---------------------------------------------------------------------------

await okAsync('HTTP server: render, submit, duplicate, status', async () => {
    const port = Number(process.env.INQUIRY_PORT ?? 4394);
    const state = baseState();
    const server = startInquiryServer(state, { port });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    try {
        const base = `http://127.0.0.1:${port}`;

        const health = await fetch(`${base}/healthz`);
        assert.equal(health.status, 200);

        const apply = await fetch(`${base}/inquiry/apply`);
        assert.equal(apply.status, 200);
        const applyHtml = await apply.text();
        assert.ok(applyHtml.includes('name="contextToken"'));
        const tokenMatch = applyHtml.match(/name="contextToken" value="([^"]+)"/);
        assert.ok(tokenMatch, 'token embedded in the form');

        const submit = await fetch(`${base}/inquiry/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                formId: state.config.formId,
                contextToken: tokenMatch[1],
                full_name: 'Http Applicant',
                email: 'http-applicant@example.com',
                message: 'Via HTTP',
                consent: 'accepted',
                office_fax: '',
            }).toString(),
        });
        assert.equal(submit.status, 202);
        const submitHtml = await submit.text();
        const receiptMatch = submitHtml.match(/Reference: ([a-f0-9]{24})/);
        assert.ok(receiptMatch, 'receipt shown on the success page');
        assert.ok(!submitHtml.includes('connectionRef'));
        assert.ok(!submitHtml.includes(SECRET));

        // Lost-response retry through HTTP: same values again → already_received.
        const retry = await fetch(`${base}/inquiry/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                formId: state.config.formId,
                contextToken: tokenMatch[1],
                full_name: 'Http Applicant',
                email: 'http-applicant@example.com',
                message: 'Via HTTP',
                consent: 'accepted',
                office_fax: '',
            }).toString(),
        });
        assert.equal(retry.status, 200);
        assert.ok((await retry.text()).includes('Already received'));

        // Duplicate count via the store.
        assert.equal(state.store.counts().leads, 1);

        const status = await fetch(`${base}/inquiry/status?receipt=${receiptMatch[1]}`);
        assert.equal(status.status, 200);
        assert.equal((await status.json()).status, 'delivered');

        const statusUnknown = await fetch(`${base}/inquiry/status?receipt=does-not-exist`);
        assert.equal(statusUnknown.status, 404);
        assert.equal((await statusUnknown.json()).status, 'unknown_reference');

        // Validation error through HTTP: 400 with preserved values, no record.
        const bad = await fetch(`${base}/inquiry/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                formId: state.config.formId,
                contextToken: tokenMatch[1],
                full_name: '',
                email: 'bad',
                consent: '',
            }).toString(),
        });
        assert.equal(bad.status, 400);
        const badHtml = await bad.text();
        assert.ok(badHtml.includes('this field is required'));
        assert.ok(badHtml.includes('valid email'));
        assert.equal(state.store.counts().leads, 1); // unchanged
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

await okAsync('spawned fixture server boots on the assigned port and responds', async () => {
    const port = Number(process.env.INQUIRY_PORT ?? 4394);
    const child = spawn(process.execPath, ['inquiry-server.mjs'], {
        cwd: fileURLToPath(new URL('.', import.meta.url)),
        env: { ...process.env, INQUIRY_PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    try {
        const deadline = Date.now() + 15000;
        let up = false;
        while (Date.now() < deadline && !up) {
            try {
                const res = await fetch(`http://127.0.0.1:${port}/healthz`);
                up = res.status === 200;
            } catch {
                await new Promise(r => setTimeout(r, 250));
            }
        }
        assert.ok(up, `fixture server did not come up; output: ${output.slice(0, 400)}`);
        const page = await fetch(`http://127.0.0.1:${port}/inquiry/apply`);
        assert.equal(page.status, 200);
        assert.ok((await page.text()).includes('name="contextToken"'));
    } finally {
        child.kill();
        await new Promise(resolve => child.once('exit', resolve));
    }
});

console.log(`\n${PASS.length} checks passed${process.exitCode ? ' (with failures above)' : ''}.`);
