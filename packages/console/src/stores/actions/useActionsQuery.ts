/**
 * Actions API Hooks - React Query
 * 
 * Handles server state for workflow drafts and executions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';

// Types matching the Pydantic schemas
export interface WorkflowNode {
    id: string;
    name: string;
    type: string;
    position: { x: number; y: number };
    inputs: Array<{ name: string; type: string; value?: any; description?: string; required?: boolean }>;
    outputs: Array<{ name: string; type: string }>;
}

export interface WorkflowEdge {
    source: string;
    target: string;
    sourceOutput: string;
    targetInput: string;
}

export interface WorkflowDraft {
    id: string;
    name: string;
    description?: string;
    trigger_type: string;
    trigger_config?: Record<string, any>;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    settings?: Record<string, any> | null;
    is_published: boolean;
    is_active: boolean;
    published_version?: number;
    deployed_engines?: Record<string, { name: string; url: string; deployed_at: string; is_active?: boolean; deployed_version_hash?: string }>;
    content_hash?: string;
    created_at: string;
    updated_at: string;
    created_by?: string;
}

export interface CreateDraftInput {
    name: string;
    description?: string;
    trigger_type?: string;
    trigger_config?: Record<string, any>;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
}

export interface UpdateDraftInput {
    name?: string;
    description?: string;
    trigger_type?: string;
    trigger_config?: Record<string, any>;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    settings?: Record<string, any> | null;
}

const API_BASE = '/api/actions';

// ============ API Functions ============

async function fetchDrafts(): Promise<{ drafts: WorkflowDraft[]; total: number }> {
    const response = await fetch(`${API_BASE}/drafts`);
    if (!response.ok) throw new Error('Failed to fetch drafts');
    return response.json();
}

async function fetchDraft(id: string): Promise<WorkflowDraft> {
    const response = await fetch(`${API_BASE}/drafts/${id}`);
    if (!response.ok) throw new Error('Failed to fetch draft');
    return response.json();
}

async function createDraft(input: CreateDraftInput): Promise<WorkflowDraft> {
    const response = await fetch(`${API_BASE}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to create draft');
    }
    return response.json();
}

async function updateDraft(id: string, input: UpdateDraftInput): Promise<WorkflowDraft> {
    const response = await fetch(`${API_BASE}/drafts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to update draft');
    }
    return response.json();
}

async function deleteDraft(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/drafts/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete draft');
}

async function bulkDeleteDrafts(ids: string[]): Promise<{ deleted: number }> {
    const response = await fetch(`${API_BASE}/drafts/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
    });
    if (!response.ok) throw new Error('Failed to delete drafts');
    return response.json();
}

async function publishDraft(id: string): Promise<{ success: boolean; workflow_id: string; version: number }> {
    const response = await fetch(`${API_BASE}/drafts/${id}/publish`, {
        method: 'POST',
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to publish');
    }
    return response.json();
}

async function publishDraftToEngine(
    { draftId, engineId }: { draftId: string; engineId: string }
): Promise<{ success: boolean; workflow_id: string; version: number; message: string }> {
    const response = await fetch(`${API_BASE}/drafts/${draftId}/publish/${engineId}/`, {
        method: 'POST',
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to publish to engine');
    }
    return response.json();
}

async function publishDraftBatch(
    { draftId, engineIds }: { draftId: string; engineIds: string[] }
): Promise<{ success: boolean; message: string; results: Array<{ engineId: string; name: string; success: boolean; error?: string }> }> {
    const response = await fetch(`${API_BASE}/drafts/${draftId}/publish-batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine_ids: engineIds }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to batch publish');
    }
    return response.json();
}

async function toggleTargetActive(
    { draftId, engineId, is_active }: { draftId: string; engineId: string; is_active: boolean }
): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/drafts/${draftId}/publish/${engineId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to toggle target');
    }
    return response.json();
}

async function testDraft(id: string, parameters?: Record<string, any>): Promise<{ execution_id: string; status: string }> {
    const response = await fetch(`${API_BASE}/drafts/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to test');
    }
    return response.json();
}

// ============ React Query Hooks ============

export function useWorkflowDrafts() {
    return useQuery({
        queryKey: ['workflow-drafts'],
        queryFn: fetchDrafts,
        staleTime: STALE.DEFAULT,
    });
}

export function useWorkflowDraft(id: string | null) {
    return useQuery({
        queryKey: ['workflow-draft', id],
        queryFn: () => fetchDraft(id!),
        enabled: !!id,
        staleTime: 10000, // custom TTL (not a STALE tier)
    });
}

export interface ExecutionStats {
    workflowId: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
}

async function fetchExecutionStats(): Promise<{ stats: ExecutionStats[] }> {
    const response = await fetch(`${API_BASE}/execution-stats`);
    if (!response.ok) return { stats: [] };
    return response.json();
}

export function useExecutionStats() {
    return useQuery({
        queryKey: ['execution-stats'],
        queryFn: fetchExecutionStats,
        refetchInterval: 30000,
    });
}

// ============ Execution History ============

export interface ExecutionLog {
    id: string;
    workflowId: string;
    workflowName?: string;
    status: 'started' | 'executing' | 'completed' | 'error';
    triggerType: string;
    triggerPayload?: Record<string, any>;
    nodeExecutions?: Array<{
        nodeId: string;
        status: string;
        outputs?: Record<string, unknown>;
        error?: string;
    }>;
    result?: Record<string, unknown>;
    error?: string;
    engineId?: string;
    engineName?: string;
    engineUrl?: string;
    startedAt?: string;
    endedAt?: string;
}

async function fetchAllExecutions(params?: {
    limit?: number;
    status?: string;
    engine_name?: string;
    trigger_type?: string;
    fresh?: boolean;
}): Promise<{ executions: ExecutionLog[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.engine_name) searchParams.set('engine_name', params.engine_name);
    if (params?.trigger_type) searchParams.set('trigger_type', params.trigger_type);
    if (params?.fresh) searchParams.set('fresh', 'true');
    const qs = searchParams.toString();
    const response = await fetch(`${API_BASE}/executions${qs ? `?${qs}` : ''}`);
    if (!response.ok) throw new Error('Failed to fetch executions');
    return response.json();
}

export function useAllExecutions(params?: {
    limit?: number;
    status?: string;
    engine_name?: string;
    trigger_type?: string;
}) {
    return useQuery({
        queryKey: ['all-executions', params],
        queryFn: () => fetchAllExecutions(params),
        staleTime: STALE.STANDARD, // 5 minutes
    });
}

/** Refresh executions by pulling fresh from edges (bypasses L2 cache) */
export function useRefreshExecutions() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (params?: { limit?: number; status?: string; engine_name?: string; trigger_type?: string }) =>
            fetchAllExecutions({ ...params, fresh: true }),
        onSuccess: (data) => {
            queryClient.setQueryData(['all-executions', undefined], data);
        },
    });
}

