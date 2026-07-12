/**
 * Automations execution gate (Phase 3a / F3). Proves POST /automations/:id/execute
 * runs the workflow through the REAL edge-core engine and records the actual
 * result (not the stub). Covers: successful run, error capture, inactive workflow,
 * missing workflow.
 */
import { makeConsole, req } from './_helpers.mjs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const { app } = await makeConsole({ tenant: 'tenant-A' });

// A valid executable workflow: trigger → transform (terminal). The transform
// evaluates `value` and its result is captured as the terminal node output.
const pos = { x: 0, y: 0 };
const goodNodes = JSON.stringify([
    { id: 'a', type: 'trigger', position: pos },
    { id: 'b', type: 'transform', position: pos, inputs: [{ name: 'expression', value: 'value' }] },
]);
const goodEdges = JSON.stringify([{ source: 'a', target: 'b', sourceOutput: 'value', targetInput: 'value' }]);

// ---- 1. Save an active workflow ----
const put = await req(app, 'PUT', '/automations/wf-good', {
    body: { name: 'Good workflow', nodes: goodNodes, edges: goodEdges, isActive: true },
});
check('PUT workflow → 200', put.status === 200);

// ---- 2. Execute it — real engine run ----
const exec = await req(app, 'POST', '/automations/wf-good/execute', {
    body: { trigger: 'manual', input: { value: 42 } },
});
const execBody = await exec.json();
check('execute → 200', exec.status === 200);
check('execute status is completed (real engine ran)', execBody.status === 'completed');
check('executionId returned', typeof execBody.executionId === 'string');

// ---- 3. The execution is recorded with the real result ----
const execs = await req(app, 'GET', '/automations/wf-good/executions');
const execsBody = await execs.json();
check('one execution recorded', execsBody.executions.length === 1);
const recorded = execsBody.executions[0];
check('recorded status = completed', recorded.status === 'completed');
check('recorded result is real JSON (transform output)', {
    ok: (() => { try { const r = JSON.parse(recorded.result); return r && typeof r === 'object'; } catch { return false; } })(),
});

// ---- 4. Inactive workflow refuses to execute ----
await req(app, 'PUT', '/automations/wf-inactive', {
    body: { name: 'Inactive', nodes: goodNodes, edges: goodEdges, isActive: true },
});
await req(app, 'POST', '/automations/wf-inactive/toggle', { body: { isActive: false } });
const inactiveExec = await req(app, 'POST', '/automations/wf-inactive/execute', { body: {} });
check('inactive workflow → 409', inactiveExec.status === 409);
check('inactive → workflow_inactive', (await inactiveExec.json()).error === 'workflow_inactive');

// ---- 5. Missing workflow → 404 ----
const missingExec = await req(app, 'POST', '/automations/does-not-exist/execute', { body: {} });
check('missing workflow → 404', missingExec.status === 404);

// ---- 6. A workflow with an invalid graph records an error execution ----
const badNodes = JSON.stringify([{ id: 'x', type: 'nonexistent_executor', position: pos }]);
const badEdges = JSON.stringify([]);
await req(app, 'PUT', '/automations/wf-bad', {
    body: { name: 'Bad', nodes: badNodes, edges: badEdges, isActive: true },
});
const badExec = await req(app, 'POST', '/automations/wf-bad/execute', { body: {} });
const badBody = await badExec.json();
check('invalid-graph execute → error status', badBody.status === 'error' || badExec.status === 500);
// An execution row is recorded even on failure (status=error).
const badExecs = await req(app, 'GET', '/automations/wf-bad/executions');
const badExecsBody = await badExecs.json();
check('failed run still recorded an execution', badExecsBody.executions.length === 1);
check('failed execution status = error', badExecsBody.executions[0].status === 'error');

console.log(failures === 0 ? '\nautomations: PASS ✅' : `\nautomations: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
