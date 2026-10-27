/**
 * Async workflow dispatch gate (Phase 3c / F3b). Proves that when a dispatcher is
 * configured, POST /execute returns immediately with status 'running' and the
 * workflow completes in the background (the execution record flips to completed).
 */
import { createConsole } from '../dist/index.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// A dispatcher that queues work and lets the test flush it on demand.
const queue = [];
const flush = async () => { while (queue.length) { const work = queue.shift(); await work(); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
let clock = 0;
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-A' }),
    dispatcher: (work) => { queue.push(work); }, // fire-and-track: don't run inline
    now: () => `2026-07-12T00:00:${String(clock++).padStart(2, '0')}Z`,
});

const req = (method, path, body) => app.fetch(new Request('http://x' + path, {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
}));

// A valid executable workflow: trigger → transform (terminal).
const pos = { x: 0, y: 0 };
const nodes = JSON.stringify([
    { id: 'a', type: 'trigger', position: pos },
    { id: 'b', type: 'transform', position: pos, inputs: [{ name: 'expression', value: 'value' }] },
]);
const edges = JSON.stringify([{ source: 'a', target: 'b', sourceOutput: 'value', targetInput: 'value' }]);

await req('PUT', '/automations/wf-async', { name: 'Async', nodes, edges, isActive: true });

// ---- 1. Execute returns immediately with 'running' (not 'completed') ----
const exec = await req('POST', '/automations/wf-async/execute', { trigger: 'manual', input: { value: 42 } });
const execBody = await exec.json();
check('async execute → 200', exec.status === 200);
check('async execute returns status=running immediately', execBody.status === 'running');
check('executionId returned', typeof execBody.executionId === 'string');

// ---- 2. Before flushing, the execution is recorded as 'running' (not yet completed) ----
const beforeFlush = await (await req('GET', '/automations/wf-async/executions')).json();
check('execution recorded as running before flush', beforeFlush.executions[0]?.status === 'running');

// ---- 3. Flush the dispatcher — the workflow runs in the background ----
await flush();

const afterFlush = await (await req('GET', '/automations/wf-async/executions')).json();
check('execution flipped to completed after flush', afterFlush.executions[0]?.status === 'completed');
check('result recorded after background run', (() => {
    try { const r = JSON.parse(afterFlush.executions[0]?.result ?? '{}'); return r && typeof r === 'object'; } catch { return false; }
})());

// ---- 4. Sync mode (no dispatcher) still works — verify via a fresh console ----
const syncApp = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-B' }),
    now: () => `2026-07-12T00:00:${String(clock++).padStart(2, '0')}Z`,
    // no dispatcher → synchronous
});
const sreq = (method, path, body) => syncApp.fetch(new Request('http://x' + path, {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
}));
await sreq('PUT', '/automations/wf-sync', { name: 'Sync', nodes, edges, isActive: true });
const syncExec = await sreq('POST', '/automations/wf-sync/execute', { input: { value: 7 } });
const syncBody = await syncExec.json();
check('sync execute (no dispatcher) returns completed', syncBody.status === 'completed');

console.log(failures === 0 ? '\nasync-execution: PASS ✅' : `\nasync-execution: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