// ── Lazy-load execution detail (on row expand) ──────────────────────────────

async function fetchExecutionDetail(executionId: string, engineUrl?: string): Promise<ExecutionLog> {
    const params = new URLSearchParams();
    if (engineUrl) params.set('engine_url', engineUrl);
    const qs = params.toString();
    const response = await fetch(`${API_BASE}/executions/detail/${executionId}${qs ? `?${qs}` : ''}`);
    if (!response.ok) throw new Error(`Failed to fetch execution detail: ${response.status}`);
    return response.json();
}

export function useExecutionDetail(executionId: string | null, engineUrl?: string) {
    return useQuery({
        queryKey: ['execution-detail', executionId],
        queryFn: () => fetchExecutionDetail(executionId!, engineUrl),
        enabled: !!executionId,
        staleTime: STALE.IMMUTABLE, // Execution details are immutable once completed
    });
}

/** Export executions as CSV — also refreshes the UI cache */
export function useExportExecutions() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (params: {
            engine_ids?: string;
            workflow_ids?: string;
            statuses?: string;
            date_from?: string;
            date_to?: string;
        }) => {
            const searchParams = new URLSearchParams();
            if (params.engine_ids) searchParams.set('engine_ids', params.engine_ids);
            if (params.workflow_ids) searchParams.set('workflow_ids', params.workflow_ids);
            if (params.statuses) searchParams.set('statuses', params.statuses);
            if (params.date_from) searchParams.set('date_from', params.date_from);
            if (params.date_to) searchParams.set('date_to', params.date_to);
            const qs = searchParams.toString();
            const response = await fetch(`${API_BASE}/executions/export${qs ? `?${qs}` : ''}`);
            if (!response.ok) throw new Error('Failed to export executions');
            const blob = await response.blob();
            // Trigger browser download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'execution_log.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
        onSuccess: () => {
            // Invalidate cache to refresh execution log UI with fresh data
            queryClient.invalidateQueries({ queryKey: ['all-executions'] });
        },
    });
}

