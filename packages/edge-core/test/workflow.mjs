/**
 * M1.1 workflow acceptance — workflows execute standalone (in-memory mode).
 *
 * Builds real node/edge graphs and runs them through executeWorkflow() with
 * no options (in-memory provider, null events, control-flow executors), then
 * asserts traversal, branching, variable mutation, http, checkpoint resume,
 * and the executor_not_registered path for AI nodes (edge-infra territory).
 */
import { executeWorkflow, inMemoryWorkflowProvider, defaultExecutorRegistry, ExecutorRegistry } from '../dist/workflow/index.js';

let failures = 0;
const ok = (l) => console.log(`  ✅ ${l}`);
const bad = (l) => { failures++; console.log(`  ❌ ${l}`); };
const check = (l, c) => (c ? ok(l) : bad(l));

const uuid = () => '00000000-0000-0000-0000-' + String(Math.floor(Math.random() * 1e12)).padStart(12, '0');

function wf(nodes, edges, settings) {
    return { id: uuid(), name: 'test', nodes: JSON.stringify(nodes), edges: JSON.stringify(edges), settings: settings ? JSON.stringify(settings) : undefined };
}
const pos = { x: 0, y: 0 };

// 1. Linear traversal: trigger → transform → http_response.
//    `result` holds END-node outputs only, so the transform (mid-graph) is
//    verified through the http_response node it feeds, plus the terminal shape.
{
    const nodes = [
        { id: 'a', type: 'trigger', position: pos },
        { id: 'b', type: 'transform', position: pos, inputs: [{ name: 'expression', value: 'value' }] },
        { id: 'c', type: 'http_response', position: pos, inputs: [{ name: 'statusCode', value: 201 }, { name: 'body', value: 'ok' }] },
    ];
    const edges = [
        { source: 'a', target: 'b', sourceOutput: 'value', targetInput: 'value' },
        { source: 'b', target: 'c' },
    ];
    const r = await executeWorkflow(uuid(), wf(nodes, edges), { value: 42 }, {});
    check('linear workflow completes', r.status === 'completed');
    check('http_response surfaced with statusCode 201', r.httpResponse?.statusCode === 201);
    check('end-node result captured (c is the terminal node)', r.result.c?.statusCode === 201);
}

// 1b. Transform output verified directly by making it the terminal node.
{
    const nodes = [
        { id: 'a', type: 'trigger', position: pos },
        { id: 'b', type: 'transform', position: pos, inputs: [{ name: 'expression', value: 'value' }] },
    ];
    const edges = [{ source: 'a', target: 'b', sourceOutput: 'value', targetInput: 'value' }];
    const r = await executeWorkflow(uuid(), wf(nodes, edges), { value: 42 }, {});
    check('transform evaluated expression (value=42)', r.result.b?.result === 42);
}

// 2. Branch/condition node — the condition node is the START node so it
//    receives workflow parameters directly (mirrors a trigger-less test flow).
{
    const nodes = [
        { id: 'b', type: 'condition', position: pos, inputs: [{ name: 'condition', value: 'n > 10' }] },
    ];
    const edges = [];
    const r = await executeWorkflow(uuid(), wf(nodes, edges), { n: 20 }, {});
    check('condition true-branch taken', r.result.b?.branch === 'true');
    const r2 = await executeWorkflow(uuid(), wf(nodes, edges), { n: 5 }, {});
    check('condition false-branch taken', r2.result.b?.branch === 'false');
}

// 3. set_variable → variableMutations recorded
{
    const nodes = [
        { id: 'a', type: 'trigger', position: pos },
        { id: 'b', type: 'set_variable', position: pos, inputs: [{ name: 'scope', value: 'session' }, { name: 'key', value: 'plan' }, { name: 'value', value: "'pro'" }] },
    ];
    const edges = [{ source: 'a', target: 'b' }];
    const r = await executeWorkflow(uuid(), wf(nodes, edges), {}, {});
    const m = r.variableMutations?.[0];
    check('variable mutation recorded (session/plan/pro)', m?.scope === 'session' && m?.key === 'plan' && m?.value === 'pro');
}

// 4. http_request against a mock fetch
{
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => ({ status: 200, ok: true, json: async () => ({ url, rows: [1, 2, 3] }) });
    const nodes = [
        { id: 'a', type: 'trigger', position: pos },
        { id: 'b', type: 'http_request', position: pos, inputs: [{ name: 'url', value: 'https://api.test/x' }, { name: 'method', value: 'GET' }] },
    ];
    const edges = [{ source: 'a', target: 'b' }];
    const r = await executeWorkflow(uuid(), wf(nodes, edges), {}, {});
    check('http_request node returns fetched data', r.result.b?.ok === true && r.result.b?.data?.rows?.length === 3);
    globalThis.fetch = realFetch;
}

// 5. Validation: missing required field aborts
{
    const nodes = [{ id: 'a', type: 'set_variable', position: pos, inputs: [{ name: 'scope', value: 'page' }] }]; // missing key+value
    const r = await executeWorkflow(uuid(), wf(nodes, []), {}, {});
    check('missing required fields → error status', r.status === 'error' && /validation failed/i.test(r.error || ''));
}

// 6. Unregistered (AI) node → executor_not_registered
{
    const nodes = [
        { id: 'a', type: 'trigger', position: pos },
        { id: 'b', type: 'ai.chat', position: pos },
    ];
    const edges = [{ source: 'a', target: 'b' }];
    const r = await executeWorkflow(uuid(), wf(nodes, edges), {}, {});
    check('AI node without edge-infra → error', r.status === 'error' && /executor_not_registered: ai\.chat/.test(r.error || ''));
}

// 7. Checkpoint resume: a shared provider skips already-completed nodes
{
    const provider = inMemoryWorkflowProvider();
    // Pre-seed a checkpoint marking 'a' complete
    const wfId = uuid();
    const execId = uuid();
    await provider.saveCheckpoint({ executionId: execId, workflowId: wfId, completedNodes: ['a'], nodeOutputs: { a: { seeded: true } }, nodeExecutions: [{ nodeId: 'a', status: 'completed' }, { nodeId: 'b', status: 'idle' }] });
    let bRan = false;
    const executors = new ExecutorRegistry().register({ types: ['trigger'], async execute() { throw new Error('a should NOT run — it was checkpointed'); } })
        .register({ types: ['sink'], async execute() { bRan = true; return { done: true }; } });
    const nodes = [{ id: 'a', type: 'trigger', position: pos }, { id: 'b', type: 'sink', position: pos }];
    const edges = [{ source: 'a', target: 'b' }];
    const r = await executeWorkflow(execId, { id: wfId, name: 't', nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) }, {}, { provider, executors });
    check('checkpoint resume skips completed node, runs the rest', r.status === 'completed' && bRan === true);
}

// 8. Custom executor registry extends the built-ins (edge-infra pattern)
{
    const executors = defaultExecutorRegistry().register({ types: ['ai.chat'], async execute() { return { text: 'hello from mock AI' }; } });
    const nodes = [{ id: 'a', type: 'trigger', position: pos }, { id: 'b', type: 'ai.chat', position: pos }];
    const edges = [{ source: 'a', target: 'b' }];
    const r = await executeWorkflow(uuid(), wf(nodes, edges), {}, { executors });
    check('registering ai.chat makes it runnable', r.status === 'completed' && r.result.b?.text === 'hello from mock AI');
}

console.log(failures === 0 ? '\nworkflow: PASS ✅' : `\nworkflow: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
