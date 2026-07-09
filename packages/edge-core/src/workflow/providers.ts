/**
 * Workflow provider seams — the four couplings the product runtime hard-wires
 * (storage, cache/checkpoint, websocket, node executors), lifted to interfaces
 * with in-memory / null defaults so workflows execute standalone (M1.1 criterion).
 *
 * Durable implementations (Turso state, Upstash cache, qstash queue, CF WebSocket
 * broadcast) belong to @frontbase/edge-infra (M2.1).
 */
import type { ExecutionStatus, NodeExecutionRecord, WorkflowData } from './types.js';

// ── 1. WorkflowProvider — replaces stateProvider + cacheProvider ────────────
export interface Checkpoint {
    executionId: string;
    workflowId: string;
    completedNodes: string[];
    nodeOutputs: Record<string, Record<string, unknown>>;
    nodeExecutions: NodeExecutionRecord[];
}

export interface WorkflowProvider {
    getWorkflow?(id: string): Promise<WorkflowData | null>;
    saveCheckpoint(cp: Checkpoint): Promise<void>;
    loadCheckpoint(executionId: string): Promise<Checkpoint | null>;
    clearCheckpoint(executionId: string): Promise<void>;
    updateExecution(executionId: string, patch: { status: ExecutionStatus; nodeExecutions: string; result?: string; error?: string; endedAt: string }): Promise<void>;
    setCooldown(workflowId: string, seconds: number): Promise<void>;
    deadLetter?(entry: { executionId: string; workflowId: string; error: string; payload: string }): Promise<void>;
}

/** Default: everything in a Map; nothing survives the process. */
export function inMemoryWorkflowProvider(): WorkflowProvider {
    const checkpoints = new Map<string, Checkpoint>();
    const executions = new Map<string, unknown>();
    const cooldowns = new Map<string, number>();
    return {
        async saveCheckpoint(cp) { checkpoints.set(cp.executionId, cp); },
        async loadCheckpoint(id) { return checkpoints.get(id) ?? null; },
        async clearCheckpoint(id) { checkpoints.delete(id); },
        async updateExecution(id, patch) { executions.set(id, patch); },
        async setCooldown(workflowId, seconds) { cooldowns.set(workflowId, Date.now() + seconds * 1000); },
    };
}

// ── 2. WorkflowEvents — replaces broadcastExecutionEvent / websocket ────────
export interface ExecutionEvent {
    type: string;
    executionId: string;
    workflowId: string;
    data?: Record<string, unknown>;
}
export interface WorkflowEvents {
    emit(event: ExecutionEvent): void;
}
export const nullEvents: WorkflowEvents = { emit() { /* no-op */ } };

// ── 3. NodeExecutor registry — replaces the monolithic node-executors.ts ────
export interface NodeExecutorContext {
    executionId: string;
    workflowId: string;
    tenantSlug?: string;
    parameters: Record<string, unknown>;
    nodeOutputs: Record<string, Record<string, unknown>>;
    variableMutations: Array<{ scope: string; key: string; value: unknown }>;
}

export interface NodeExecutor {
    /** Node type(s) this executor handles. */
    readonly types: string[];
    execute(node: { id: string; type: string; inputs?: unknown; data?: unknown }, inputs: Record<string, unknown>, ctx: NodeExecutorContext): Promise<Record<string, unknown>>;
}

export class ExecutorRegistry {
    private map = new Map<string, NodeExecutor>();
    register(executor: NodeExecutor): this {
        for (const t of executor.types) this.map.set(t, executor);
        return this;
    }
    resolve(nodeType: string): NodeExecutor | undefined {
        return this.map.get(nodeType);
    }
}