async function fetchDraftExecutions(draftId: string, limit: number = 20): Promise<{ executions: ExecutionLog[]; total: number }> {
    const response = await fetch(`${API_BASE}/executions/${draftId}?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch draft executions');
    return response.json();
}

export function useDraftExecutions(draftId: string | null, limit: number = 20) {
    return useQuery({
        queryKey: ['draft-executions', draftId, limit],
        queryFn: () => draftId ? fetchDraftExecutions(draftId, limit) : null,
        enabled: !!draftId,
        refetchInterval: 10000,
    });
}

export function useCreateDraft() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createDraft,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
        },
    });
}

export function useUpdateDraft() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...input }: UpdateDraftInput & { id: string }) =>
            updateDraft(id, input),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
            queryClient.setQueryData(['workflow-draft', data.id], data);
        },
    });
}

export function useDeleteDraft() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteDraft,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
        },
    });
}

export function useBulkDeleteDrafts() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: bulkDeleteDrafts,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
        },
    });
}

export function usePublishDraft() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: publishDraft,
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
            queryClient.invalidateQueries({ queryKey: ['workflow-draft', id] });
        },
    });
}

export function usePublishDraftToEngine() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: publishDraftToEngine,
        onSuccess: (_, { draftId }) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
            queryClient.invalidateQueries({ queryKey: ['workflow-draft', draftId] });
        },
    });
}

export function usePublishDraftBatch() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: publishDraftBatch,
        onSuccess: (_, { draftId }) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
            queryClient.invalidateQueries({ queryKey: ['workflow-draft', draftId] });
        },
    });
}

export function useToggleTargetActive() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: toggleTargetActive,
        onSuccess: (_, { draftId }) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
            queryClient.invalidateQueries({ queryKey: ['workflow-draft', draftId] });
        },
    });
}

async function toggleDraftActive(
    { draftId, isActive }: { draftId: string; isActive: boolean }
): Promise<{ id: string; is_active: boolean }> {
    const response = await fetch(`${API_BASE}/drafts/${draftId}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to toggle active status');
    }
    return response.json();
}

export function useToggleDraftActive() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: toggleDraftActive,
        onSuccess: (_, { draftId }) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
            queryClient.invalidateQueries({ queryKey: ['workflow-draft', draftId] });
        },
    });
}

export function useTestDraft() {
    return useMutation({
        mutationFn: ({ id, parameters }: { id: string; parameters?: Record<string, any> }) =>
            testDraft(id, parameters),
    });
}

// Test single node
async function testNode(draftId: string, nodeId: string, parameters?: Record<string, any>): Promise<{ execution_id: string; status: string; message: string }> {
    const response = await fetch(`/api/actions/drafts/${draftId}/test-node/${nodeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Failed to test node: ${response.status}`);
    }
    return response.json();
}

