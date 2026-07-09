/**
 * Workflow runtime — the graph executor, ported from engine/runtime.ts with the
 * four host couplings (storage, cache/checkpoint, websocket, node executors)
 * replaced by injected providers. The traversal logic (topological order,
 * dependency resolution, checkpoint resume, timeout race) is preserved exactly.
 */
import type { WorkflowNode, WorkflowEdge, NodeExecutionStatus, NodeExecutionRecord, WorkflowData } from './types.js';
import { createWorkflowLogger, type LogLevel } from './logger.js';
import { validateWorkflowExecution } from './validation.js';
import {
    inMemoryWorkflowProvider, nullEvents,
    type WorkflowProvider, type WorkflowEvents, type ExecutorRegistry, type NodeExecutorContext,
} from './providers.js';
import { defaultExecutorRegistry } from './executors.js';

export interface WorkflowSettings {
    execution_timeout_ms?: number;
    cooldown_ms?: number;
    timezone?: string;
    log_level?: LogLevel;
    dlq_enabled?: boolean;
    [key: string]: unknown;
}

export interface ExecutionResult {
    status: 'completed' | 'error';
    result: Record<string, unknown>;
    error?: string;
    httpResponse?: { statusCode: number; body: unknown; headers?: Record<string, string>; contentType?: string };
    variableMutations?: Array<{ scope: string; key: string; value: unknown }>;
}

export interface ExecuteOptions {
    provider?: WorkflowProvider;
    events?: WorkflowEvents;
    executors?: ExecutorRegistry;
    settings?: WorkflowSettings;
    tenantSlug?: string;
}

interface Ctx extends NodeExecutorContext {
    nodeExecutions: NodeExecutionRecord[];
}

function setNodeStatus(ctx: Ctx, nodeId: string, status: NodeExecutionStatus, outputs?: Record<string, unknown>, error?: string): void {
    const rec = ctx.nodeExecutions.find((n) => n.nodeId === nodeId);
    if (rec) { rec.status = status; if (outputs) rec.outputs = outputs; if (error) rec.error = error; }
}

/**
 * Execute a workflow to completion. With no options it runs fully in-memory
 * (M1.1 standalone mode): no persistence, no events, control-flow executors only.
 */
