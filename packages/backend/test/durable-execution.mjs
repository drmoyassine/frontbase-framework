/**
 * F3b-durable gate — recovery sweep + idempotent completion for stuck executions.
 * All local (no creds). 6 scenarios from the sprint plan S2.6.
 */
import { createConsole } from '../dist/index.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { recoverStuckExecutions } from '../dist/routes/phase2.js';
import { Phase2Store } from '../dist/db/phase2-store.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// A dispatcher that queues work for deterministic flushing (same shape as async-execution.mjs).
let clock = 0;
const queue = [];
const flush = async () => { while (queue.length) { const w = queue.shift(); await w(); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'master', role: 'master_admin' }, tenant: 'tenant-A' }),
    dispatcher: (work) => { queue.push(work); }, // fire-and-track; boot recovery also lands here
    now: () => `2026-07-13T00:00:${String(clock++).padStart(2, '0')}Z`,
});
// Drain the boot-time recovery sweep (no stuck rows yet — no-op).
await flush();

const req = (m, p, b) => app.fetch(new Request('http://x' + p, {
    method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b),
}));

// A valid executable workflow: trigger → transform (terminal).
const pos = { x: 0, y: 0 };
const nodes = JSON.stringify([
    { id: 'a', type: 'trigger', position: pos },
    { id: 'b', type: 'transform', position: pos, inputs: [{ name: 'expression', value: 'value' }] },
]);
const edges = JSON.stringify([{ source: 'a', target: 'b', sourceOutput: 'value', targetInput: 'value' }]);
await req('PUT', '/automations/wf1', { name: 'WF1', nodes, edges, isActive: true });

// ---- 1. Input persisted ----
const exec = await (await req('POST', '/automations/wf1/execute', { input: { value: 42 } })).json();
await flush(); // let the async run complete
const row = await (await req('GET', `/automations/wf1/executions`)).json();
check('input persisted on the execution row', row.executions[0]?.input === JSON.stringify({ value: 42 }));

// Direct store check: the input column holds JSON.
const rawRow = (await runner.query(`SELECT input FROM workflow_executions WHERE id = ?`, [exec.executionId]))[0];
check('input column holds the JSON payload', rawRow.input === '{"value":42}');

// ---- 2. Idempotent complete (guard on status='running') ----
// row is already 'completed' (from flush). A second completeExecution with different
// args must NOT overwrite it.
const store = await import('../dist/db/phase2-store.js').then(m => new m.Phase2Store(runner, 'tenant-A'));
await store.completeExecution(exec.executionId, 'error', '{"x":1}', 'late', '2099-01-01');
const afterSecond = await store.getExecution(exec.executionId);
check('idempotent complete: terminal row not clobbered', afterSecond.status === 'completed' && afterSecond.ended_at !== '2099-01-01');

// ---- 3. Recovery re-runs a stuck run ----
// Insert a 'running' row with an OLD started_at + a valid workflow + persisted input.
const stuckId = 'exec-stuck-1';
await runner.exec(
    `INSERT INTO workflow_executions (id, tenant_slug, workflow_id, status, trigger, input, started_at) VALUES (?,?,?,?,?,?,?)`,
    [stuckId, 'tenant-A', 'wf1', 'running', 'manual', JSON.stringify({ value: 7 }), '2000-01-01T00:00:00Z'],
);
const rec1 = await recoverStuckExecutions((t) => new Phase2Store(runner, t), () => '2026-07-13T12:00:00Z', '2099-01-01');
const stuckAfter = await store.getExecution(stuckId);
check('recovery re-ran the stuck execution (recovered>0)', rec1.recovered >= 1);
check('stuck row flipped to completed', stuckAfter.status === 'completed');
check('stuck row has a real result', (() => { try { return !!JSON.parse(stuckAfter.result ?? '{}'); } catch { return false; } })());

// ---- 4. Recovery of a deleted workflow → error: workflow_deleted ----
const stuckOrphan = 'exec-stuck-orphan';
await runner.exec(
    `INSERT INTO workflow_executions (id, tenant_slug, workflow_id, status, trigger, input, started_at) VALUES (?,?,?,?,?,?,?)`,
    [stuckOrphan, 'tenant-A', 'gone-wf', 'running', 'manual', '{}', '2000-01-01T00:00:00Z'],
);
await recoverStuckExecutions((t) => new Phase2Store(runner, t), () => '2026-07-13T12:00:00Z', '2099-01-01');
const orphanAfter = await store.getExecution(stuckOrphan);
check('deleted-workflow stuck row → error', orphanAfter.status === 'error');
check('deleted-workflow error = workflow_deleted', orphanAfter.error === 'workflow_deleted');

// ---- 5. Recovery is idempotent with a late original ----
// A row already completed by recovery; a second recovery pass does nothing harmful.
const before = await store.getExecution(stuckId);
await recoverStuckExecutions((t) => new Phase2Store(runner, t), () => '2026-07-13T12:00:00Z', '2099-01-01');
const after = await store.getExecution(stuckId);
check('second recovery pass leaves terminal row intact', after.status === before.status && after.ended_at === before.ended_at);

// ---- 6. POST /automations/_recover ----
// Seed another stuck row so the route has something to recover.
await runner.exec(
    `INSERT INTO workflow_executions (id, tenant_slug, workflow_id, status, trigger, input, started_at) VALUES (?,?,?,?,?,?,?)`,
    ['exec-stuck-route', 'tenant-A', 'wf1', 'running', 'manual', '{}', '2000-01-01T00:00:00Z'],
);
const recoverRes = await req('POST', '/automations/_recover?ageMinutes=1');
const recoverBody = await recoverRes.json();
check('POST /automations/_recover → 200 (master_admin)', recoverRes.status === 200);
check('route returns recovered count', typeof recoverBody.recovered === 'number' && recoverBody.recovered >= 1);

// Non-master principal → 401/403.
const userApp = await createConsole({
    makeRunner: async () => sqliteRunner(':memory:'),
    resolvePrincipal: async () => ({ user: { id: 'u', role: 'owner' }, tenant: 'tenant-A' }),
    now: () => '2026-07-13T00:00:00Z',
});
const denied = await userApp.fetch(new Request('http://x/automations/_recover', { method: 'POST' }));
check('non-master → denied (401/403)', denied.status === 401 || denied.status === 403);

console.log(failures === 0 ? '\ndurable-execution: PASS ✅' : `\ndurable-execution: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
