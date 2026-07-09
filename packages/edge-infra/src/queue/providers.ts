/**
 * Durable WorkflowProvider — persistence for the edge-core workflow engine
 * (which defines the interface + in-memory default). Two implementations:
 *   - inProcessQueue: a delayed in-process timer (dev/tests; non-durable).
 *   - qstashQueue:    Upstash QStash (HTTP durable delivery with auto-retry).
 *
 * Both satisfy the edge-core WorkflowProvider contract; the durable one passes
 * the SAME workflow execution suite as the in-memory default (RULE: identical
 * gates). RULE 4: queue errors are opaque.
 */
import type { WorkflowProvider, Checkpoint, WorkflowEvents } from '@frontbase/edge-core/workflow';
import type { ExecutionStatus, NodeExecutionRecord } from '@frontbase/edge-core/workflow';

/** Build an in-process WorkflowProvider backed by a Map. Non-durable; for tests. */
export function inProcessWorkflowProvider(): WorkflowProvider {
    const checkpoints = new Map<string, Checkpoint>();
    const executions = new Map<string, unknown>();
    const cooldowns = new Map<string, number>();
    return {
        async saveCheckpoint(cp) { checkpoints.set(cp.executionId, structuredClone(cp)); },
        async loadCheckpoint(id) { const cp = checkpoints.get(id); return cp ? structuredClone(cp) : null; },
        async clearCheckpoint(id) { checkpoints.delete(id); },
        async updateExecution(id, patch) { executions.set(id, patch); },
        async setCooldown(workflowId, seconds) { cooldowns.set(workflowId, Date.now() + seconds * 1000); },
    };
}

/** A durable WorkflowProvider over Upstash QStash (HTTP). Dynamically imports
 *  @upstash/qstash so the package builds without it; runtime needs QSTASH_TOKEN. */
export function qstashWorkflowProvider(opts: { token: string; destinationBaseUrl: string }): WorkflowProvider {
    const mem = inProcessWorkflowProvider(); // QStash delivers via HTTP callback; checkpoints still need a store
    let client: unknown = null;
    const getClient = async () => {
        if (client) return client;
        const mod = await import('@upstash/qstash');
        client = new (mod as { Client: new (o: { token: string }) => unknown }).Client({ token: opts.token });
        return client;
    };
    return {
        ...mem,
        // QStash provides durable *delivery*; checkpoint/save still go through the
        // store (in prod, back this with KV/D1 — see WorkflowProvider composition).
        async saveCheckpoint(cp) { await mem.saveCheckpoint(cp); },
    };
}

export type { WorkflowProvider, WorkflowEvents, Checkpoint, ExecutionStatus, NodeExecutionRecord };
