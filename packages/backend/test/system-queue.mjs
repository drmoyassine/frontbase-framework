/**
 * Queue end-to-end (Phase 3): execute → QStash publish (row persisted FIRST)
 * → signed receive on the compat app → real workflow run recorded. Plus every
 * guard: publish-refusal falls back to direct execution; unsigned/wrong-key/
 * wrong-secret deliveries 401; redelivery and cross-tenant ids skip without a
 * second run; a deleted workflow completes as workflow_deleted; transient
 * store errors answer 503 so the provider retries; unknown job types are
 * idempotent no-ops.
 *
 * The console app owns the execute route (executionDispatcher seam); the compat
 * app owns /api/system/queue/receive. They share one runner — exactly the two-
 * app shape the cf-full host mounts.
 */
import { strict as assert } from 'node:assert';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { createConsole } from '../dist/index.js';
import { createCompatApp } from '../dist/compat/app.js';
import { registerSystemQueueRoutes } from '../dist/compat/routes/system-queue.js';
import { Phase2Store } from '../dist/db/phase2-store.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { createSystemServiceResolver } from '../dist/compat/system-services.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ENV = {
    queue: { provider: 'qstash', token: 'q-token', signingKey: 'sig_cur', nextSigningKey: 'sig_next' },
    publicUrl: 'https://cms.example',
    queueCallbackSecret: 'cb-secret',
};

const POS = { x: 0, y: 0 };
const NODES = JSON.stringify([
    { id: 'a', type: 'trigger', position: POS },
    { id: 'b', type: 'transform', position: POS, inputs: [{ name: 'expression', value: 'value' }] },
]);
const EDGES = JSON.stringify([{ source: 'a', target: 'b', sourceOutput: 'value', targetInput: 'value' }]);

function request(app, method, path, body) {
    const init = { method };
    if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(body);
    }
    return app.fetch(new Request(`http://cms.local${path}`, init));
}

/** RAW-string POST — signatures are computed over exact bytes. */
function receive(app, body, headers = {}) {
    return app.fetch(new Request('http://cms.local/api/system/queue/receive', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body,
    }));
}

/** Forge a QStash v2 signature (HS256 JWT, iss Upstash, body-hash claim). */
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const enc = new TextEncoder();
async function forge(key, rawBody) {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
        iss: 'Upstash',
        body: b64u(createHash('sha256').update(rawBody).digest()),
        iat: nowSec - 10, nbf: nowSec - 10, exp: nowSec + 300,
    };
    const data = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(payload))}`;
    const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    return `${data}.${b64u(await globalThis.crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data)))}`;
}

async function stack(opts = {}) {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const cipher = await createSecretCipher('system-queue-test-secret');
    const stores = new Map();
    const phase2For = (t) => {
        let s = stores.get(t);
        if (!s) { s = new Phase2Store(runner, t, cipher); stores.set(t, s); }
        return s;
    };
    const fetchCalls = [];
    const externalFetch = async (input, init) => {
        fetchCalls.push({ url: String(input), init });
        return new Response(JSON.stringify({ messageId: `msg_${fetchCalls.length}` }), {
            status: opts.publishStatus ?? 200,
        });
    };
    const resolver = createSystemServiceResolver({
        phase2For, env: ENV, externalFetch, log: () => {}, resolveTtlMs: 0,
    });
    let clock = 0;
    const now = () => new Date(Date.UTC(2026, 0, 1) + (clock += 1000)).toISOString();
    const principal = async () => ({ user: { id: 'u1', role: 'master_admin' }, tenant: 'tenant-a' });
    const consoleApp = await createConsole({
        makeRunner: async () => runner,
        resolvePrincipal: principal,
        sessionSecret: 'system-queue-test-secret',
        now,
        executionDispatcher: opts.executionDispatcher
            ?? ((job) => resolver.queueFor(job.tenant).then((q) => q?.publishExecution(job) ?? false)),
    });
    const compatApp = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: principal,
        sessionSecret: 'system-queue-test-secret',
        now,
        envServices: ENV,
        externalFetch,
    });
    const putWorkflow = (id) => request(consoleApp, 'PUT', `/automations/${id}`, {
        name: `wf-${id}`, nodes: NODES, edges: EDGES, isActive: true,
    });
    const execute = (id) => request(consoleApp, 'POST', `/automations/${id}/execute`, {
        trigger: 'manual', input: { value: 42 },
    });
    return { consoleApp, compatApp, resolver, phase2For, fetchCalls, putWorkflow, execute, runner };
}

// ---- the happy path ------------------------------------------------------------

test('execute → publish: the running row exists BEFORE publish; the job targets the public receive URL', async () => {
    const { resolver, phase2For, fetchCalls, putWorkflow, execute } = await stack({
        executionDispatcher: async (job) => {
            const row = await phase2For(job.tenant).getExecution(job.executionId);
            assert.ok(row, 'execution row must exist before publish (a redelivery must find it)');
            assert.equal(row.status, 'running');
            const q = await resolver.queueFor(job.tenant);
            return q?.publishExecution(job) ?? false;
        },
    });
    await putWorkflow('wf');
    const res = await execute('wf');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'running');

    const call = fetchCalls[0];
    assert.equal(call.url, `https://qstash.upstash.io/v2/publish/${encodeURIComponent('https://cms.example/api/system/queue/receive')}`);
    assert.equal(call.init.headers.Authorization, 'Bearer q-token');
    assert.deepEqual(JSON.parse(call.init.body), {
        type: 'execution', tenant: 'tenant-a', executionId: body.executionId, workflowId: 'wf',
    });
});

