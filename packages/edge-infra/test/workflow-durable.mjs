/**
 * Workflow-durable test (M2.1.6) — the durable WorkflowProvider satisfies the
 * edge-core workflow execution contract: a workflow runs to completion, a
 * checkpoint resumes from a pre-seeded completed node, and provider data is
 * copied (RULE 3) so two executions don't share checkpoint state.
 */
import { executeWorkflow, inMemoryWorkflowProvider, defaultExecutorRegistry, ExecutorRegistry } from '@frontbase/edge-core/workflow';
import { inProcessWorkflowProvider } from '../dist/queue/providers.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const uuid = () => '00000000-0000-0000-0000-' + String(Math.floor(Math.random() * 1e12)).padStart(12, '0');
const pos = { x: 0, y: 0 };

// 1. A simple workflow runs through the durable provider (same contract as in-memory)
const nodes = [
    { id: 'a', type: 'trigger', position: pos },
    { id: 'b', type: 'log', position: pos, inputs: [{ name: 'message', value: 'hello' }] },
];
const edges = [{ source: 'a', target: 'b' }];
const wfId = uuid();
const provider = inProcessWorkflowProvider();
const r = await executeWorkflow(uuid(), { id: wfId, name: 't', nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) }, {}, { provider });
check('workflow completes through the durable provider', r.status === 'completed');

// 2. Checkpoint resume: pre-seed a checkpoint marking 'a' done; only 'b' runs
const provider2 = inProcessWorkflowProvider();
const execId = uuid();
await provider2.saveCheckpoint({
    executionId: execId, workflowId: wfId, completedNodes: ['a'],
    nodeOutputs: { a: { skipped: true } },
    nodeExecutions: [{ nodeId: 'a', status: 'completed' }, { nodeId: 'b', status: 'idle' }],
});
let bRan = false;
const executors = new ExecutorRegistry()
    .register({ types: ['trigger'], async execute() { throw new Error('a must NOT run — checkpointed'); } })
    .register({ types: ['log'], async execute() { bRan = true; return { logged: true }; } });
const r2 = await executeWorkflow(execId, { id: wfId, name: 't', nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) }, {}, { provider: provider2, executors });
check('checkpoint resume skips completed node', r2.status === 'completed' && bRan === true);

// 3. RULE 3: loadCheckpoint returns a copy — mutating one result doesn't corrupt
//    the store or another read. (Tested directly on a seeded checkpoint; note
//    executeWorkflow clears the checkpoint on completion, so we seed fresh.)
const p3 = inProcessWorkflowProvider();
await p3.saveCheckpoint({ executionId: 'e3', workflowId: 'w3', completedNodes: ['x'], nodeOutputs: {}, nodeExecutions: [{ nodeId: 'x', status: 'completed' }] });
const c1 = await p3.loadCheckpoint('e3');
const c2 = await p3.loadCheckpoint('e3');
if (c1) c1.completedNodes.push('MUTATED');
check('RULE 3: loadCheckpoint returns a copy', c2 !== null && !c2.completedNodes.includes('MUTATED'));

console.log(failures === 0 ? '\nworkflow-durable: PASS ✅' : `\nworkflow-durable: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
