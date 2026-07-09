/**
 * @frontbase/edge-core/workflow — the standalone workflow engine.
 *
 * SEPARATE subpath export (not re-exported from the package root) so the
 * service-worker bundle can exclude it entirely: workflows execute on the edge
 * only, never in the browser (M1.1 size-budget mitigation).
 */
export { executeWorkflow, type ExecutionResult, type ExecuteOptions, type WorkflowSettings } from './runtime.js';
export {
    inMemoryWorkflowProvider, nullEvents, ExecutorRegistry,
    type WorkflowProvider, type WorkflowEvents, type NodeExecutor, type NodeExecutorContext, type ExecutionEvent, type Checkpoint,
} from './providers.js';
export { defaultExecutorRegistry } from './executors.js';
export { validateWorkflowExecution, validateNode, type WorkflowValidationResult, type NodeValidationError } from './validation.js';
export { safeEval, getPath, normalizeExpression } from './expr.js';
export { createWorkflowLogger, type LogLevel, type WorkflowLogger } from './logger.js';
export type { Workflow, WorkflowNode, WorkflowEdge, WorkflowData, NodeExecutionRecord, ExecutionStatus, NodeExecutionStatus, TriggerType } from './types.js';