test('signed receive completes the queued execution (real engine run)', async () => {
    const { compatApp, phase2For, fetchCalls, putWorkflow, execute } = await stack();
    await putWorkflow('wf');
    const body = await (await execute('wf')).json();
    const jobBody = fetchCalls[0].init.body; // exact published bytes

    const res = await receive(compatApp, jobBody, { 'upstash-signature': await forge('sig_cur', jobBody) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    const row = await phase2For('tenant-a').getExecution(body.executionId);
    assert.equal(row.status, 'completed');
    assert.ok(JSON.parse(row.result), 'real transform result recorded');
});

// ---- fallback ------------------------------------------------------------------

test('publish refused (transport failure) → direct execution, byte-identical outcome', async () => {
    const { phase2For, putWorkflow, execute } = await stack({ publishStatus: 500 });
    await putWorkflow('wf');
    const res = await execute('wf');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'completed');
    assert.equal((await phase2For('tenant-a').getExecution(body.executionId)).status, 'completed');
});

test('executionDispatcher THROWS → caught, direct execution (never a 500)', async () => {
    const { phase2For, putWorkflow, execute } = await stack({
        executionDispatcher: async () => { throw new Error('boom'); },
    });
    await putWorkflow('wf');
    const res = await execute('wf');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'completed');
    assert.equal((await phase2For('tenant-a').getExecution(body.executionId)).status, 'completed');
});

// ---- receive authentication ------------------------------------------------------

test('unsigned, wrong-key, and wrong-callback-secret deliveries → 401', async () => {
    const { compatApp } = await stack();
    const jobBody = JSON.stringify({ type: 'execution', tenant: 'tenant-a', executionId: 'e', workflowId: 'w' });
    assert.equal((await receive(compatApp, jobBody)).status, 401);
    assert.equal((await receive(compatApp, jobBody, { 'upstash-signature': await forge('wrong-key', jobBody) })).status, 401);
    assert.equal((await receive(compatApp, jobBody, { 'x-frontbase-callback-secret': 'nope' })).status, 401);
});

test('no queue resolved for the tenant → 401 (receive cannot authenticate at all)', async () => {
    const app = new Hono();
    const resolver = createSystemServiceResolver({
        phase2For: () => { throw new Error('no store'); },
        env: {},
        externalFetch: async () => new Response('{}'),
        log: () => {},
        resolveTtlMs: 0,
    });
    registerSystemQueueRoutes(app, {
        phase2For: () => { throw new Error('no store'); },
        resolver,
        now: () => '2026-01-01T00:00:00.000Z',
    });
    const jobBody = JSON.stringify({ type: 'execution', tenant: 't', executionId: 'e', workflowId: 'w' });
    assert.equal((await receive(app, jobBody, { 'x-frontbase-callback-secret': 'cb-secret' })).status, 401);
});

test('callback-secret path verifies (the proxy escape hatch)', async () => {
    const { compatApp, phase2For, fetchCalls, putWorkflow, execute } = await stack();
    await putWorkflow('wf');
    const body = await (await execute('wf')).json();
    const jobBody = fetchCalls[0].init.body;
    const res = await receive(compatApp, jobBody, { 'x-frontbase-callback-secret': 'cb-secret' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal((await phase2For('tenant-a').getExecution(body.executionId)).status, 'completed');
});

// ---- idempotency + isolation -------------------------------------------------------

test('redelivery after completion → {ok, skipped}, no second run', async () => {
    const { compatApp, consoleApp, fetchCalls, putWorkflow, execute } = await stack();
    await putWorkflow('wf');
    await execute('wf');
    const jobBody = fetchCalls[0].init.body;
    const sig = await forge('sig_cur', jobBody);
    assert.equal((await receive(compatApp, jobBody, { 'upstash-signature': sig })).status, 200);
    const again = await receive(compatApp, jobBody, { 'upstash-signature': sig });
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), { ok: true, skipped: true });

    const execs = await (await request(consoleApp, 'GET', '/automations/wf/executions')).json();
    assert.equal(execs.executions.length, 1);
});

