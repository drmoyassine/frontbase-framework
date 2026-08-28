import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';

const API_BASE = '';

// ============================================================================
// Types
// ============================================================================

export interface EdgeProviderAccount {
    id: string;
    provider: string; // 'cloudflare', 'vercel', etc.
    name: string;
    provider_credentials?: any;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface EdgeEngine {
    id: string;
    name: string;
    edge_provider_id: string | null;
    provider: string;
    adapter_type: string;
    url: string;
    is_imported?: boolean;
    edge_db_id: string | null;
    edge_db_name?: string;
    edge_cache_id: string | null;
    edge_cache_name?: string;
    edge_queue_id: string | null;
    edge_queue_name?: string;
    edge_vector_id: string | null;
    edge_vector_name?: string;
    edge_auth_id: string | null;
    datasource_ids?: string[];
    storage_ids?: string[];
    datasources?: { id: string; name: string; type: string }[];
    storages?: { id: string; name: string; provider: string }[];
    engine_config?: any;
    gpu_models?: {
        id: string;
        name: string;
        slug?: string;
        model_id?: string;
        model_type: string;
        endpoint_url: string | null;
    }[];
    is_active: boolean;
    is_system?: boolean;
    is_shared?: boolean;
    bundle_checksum?: string | null;
    config_checksum?: string | null;
    last_deployed_at?: string | null;
    last_synced_at?: string | null;
    sync_status?: 'synced' | 'stale' | 'unknown';
    is_outdated?: boolean;
    move_status?: string | null;   // null | 'moved_out' (pending portable move)
    moved_out_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface EdgeCache {
    id: string;
    name: string;
    provider: string; // 'upstash', 'redis', 'dragonfly'
    cache_url: string;
    has_token: boolean;
    is_default: boolean;
    is_system: boolean;
    provider_account_id?: string | null;
    account_name?: string | null;
    created_at: string;
    updated_at: string;
    engine_count: number;
    linked_engines?: { id: string; name: string; provider: string }[];
    supports_remote_delete?: boolean;
}

export interface EdgeQueue {
    id: string;
    name: string;
    provider: string; // 'qstash', 'rabbitmq', 'bullmq', 'sqs'
    queue_url: string;
    has_token: boolean;
    has_signing_key: boolean;
    is_default: boolean;
    is_system: boolean;
    created_at: string;
    updated_at: string;
    engine_count: number;
    linked_engines?: { id: string; name: string; provider: string }[];
    provider_account_id?: string | null;
    supports_remote_delete?: boolean;
}

export interface EdgeVector {
    id: string;
    name: string;
    provider: string; // 'pgvector', 'cloudflare_vectorize', 'turso_vector', 'embedded_lancedb'
    vector_url: string;
    has_token: boolean;
    is_default: boolean;
    is_system: boolean;
    provider_account_id?: string | null;
    account_name?: string | null;
    /** Provider-specific, non-secret config (dimensions, metric, table name, …). Already redacted server-side. */
    provider_config?: Record<string, any> | null;
    created_at: string;
    updated_at: string;
    engine_count: number;
    linked_engines?: { id: string; name: string; provider: string }[];
    supports_remote_delete?: boolean;
}

export interface BatchResult {
    success: string[];
    failed: { id: string; error: string }[];
    total: number;
}

// ============================================================================
// Key Rotation types (shared/community engines)
// ============================================================================

export interface RotationParams {
    strategy?: 'random' | 'hkdf';
    window_seconds?: number;
    dry_run?: boolean;
}

export interface RotationStatus {
    active: boolean;
    rotation_id?: string;
    strategy?: 'random' | 'hkdf';
    status?: string;
    started_at?: string;
    new_key_version?: number;
    old_key_version?: number;
    window_seconds?: number;
    remaining_seconds?: number | null;
    use_hkdf?: boolean;
    key_version?: number;
}

export interface RotationHistoryEntry {
    rotation_id: string;
    started_at: string;
    completed_at: string | null;
    strategy: 'random' | 'hkdf';
    old_key_version: number;
    new_key_version: number;
    tenants_affected: number;
    status: 'completed' | 'rolled_back' | 'expired' | 'transitioning';
    window_seconds: number;
}

// ============================================================================
// API Service
// ============================================================================

export const edgeInfrastructureApi = {
    // Providers
    getProviders: async (): Promise<EdgeProviderAccount[]> => {
        const res = await fetch(`${API_BASE}/api/edge-providers/`);
        if (!res.ok) throw new Error('Failed to fetch edge providers');
        return res.json();
    },
    createProvider: async (data: Partial<EdgeProviderAccount>): Promise<EdgeProviderAccount> => {
        const res = await fetch(`${API_BASE}/api/edge-providers/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create provider');
        return res.json();
    },
    updateProvider: async ({ id, data }: { id: string; data: Partial<EdgeProviderAccount> }): Promise<EdgeProviderAccount> => {
        const res = await fetch(`${API_BASE}/api/edge-providers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update provider');
        return res.json();
    },
    deleteProvider: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/edge-providers/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete provider');
    },

    // Engines
    getEngines: async (): Promise<EdgeEngine[]> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/`);
        if (!res.ok) throw new Error('Failed to fetch edge engines');
        return res.json();
    },
    createEngine: async (data: Partial<EdgeEngine>): Promise<EdgeEngine> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create engine');
        return res.json();
    },
    updateEngine: async ({ id, data }: { id: string; data: Partial<EdgeEngine> }): Promise<EdgeEngine> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update engine');
        return res.json();
    },
    deleteEngine: async (id: string, deleteRemote = false): Promise<void> => {
        const qs = deleteRemote ? '?delete_remote=true' : '';
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}${qs}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error('Failed to delete engine');
    },
    redeployEngine: async (id: string): Promise<any> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}/redeploy`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || 'Redeploy failed');
        }
        const result = await res.json();
        // Auto-sync manifest after redeploy to update GPU models + metadata
        try {
            await fetch(`${API_BASE}/api/edge-engines/${id}/sync-manifest`, { method: 'POST' });
        } catch {
            // Silent — manifest sync is best-effort
        }
        return result;
    },
    // ── Portable engine move ───────────────────────────────────────────────
    exportEngine: async (id: string, passphrase: string): Promise<{ bundle: string; engine_id: string; move_status: string }> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passphrase }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || 'Export failed');
        }
        return res.json();
    },
    importEngine: async (bundle: string, passphrase: string): Promise<{ engine_id: string; summary: any; confirm_secret: string }> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bundle, passphrase }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || 'Import failed');
        }
        return res.json();
    },
    finalizeMove: async (id: string, confirm_secret: string): Promise<{ finalized: boolean }> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}/finalize-move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm_secret }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || 'Finalize failed');
        }
        return res.json();
    },
    cancelMove: async (id: string): Promise<{ cancelled: boolean; engine: EdgeEngine }> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}/cancel-move`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || 'Cancel failed');
        }
        return res.json();
    },
    syncManifest: async (id: string): Promise<any> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}/sync-manifest`, { method: 'POST' });
        if (!res.ok) throw new Error('Manifest sync failed');
        return res.json();
    },

    // Batch Operations
    batchRedeploy: async (engine_ids: string[]): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/batch/redeploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine_ids }),
        });
        if (!res.ok) throw new Error('Batch redeploy failed');
        return res.json();
    },
    batchDelete: async (engine_ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine_ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete failed');
        return res.json();
    },
    batchToggle: async (engine_ids: string[], is_active: boolean): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/batch/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine_ids, is_active }),
        });
        if (!res.ok) throw new Error('Batch toggle failed');
        return res.json();
    },
    batchSyncCheck: async (engine_ids: string[]): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/batch/sync-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine_ids }),
        });
        if (!res.ok) throw new Error('Batch sync check failed');
        return res.json();
    },

    // Edge Databases
    getEdgeDatabases: async (): Promise<any[]> => {
        const res = await fetch(`${API_BASE}/api/edge-databases/`);
        if (!res.ok) throw new Error('Failed to fetch edge databases');
        return res.json();
    },

    // Edge Caches
    getEdgeCaches: async (): Promise<EdgeCache[]> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/`);
        if (!res.ok) throw new Error('Failed to fetch edge caches');
        return res.json();
    },
    createEdgeCache: async (data: Partial<EdgeCache> & { cache_token?: string }): Promise<EdgeCache> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create edge cache');
        return res.json();
    },
    updateEdgeCache: async ({ id, data }: { id: string; data: Partial<EdgeCache> & { cache_token?: string } }): Promise<EdgeCache> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update edge cache');
        return res.json();
    },
    deleteEdgeCache: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to delete edge cache');
        }
    },
    testEdgeCache: async (id: string): Promise<{ success: boolean; message: string; latency_ms?: number }> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/${id}/test`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to test cache connection');
        return res.json();
    },
    testEdgeCacheInline: async (data: { provider: string; cache_url: string; cache_token?: string }): Promise<{ success: boolean; message: string; latency_ms?: number }> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, name: 'test' }),
        });
        if (!res.ok) throw new Error('Failed to test cache connection');
        return res.json();
    },

    // Edge Queues
    getEdgeQueues: async (): Promise<EdgeQueue[]> => {
        const res = await fetch(`${API_BASE}/api/edge-queues/`);
        if (!res.ok) throw new Error('Failed to fetch edge queues');
        return res.json();
    },

    // Edge Vectors
    getEdgeVectors: async (): Promise<EdgeVector[]> => {
        const res = await fetch(`${API_BASE}/api/edge-vectors/`);
        if (!res.ok) throw new Error('Failed to fetch edge vectors');
        return res.json();
    },
    createEdgeVector: async (data: Partial<EdgeVector> & { vector_token?: string }): Promise<EdgeVector> => {
        const res = await fetch(`${API_BASE}/api/edge-vectors/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create edge vector store');
        return res.json();
    },
    updateEdgeVector: async ({ id, data }: { id: string; data: Partial<EdgeVector> & { vector_token?: string } }): Promise<EdgeVector> => {
        const res = await fetch(`${API_BASE}/api/edge-vectors/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update edge vector store');
        return res.json();
    },
    deleteEdgeVector: async (id: string, deleteRemote = false): Promise<void> => {
        const qs = deleteRemote ? '?delete_remote=true' : '';
        const res = await fetch(`${API_BASE}/api/edge-vectors/${id}${qs}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to delete edge vector store');
        }
    },
    testEdgeVector: async (id: string): Promise<{ success: boolean; message: string }> => {
        const res = await fetch(`${API_BASE}/api/edge-vectors/${id}/test`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to test vector store connection');
        return res.json();
    },
    testEdgeVectorInline: async (data: { provider: string; vector_url: string; vector_token?: string }): Promise<{ success: boolean; message: string }> => {
        const res = await fetch(`${API_BASE}/api/edge-vectors/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to test vector store connection');
        return res.json();
    },

    // Batch Operations — Databases
    batchDeleteDatabases: async (ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-databases/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete databases failed');
        return res.json();
    },

    // Batch Operations — Caches
    batchDeleteCaches: async (ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete caches failed');
        return res.json();
    },

    // Batch Operations — Queues
    batchDeleteQueues: async (ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-queues/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete queues failed');
        return res.json();
    },

    // Batch Operations — Vectors
    batchDeleteVectors: async (ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-vectors/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete vectors failed');
        return res.json();
    },

    // Key Rotation — shared/community engines (V2)
    rotateSecretsKey: async (engineId: string, params: RotationParams = {}): Promise<any> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${engineId}/rotate-secrets-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Rotation failed');
        }
        return res.json();
    },

    batchRotateSecretsKey: async (engineIds: string[], params: RotationParams = {}): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/batch/rotate-secrets-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine_ids: engineIds, ...params }),
        });
        if (!res.ok) throw new Error('Batch rotation failed');
        return res.json();
    },

    rollbackRotation: async (engineId: string, rotationId: string): Promise<any> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${engineId}/rollback-rotation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rotation_id: rotationId }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Rollback failed');
        }
        return res.json();
    },

    getRotationHistory: async (engineId: string): Promise<{ history: RotationHistoryEntry[] }> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${engineId}/rotation-history`);
        if (!res.ok) throw new Error('Failed to fetch rotation history');
        return res.json();
    },

    getRotationStatus: async (engineId: string): Promise<RotationStatus> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${engineId}/rotation-status`);
        if (!res.ok) throw new Error('Failed to fetch rotation status');
        return res.json();
    },
};

