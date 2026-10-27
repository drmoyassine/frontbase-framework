/**
 * Email intake end-to-end (DEC-105 v0): an inbound agent-channel email hits
 * POST /api/system/email/inbound on the compat app, matches ACTIVE workflows
 * by their email_trigger nodes (filters applied from the saved node inputs),
 * and runs them for real — the run recorded as a persisted execution. Plus
 * every guard: unset/mismatched secret 401s (fail closed); malformed payloads
 * and non-matching filters are idempotent skips; a redelivered message id
 * never double-runs; tenants are isolated by the body's tenant-scoped store.
 *
 * The compat app owns /api/system/email/inbound; a Phase2Store over the SAME
 * runner persists the workflows and reads the executions back — the two-app
 * shape the cf-full host mounts.
 */
import { strict as assert } from 'node:assert';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { createCompatApp } from '../dist/compat/app.js';
import { Phase2Store } from '../dist/db/phase2-store.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { emailTriggerMatches } from '../dist/compat/routes/email-inbound.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const SECRET = 'email-inbound-test-secret';
const POS = { x: 0, y: 0 };

// The runs started by the intake execute the workflow's agent node — stub the
// fetch seam for the whole file (sequential tests) and capture the /turn calls
// so the happy path can also pin the exact runtime request shape (DEC-105).
const turnCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/turn')) {
        turnCalls.push({ url, headers: init?.headers, body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({
            turn_id: 'turn-1', thread_id: 'thr-1', status: 'completed', reply: 'Hello!',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(input, init);
};

/** A saved-shape workflow: flat nodes, trigger → agent. */
function nodesJson(triggerInputs = []) {
    return JSON.stringify([
        { id: 't', name: 'Email', type: 'email_trigger', position: POS, inputs: triggerInputs, outputs: [] },
        {
            id: 'a', name: 'Agent', type: 'agent', position: POS,
            inputs: [
                { name: 'baseUrl', value: 'https://agent.example' },
                { name: 'agentSlug', value: 'support' },
                { name: 'contactId', value: 7 },
                { name: 'message', value: '{{ email.subject }}' },
            ],
            outputs: [],
        },
    ]);
}
const EDGES = JSON.stringify([{ source: 't', target: 'a', sourceOutput: 'output', targetInput: 'input' }]);

const EMAIL = {
    from: 'student@example.com',
    to: ['support@example.com'],
    subject: 'Visa question',
    text: 'Do I need a visa?',
    receivedAt: '2026-10-12T00:00:00.000Z',
};
/** Per-test message id — the intake's dedupe map is module-global. */
const email = (id) => ({ ...EMAIL, providerMessageId: id });

function post(app, body, headers = {}) {
    return app.fetch(new Request('http://cms.local/api/system/email/inbound', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
}

async function stack(opts = {}) {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const cipher = await createSecretCipher('email-inbound-test-secret');
    const stores = new Map();
    const phase2For = (t) => {
        let s = stores.get(t);
        if (!s) { s = new Phase2Store(runner, t, cipher); stores.set(t, s); }
        return s;
    };
    let clock = 0;
    const now = () => new Date(Date.UTC(2026, 9, 12) + (clock += 1000)).toISOString();
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-a' }),
        sessionSecret: 'email-inbound-test-secret',
        now,
        emailInboundSecret: opts.inboundSecret === undefined ? SECRET : opts.inboundSecret,
    });
    const putWorkflow = async (id, tenant, inputs) => {
        await phase2For(tenant).upsertWorkflow({
            id, name: `wf-${id}`, nodes: nodesJson(inputs), edges: EDGES, isActive: true,
        }, now());
    };
    return { app, phase2For, now, putWorkflow, authHeaders: { 'x-internal-secret': SECRET } };
}

// ---- authentication ----------------------------------------------------------------

test('no secret configured → every request 401s (fail closed)', async () => {
    const { app } = await stack({ inboundSecret: null });
    const res = await post(app, { email: EMAIL });
    assert.equal(res.status, 401);
});

test('missing / wrong secret header → 401', async () => {
    const { app } = await stack();
    assert.equal((await post(app, { email: EMAIL })).status, 401);
    assert.equal((await post(app, { email: EMAIL }, { 'x-internal-secret': 'nope' })).status, 401);
});

test('malformed body → 400 (before auth is even worth trying)', async () => {
    const { app } = await stack();
    const res = await post(app, 'not json', { 'x-internal-secret': SECRET });
    assert.equal(res.status, 400);
});

// ---- happy path --------------------------------------------------------------------

test('matching email_trigger starts a REAL run (persisted execution, trigger email)', async () => {
    const { app, phase2For, authHeaders, putWorkflow } = await stack();
    await putWorkflow('wf', 'tenant-a', []);

    const res = await post(app, { tenant: 'tenant-a', email: email('msg-happy') }, authHeaders);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, started: 1 });

    const execs = await phase2For('tenant-a').listExecutions('wf');
    assert.equal(execs.length, 1);
    assert.equal(execs[0].trigger, 'email');
    assert.equal(execs[0].status, 'completed');
    // The email travels as the run input (start node receives it).
    assert.deepEqual(JSON.parse(execs[0].input).email.subject, 'Visa question');

    // The agent node POSTed the runtime's exact /turn shape.
    assert.equal(turnCalls.length, 1);
    assert.equal(turnCalls[0].url, 'https://agent.example/turn');
    assert.deepEqual(turnCalls[0].body, {
        agent: 'support', contact_id: 7, message: '{{ email.subject }}',
    });
});

// ---- filters -----------------------------------------------------------------------

test('non-matching filters → {ok, started:0}, no run', async () => {
    const { app, phase2For, authHeaders, putWorkflow } = await stack();
    await putWorkflow('wf-to', 'tenant-a', [{ name: 'toAddress', value: 'billing@example.com' }]);
    await putWorkflow('wf-subject', 'tenant-a', [{ name: 'subjectIncludes', value: 'invoice' }]);
    await putWorkflow('wf-deny', 'tenant-a', [{ name: 'fromDenyList', value: 'student@example.com, bulk@x.example' }]);

    const res = await post(app, { tenant: 'tenant-a', email: email('msg-nf') }, authHeaders);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, started: 0 });
    for (const id of ['wf-to', 'wf-subject', 'wf-deny']) {
        assert.equal((await phase2For('tenant-a').listExecutions(id)).length, 0, id);
    }
});