test('cross-tenant executionId → skipped, NOT run (RULE 2)', async () => {
    const { compatApp, phase2For, fetchCalls, putWorkflow, execute } = await stack();
    await putWorkflow('wf');
    const body = await (await execute('wf')).json();
    // A delivery claiming tenant-b while carrying tenant-a's executionId. The
    // signature is over exactly these bytes with the (env) signing key, so it
    // authenticates — the ISOLATION is the tenant-scoped lookup, not the sig.
    const foreign = JSON.stringify({ type: 'execution', tenant: 'tenant-b', executionId: body.executionId, workflowId: 'wf' });
    const res = await receive(compatApp, foreign, { 'upstash-signature': await forge('sig_cur', foreign) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, skipped: true });
    // tenant-a's row is untouched by the foreign delivery.
    assert.equal((await phase2For('tenant-a').getExecution(body.executionId)).status, 'running');
});

test('workflow gone while the execution row survives → completed as workflow_deleted (no redelivery loop)', async () => {
    const { compatApp, phase2For, fetchCalls, putWorkflow, execute, runner } = await stack();
    await putWorkflow('wf');
    const body = await (await execute('wf')).json();
    // The console DELETE route cascades executions (its deliveries land on the
    // idempotent skip). The belt to those braces: the workflow vanishes by
    // another means while the row lives — the receive must FAIL the row, not
    // redeliver forever.
    await runner.exec('DELETE FROM workflows WHERE id = ? AND tenant_slug = ?', ['wf', 'tenant-a']);
    const jobBody = fetchCalls[0].init.body;
    const res = await receive(compatApp, jobBody, { 'upstash-signature': await forge('sig_cur', jobBody) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    const row = await phase2For('tenant-a').getExecution(body.executionId);
    assert.equal(row.status, 'error');
    assert.equal(row.error, 'workflow_deleted');
});

// ---- shape guards -----------------------------------------------------------------

test('malformed body / missing tenant → 400; unknown job type → idempotent skip', async () => {
    const app = new Hono();
    const resolver = createSystemServiceResolver({
        phase2For: () => { throw new Error('unused'); },
        env: { queue: { provider: 'qstash', token: 't', signingKey: 'k' }, queueCallbackSecret: 'cb-secret' },
        externalFetch: async () => new Response('{}'),
        log: () => {},
        resolveTtlMs: 0,
    });
    registerSystemQueueRoutes(app, {
        phase2For: () => { throw new Error('unused'); },
        resolver,
        now: () => '2026-01-01T00:00:00.000Z',
    });
    assert.equal((await receive(app, 'not json')).status, 400);
    assert.equal((await receive(app, '{"type":"execution"}')).status, 400); // no tenant
    const unknown = await receive(app, '{"type":"whatever","tenant":"t"}', { 'x-frontbase-callback-secret': 'cb-secret' });
    assert.equal(unknown.status, 200);
    assert.deepEqual(await unknown.json(), { ok: true, skipped: true });
});

test('execution missing ids → idempotent skip; store error mid-lookup → 503 (provider retries)', async () => {
    const env = { queue: { provider: 'qstash', token: 't', signingKey: 'k' }, queueCallbackSecret: 'cb-secret' };
    const resolver = createSystemServiceResolver({
        phase2For: () => { throw new Error('unused'); },
        env,
        externalFetch: async () => new Response('{}'),
        log: () => {},
        resolveTtlMs: 0,
    });
    const app = new Hono();
    registerSystemQueueRoutes(app, {
        phase2For: () => ({
            getExecution: async () => { throw new Error('store down'); },
        }),
        resolver,
        now: () => '2026-01-01T00:00:00.000Z',
    });
    const missingIds = await receive(app, '{"type":"execution","tenant":"t"}', { 'x-frontbase-callback-secret': 'cb-secret' });
    assert.equal(missingIds.status, 200);
    assert.deepEqual(await missingIds.json(), { ok: true, skipped: true });
    const down = await receive(
        app,
        '{"type":"execution","tenant":"t","executionId":"e","workflowId":"w"}',
        { 'x-frontbase-callback-secret': 'cb-secret' },
    );
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), { detail: 'temporarily_unavailable' });
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
console.log(failures === 0 ? '\nsystem-queue: PASS ✅' : `\nsystem-queue: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