// ============================================================================
// React Query Hooks (AGENTS.md Compliant)
// ============================================================================

export function useEdgeProviders() {
    return useQuery({
        queryKey: ['edge-providers'],
        queryFn: edgeInfrastructureApi.getProviders,
        staleTime: STALE.STANDARD,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useEdgeEngines() {
    return useQuery({
        queryKey: ['edge-engines'],
        queryFn: edgeInfrastructureApi.getEngines,
        staleTime: STALE.STANDARD,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useEdgeDatabases() {
    return useQuery({
        queryKey: ['edge-databases'],
        queryFn: edgeInfrastructureApi.getEdgeDatabases,
        staleTime: STALE.STANDARD,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useEdgeCaches() {
    return useQuery({
        queryKey: ['edge-caches'],
        queryFn: edgeInfrastructureApi.getEdgeCaches,
        staleTime: STALE.STANDARD,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useEdgeQueues() {
    return useQuery({
        queryKey: ['edge-queues'],
        queryFn: edgeInfrastructureApi.getEdgeQueues,
        staleTime: STALE.STANDARD,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useEdgeVectors() {
    return useQuery({
        queryKey: ['edge-vectors'],
        queryFn: edgeInfrastructureApi.getEdgeVectors,
        staleTime: STALE.STANDARD,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}


// ============================================================================
// API Keys
// ============================================================================

export interface EdgeAPIKey {
    id: string;
    name: string;
    prefix: string;
    edge_engine_id: string | null;
    engine_name: string | null;
    is_active: boolean;
    expires_at: string | null;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
    can_reveal: boolean;
    key?: string;  // Only present at creation
}

export function useEdgeAPIKeys(engineId?: string) {
    return useQuery({
        queryKey: ['edge-api-keys', engineId ?? 'all'],
        queryFn: async (): Promise<EdgeAPIKey[]> => {
            const params = engineId ? `?engine_id=${engineId}` : '';
            const res = await fetch(`${API_BASE}/api/edge-api-keys${params}`);
            if (!res.ok) throw new Error('Failed to fetch API keys');
            const data = await res.json();
            return data.keys;
        },
        staleTime: STALE.STANDARD,
    });
}

// ─── Health Check ───────────────────────────────────────────────────────────

export interface BindingStatus {
    provider: string;
    status: 'ok' | 'error' | 'not_configured';
    error?: string;
    schema?: string;
}

export interface HealthCheckResponse {
    status: string;
    service?: string;
    version?: string;
    provider?: string;
    uptime_seconds?: number;
    timestamp?: string;
    error?: string;
    bindings?: {
        stateDb: BindingStatus;
        cache: BindingStatus;
        queue: BindingStatus;
    };
    resilience?: {
        stateDb?: { level: string; reason?: string; since?: string; ops?: number };
        cache?: { level: string; reason?: string; since?: string; ops?: number };
    };
}

export function useEngineHealthCheck(engineId: string) {
    return useMutation<HealthCheckResponse, Error>({
        mutationKey: ['engine-health-check', engineId],
        mutationFn: async () => {
            const res = await fetch(`${API_BASE}/api/edge-engines/${engineId}/health-check`);
            if (!res.ok) throw new Error('Health check request failed');
            return res.json();
        },
    });
}

// ─── Key Rotation ────────────────────────────────────────────────────────────

export function useRotationStatus(engineId: string | null | undefined) {
    return useQuery({
        queryKey: ['rotation-status', engineId],
        queryFn: () => edgeInfrastructureApi.getRotationStatus(engineId!),
        staleTime: 60 * 1000,
        // Poll every 30s only while a transition window is active.
        refetchInterval: (query) => (query.state.data?.active ? 30_000 : false),
        enabled: !!engineId,
    });
}

export function useRotationHistory(engineId: string | null | undefined) {
    return useQuery({
        queryKey: ['rotation-history', engineId],
        queryFn: () => edgeInfrastructureApi.getRotationHistory(engineId!),
        staleTime: 5 * 60 * 1000,
        enabled: !!engineId,
    });
}

export function useRotateSecretsKey() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ engineId, params }: { engineId: string; params?: RotationParams }) =>
            edgeInfrastructureApi.rotateSecretsKey(engineId, params),
        onSuccess: (_data, { engineId }) => {
            queryClient.invalidateQueries({ queryKey: ['rotation-status', engineId] });
            queryClient.invalidateQueries({ queryKey: ['rotation-history', engineId] });
            queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
        },
    });
}

export function useRollbackRotation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ engineId, rotationId }: { engineId: string; rotationId: string }) =>
            edgeInfrastructureApi.rollbackRotation(engineId, rotationId),
        onSuccess: (_data, { engineId }) => {
            queryClient.invalidateQueries({ queryKey: ['rotation-status', engineId] });
            queryClient.invalidateQueries({ queryKey: ['rotation-history', engineId] });
            queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
        },
    });
}
