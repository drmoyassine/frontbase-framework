/**
 * Workflow types — ported from services/edge/src/schemas/workflow.ts.
 *
 * The product schema is coupled to @hono/zod-openapi (`.openapi()` calls for
 * API doc generation). edge-core depends on plain zod only, so the `.openapi()`
 * decorations are stripped; the shapes are otherwise identical. The route-layer
 * request/response/webhook schemas are NOT ported (they belong to the console
 * API, @frontbase/backend, Phase 2).
 */
import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────────
export const TriggerTypeSchema = z.enum(['manual', 'http_webhook', 'scheduled', 'data_change', 'ui_event']);
export const ExecutionStatusSchema = z.enum(['started', 'executing', 'completed', 'error', 'cancelled']);
export const NodeExecutionStatusSchema = z.enum(['idle', 'executing', 'completed', 'error', 'skipped']);

// ── Base ───────────────────────────────────────────────────────────────────
export const NodePositionSchema = z.object({ x: z.number(), y: z.number() });

export const ParameterSchema = z.object({
    name: z.string(),
    type: z.string(),
    value: z.any().optional().nullable(),
    description: z.string().optional().nullable(),
    required: z.boolean().optional().nullable(),
}).passthrough();

export const WorkflowNodeSchema = z.object({
    id: z.string(),
    type: z.string(),                            // ReactFlow: root-level type
    position: NodePositionSchema,
    data: z.object({                             // ReactFlow: node data wrapper
        label: z.string().optional().nullable(),
        type: z.string().optional().nullable(),
        inputs: z.array(ParameterSchema).optional().nullable(),
        outputs: z.array(ParameterSchema).optional().nullable(),
    }).passthrough().optional().nullable(),
    name: z.string().optional().nullable(),      // legacy direct properties
    inputs: z.array(ParameterSchema).optional().nullable(),
    outputs: z.array(ParameterSchema).optional().nullable(),
    error: z.string().optional().nullable(),
}).passthrough();

export const WorkflowEdgeSchema = z.object({
    id: z.string().optional(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
    sourceOutput: z.string().optional(),         // legacy
    targetInput: z.string().optional(),
}).passthrough();

export const WorkflowSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    triggerType: z.string(),
    triggerConfig: z.record(z.any()).optional().nullable(),
    nodes: z.array(WorkflowNodeSchema),
    edges: z.array(WorkflowEdgeSchema),
    version: z.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional().nullable(),
});

export const NodeExecutionSchema = z.object({
    nodeId: z.string(),
    status: NodeExecutionStatusSchema,
    outputs: z.record(z.any()).optional(),
    error: z.string().optional(),
    usage: z.number().optional(),
});

// ── Type exports ─────────────────────────────────────────────────────────
export type TriggerType = z.infer<typeof TriggerTypeSchema>;
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;
export type NodeExecutionStatus = z.infer<typeof NodeExecutionStatusSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type NodeExecutionRecord = z.infer<typeof NodeExecutionSchema>;

/**
 * Stored/deployable workflow — nodes and edges as JSON strings (the shape the
 * runtime parses). Mirrors the product's storage `WorkflowData`.
 */
export interface WorkflowData {
    id: string;
    name: string;
    nodes: string;                               // JSON WorkflowNode[]
    edges: string;                               // JSON WorkflowEdge[]
    settings?: string;                           // JSON WorkflowSettings
    tenantSlug?: string;
}