test('matching filters start the run; inactive workflows never match', async () => {
    const { app, phase2For, now, authHeaders, putWorkflow } = await stack();
    await putWorkflow('wf-match', 'tenant-a', [{ name: 'subjectIncludes', value: 'VISA' }]); // case-insensitive
    await phase2For('tenant-a').upsertWorkflow(
        { id: 'wf-off', name: 'wf-off', nodes: nodesJson([]), edges: EDGES, isActive: false }, now(),
    );

    const res = await post(app, { tenant: 'tenant-a', email: email('msg-match') }, authHeaders);
    assert.deepEqual(await res.json(), { ok: true, started: 1 });
    assert.equal((await phase2For('tenant-a').listExecutions('wf-match')).length, 1);
    assert.equal((await phase2For('tenant-a').listExecutions('wf-off')).length, 0);
});

// ---- idempotency + isolation ---------------------------------------------------------

test('redelivered message id → {ok, skipped:true}, no second run', async () => {
    const { app, phase2For, authHeaders, putWorkflow } = await stack();
    await putWorkflow('wf', 'tenant-a', []);
    await post(app, { tenant: 'tenant-a', email: email('msg-dup') }, authHeaders);

    const again = await post(app, { tenant: 'tenant-a', email: email('msg-dup') }, authHeaders);
    assert.equal(again.status, 200);
    const body = await again.json();
    assert.ok(body.ok === true && body.skipped === true, `expected idempotent skip, got ${JSON.stringify(body)}`);
    assert.equal((await phase2For('tenant-a').listExecutions('wf')).length, 1);
});

test('malformed payload (no message id / no from) → idempotent skip', async () => {
    const { app, authHeaders, putWorkflow } = await stack();
    await putWorkflow('wf', 'tenant-a', []);
    for (const payload of [{ providerMessageId: 'm' }, { from: 'x@y.z' }, {}]) {
        const res = await post(app, { tenant: 'tenant-a', email: payload }, authHeaders);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { ok: true, skipped: true });
    }
});

test('tenant from the body scopes matching; absent tenant → _default', async () => {
    const { app, phase2For, authHeaders, putWorkflow } = await stack();
    await putWorkflow('wf-other', 'tenant-b', []);

    // tenant-a delivery: tenant-b's workflow must not run.
    const resA = await post(app, { tenant: 'tenant-a', email: email('msg-ta') }, authHeaders);
    assert.deepEqual(await resA.json(), { ok: true, started: 0 });

    // tenant-b delivery: matches, and the run lands in tenant-b's store.
    const resB = await post(app, { tenant: 'tenant-b', email: email('msg-tb') }, authHeaders);
    assert.deepEqual(await resB.json(), { ok: true, started: 1 });
    assert.equal((await phase2For('tenant-b').listExecutions('wf-other')).length, 1);

    // Absent tenant → the self-host default namespace.
    await putWorkflow('wf-default', '_default', []);
    const resC = await post(app, { email: email('msg-default') }, authHeaders);
    assert.deepEqual(await resC.json(), { ok: true, started: 1 });
    assert.equal((await phase2For('_default').listExecutions('wf-default')).length, 1);
});

// ---- filter predicate (pure) ----------------------------------------------------------

test('emailTriggerMatches: empty filters match all; deny/to/subject compose', () => {
    assert.equal(emailTriggerMatches(EMAIL, {}), true);
    assert.equal(emailTriggerMatches(EMAIL, { toAddress: 'SUPPORT@example.com' }), true); // case-insensitive
    assert.equal(emailTriggerMatches(EMAIL, { subjectIncludes: 'visa' }), true);
    assert.equal(emailTriggerMatches(EMAIL, { fromDenyList: 'bulk@x.example' }), true); // non-listed sender passes
    assert.equal(emailTriggerMatches(EMAIL, { fromDenyList: ' student@example.com ,' }), false);
    assert.equal(emailTriggerMatches({ ...EMAIL, to: 'support@example.com' }, { toAddress: 'support@example.com' }), true); // string to
    assert.equal(emailTriggerMatches({ ...EMAIL, subject: undefined }, { subjectIncludes: 'visa' }), false);
    assert.equal(emailTriggerMatches({}, {}), false); // no from → never matches
});

let failures = 0;
for (const [name, fn] of tests) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failures++;
        console.log(`  ❌ ${name}\n     ${e.message}`);
    }
}
console.log(failures === 0 ? '\nemail-inbound: PASS ✅' : `\nemail-inbound: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