export async function executeWorkflow(
    executionId: string,
    workflow: WorkflowData,
    inputParameters: Record<string, unknown>,
    opts: ExecuteOptions = {},
): Promise<ExecutionResult> {
    const provider = opts.provider ?? inMemoryWorkflowProvider();
    const events = opts.events ?? nullEvents;
    const executors = opts.executors ?? defaultExecutorRegistry();

    const s: WorkflowSettings = opts.settings || (workflow.settings ? JSON.parse(workflow.settings) : {});
    const timeoutMs = s.execution_timeout_ms || 30000;
    const cooldownMs = s.cooldown_ms || 0;
    const tz = s.timezone || 'UTC';
    const log = createWorkflowLogger(s.log_level || 'all', `[Workflow:${executionId.slice(0, 8)}]`);
    const formatTime = () => {
        try { return new Date().toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T'); }
        catch { return new Date().toISOString(); }
    };
    const emit = (type: string, data?: Record<string, unknown>) =>
        events.emit({ type, executionId, workflowId: workflow.id, data });

    const nodes: WorkflowNode[] = JSON.parse(workflow.nodes);
    const edges: WorkflowEdge[] = JSON.parse(workflow.edges);

    const ctx: Ctx = {
        executionId,
        workflowId: workflow.id,
        tenantSlug: opts.tenantSlug,
        parameters: inputParameters,
        nodeOutputs: {},
        variableMutations: [],
        nodeExecutions: nodes.map((n) => ({ nodeId: n.id, status: 'idle' as NodeExecutionStatus })),
    };

    async function coreExecute(): Promise<ExecutionResult> {
        try {
            const validation = validateWorkflowExecution(nodes);
            if (!validation.valid) {
                const messages = validation.errors.map((e) => e.message);
                log.error(`Validation failed, aborting: ${messages.join('; ')}`);
                await provider.updateExecution(executionId, { status: 'error', nodeExecutions: JSON.stringify(ctx.nodeExecutions), error: `Workflow validation failed: ${messages.join('; ')}`, endedAt: formatTime() });
                return { status: 'error', result: {}, error: `Workflow validation failed: ${messages.join('; ')}` };
            }

            // Checkpoint resume
            const checkpoint = await provider.loadCheckpoint(executionId);
            const executed = new Set<string>();
            if (checkpoint) {
                log.info(`Resuming from checkpoint (${checkpoint.completedNodes.length} nodes done)`);
                for (const id of checkpoint.completedNodes) executed.add(id);
                Object.assign(ctx.nodeOutputs, checkpoint.nodeOutputs);
                ctx.nodeExecutions = checkpoint.nodeExecutions;
            }

            await provider.updateExecution(executionId, { status: 'executing', nodeExecutions: JSON.stringify(ctx.nodeExecutions), endedAt: formatTime() });
            emit('executing', { nodes: nodes.length });

            // Start nodes: no incoming edges
            const targetNodeIds = new Set(edges.map((e) => e.target));
            const startNodes = nodes.filter((n) => !targetNodeIds.has(n.id));
            const queue = [...startNodes.map((n) => n.id)];

            while (queue.length > 0) {
                const nodeId = queue.shift()!;

                if (executed.has(nodeId)) {
                    for (const edge of edges.filter((e) => e.source === nodeId)) {
                        if (!executed.has(edge.target)) queue.push(edge.target);
                    }
                    continue;
                }

                const node = nodes.find((n) => n.id === nodeId);
                if (!node) continue;

                const incomingEdges = edges.filter((e) => e.target === nodeId);
                const dependenciesMet = incomingEdges.every((e) => executed.has(e.source));
                if (!dependenciesMet) { queue.push(nodeId); continue; }

                // Resolve inputs from connected nodes
                const inputs: Record<string, unknown> = {};
                for (const edge of incomingEdges) {
                    const sourceOutputs = ctx.nodeOutputs[edge.source] || {};
                    if (edge.targetInput && edge.sourceOutput) inputs[edge.targetInput] = sourceOutputs[edge.sourceOutput];
                }
                if (startNodes.some((n) => n.id === nodeId)) Object.assign(inputs, ctx.parameters);

                try {
                    setNodeStatus(ctx, nodeId, 'executing');
                    const executor = executors.resolve(node.type);
                    if (!executor) throw new Error(`executor_not_registered: ${node.type}`);
                    const outputs = await executor.execute(node as { id: string; type: string }, inputs, ctx);

                    ctx.nodeOutputs[nodeId] = outputs;
                    setNodeStatus(ctx, nodeId, 'completed', outputs);
                    executed.add(nodeId);
                    log.info(`Node ${node.type || nodeId} completed`);
                    emit('node_completed', { nodeId, nodeType: node.type });

                    await provider.saveCheckpoint({
                        executionId, workflowId: workflow.id,
                        completedNodes: Array.from(executed),
                        nodeOutputs: ctx.nodeOutputs,
                        nodeExecutions: ctx.nodeExecutions,
                    });

                    for (const edge of edges.filter((e) => e.source === nodeId)) {
                        if (!executed.has(edge.target)) queue.push(edge.target);
                    }
                } catch (error) {
                    const msg = (error as Error).message;
                    setNodeStatus(ctx, nodeId, 'error', undefined, msg);
                    log.error(`Node ${node?.type || nodeId} failed: ${msg}`);
                    emit('node_error', { nodeId, nodeType: node?.type, error: msg });
                    throw error; // leave checkpoint for retry
                }
            }

            // Final outputs: nodes with no outgoing edges
            const sourceNodeIds = new Set(edges.map((e) => e.source));
            const endNodes = nodes.filter((n) => !sourceNodeIds.has(n.id));
            const result: Record<string, unknown> = {};
            for (const node of endNodes) result[node.id] = ctx.nodeOutputs[node.id];

            const responseNode = endNodes.find((n) => n.type === 'http_response');
            let httpResponse: ExecutionResult['httpResponse'];
            if (responseNode && ctx.nodeOutputs[responseNode.id]) {
                const out = ctx.nodeOutputs[responseNode.id] as Record<string, unknown>;
                httpResponse = {
                    statusCode: (out.statusCode as number) || 200,
                    body: out.body,
                    headers: out.headers as Record<string, string> | undefined,
                    contentType: (out.contentType as string) || 'application/json',
                };
            }

            await provider.updateExecution(executionId, { status: 'completed', nodeExecutions: JSON.stringify(ctx.nodeExecutions), result: JSON.stringify(result), endedAt: formatTime() });
            await provider.clearCheckpoint(executionId);
            if (cooldownMs > 0) await provider.setCooldown(workflow.id, Math.ceil(cooldownMs / 1000));

            log.info(`Execution completed (${executed.size} nodes)`);
            emit('completed', { nodes: executed.size });
            return { status: 'completed', result, httpResponse, variableMutations: ctx.variableMutations };
        } catch (error) {
            const msg = (error as Error).message;
            if (s.dlq_enabled && provider.deadLetter) {
                try { await provider.deadLetter({ executionId, workflowId: workflow.id, error: msg, payload: JSON.stringify(inputParameters) }); } catch { /* best-effort */ }
            }
            await provider.updateExecution(executionId, { status: 'error', nodeExecutions: JSON.stringify(ctx.nodeExecutions), error: msg, endedAt: formatTime() });
            log.error(`Execution failed: ${msg}`);
            emit('error', { error: msg });
            return { status: 'error', result: {}, error: msg, variableMutations: ctx.variableMutations };
        }
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs}ms`)), timeoutMs));
    return Promise.race([coreExecute(), timeoutPromise]);
}