export function useTestNode() {
    return useMutation({
        mutationFn: ({ draftId, nodeId, parameters }: { draftId: string; nodeId: string; parameters?: Record<string, any> }) =>
            testNode(draftId, nodeId, parameters),
    });
}

// Execution result fetching
async function getExecutionResult(executionId: string): Promise<{
    id: string;
    workflowId: string;
    status: 'started' | 'executing' | 'completed' | 'error';
    nodeExecutions: Array<{
        nodeId: string;
        status: string;
        outputs?: Record<string, unknown>;
        error?: string;
    }>;
    result?: Record<string, unknown>;
    error?: string;
}> {
    const response = await fetch(`/api/actions/execution/${executionId}`);
    if (!response.ok) {
        throw new Error(`Failed to get execution result: ${response.status}`);
    }
    return response.json();
}

export function useExecutionResult(executionId: string | null, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['execution-result', executionId],
        queryFn: () => executionId ? getExecutionResult(executionId) : null,
        enabled: !!executionId && options?.enabled !== false,
        refetchInterval: (query) => {
            // Poll every 500ms while executing, stop when complete
            const data = query.state.data;
            if (!data) return 500;
            if (data.status === 'completed' || data.status === 'error') return false;
            return 500;
        },
    });
}

// ============ Version History & Rollback ============

export interface AutomationVersion {
    id: string;
    automationId: string;
    versionNumber: number;
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig?: Record<string, any>;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    settings?: Record<string, any> | null;
    contentHash?: string;
    label?: string;
    createdAt: string;
    createdBy?: string;
}

async function fetchWorkflowVersions(draftId: string): Promise<{ success: boolean; data: AutomationVersion[] }> {
    const response = await fetch(`${API_BASE}/drafts/${draftId}/versions/`);
    if (!response.ok) throw new Error('Failed to fetch workflow versions');
    return response.json();
}

async function fetchWorkflowVersionDetail(draftId: string, versionId: string): Promise<{ success: boolean; data: AutomationVersion }> {
    const response = await fetch(`${API_BASE}/drafts/${draftId}/versions/${versionId}/`);
    if (!response.ok) throw new Error('Failed to fetch workflow version detail');
    return response.json();
}

async function createManualWorkflowVersion(
    { draftId, label }: { draftId: string; label?: string }
): Promise<{ success: boolean; data: AutomationVersion }> {
    const response = await fetch(`${API_BASE}/drafts/${draftId}/versions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
    });
    if (!response.ok) throw new Error('Failed to create workflow version');
    return response.json();
}

async function rollbackWorkflowToVersion(
    { draftId, versionId }: { draftId: string; versionId: string }
): Promise<{ success: boolean; message: string; data: { preRollbackVersionId: string; restoredVersionNumber: number } }> {
    const response = await fetch(`${API_BASE}/drafts/${draftId}/rollback/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: versionId }),
    });
    if (!response.ok) throw new Error('Failed to rollback workflow to version');
    return response.json();
}

export function useWorkflowVersions(draftId: string | null) {
    return useQuery({
        queryKey: ['workflow-versions', draftId],
        queryFn: () => fetchWorkflowVersions(draftId!),
        enabled: !!draftId,
        staleTime: STALE.STANDARD,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useWorkflowVersionDetail(draftId: string | null, versionId: string | null) {
    return useQuery({
        queryKey: ['workflow-version-detail', draftId, versionId],
        queryFn: () => fetchWorkflowVersionDetail(draftId!, versionId!),
        enabled: !!draftId && !!versionId,
        staleTime: STALE.IMMUTABLE,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useCreateManualWorkflowVersion() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createManualWorkflowVersion,
        onSuccess: (_, { draftId }) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-versions', draftId] });
        },
    });
}

export function useRollbackWorkflowToVersion() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: rollbackWorkflowToVersion,
        onSuccess: (_, { draftId }) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-versions', draftId] });
            queryClient.invalidateQueries({ queryKey: ['workflow-draft', draftId] });
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
        },
    });
}
